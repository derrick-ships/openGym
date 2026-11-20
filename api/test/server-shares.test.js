import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const API = fileURLToPath(new URL('..', import.meta.url));
const SECRET = crypto.randomBytes(32).toString('hex');
const OWNER = 'share_owner';
const OTHER = 'share_other';
const SNAPSHOT = {
  v: 1, kind: 'workout', title: 'Leg day', date: '2026-11-19', unit: 'kg', accent: '#c4a000',
  body: 'female', load: { quadriceps: 1 }, entries: []
};
const INPUT = { kind: 'workout', snapshot: { ...SNAPSHOT, title: ' Leg day ' } };
const SHARE_ID = /^[A-Za-z0-9]{12}$/;

function sessionHeaders(uid) {
  if (!uid) return {};
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return { Cookie: `gymsid=${payload}.${sig}` };
}

async function startServer(t, { prepare, env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-shares-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: OWNER, name: 'Owner' }, { id: OTHER, name: 'Other' }], creds: [], subs: [], invites: []
  }));
  prepare?.(dataDir);
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  const api = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', AUDIT_LOG: '1', ...env }
  });
  let log = '';
  child.stdout.on('data', d => log += d);
  child.stderr.on('data', d => log += d);
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGKILL');
      await exit;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  let up = false;
  for (let i = 0; i < 100 && !up && child.exitCode === null; i++) {
    try { up = (await fetch(`${api}/api/health`)).status < 500; } catch { /* not listening yet */ }
    if (!up) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(up, `server never came up:\n${log}`);
  const request = async (route, { uid, body, headers } = {}) => {
    const response = await fetch(`${api}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...sessionHeaders(uid), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  return { api, dataDir, request };
}

const create = (h, uid = OWNER, body = INPUT) => h.request('/api/shares', { uid, body });
const list = (h, uid = OWNER) => h.request('/api/shares', { uid });
const revoke = (h, id, uid = OWNER) => h.request('/api/shares/revoke', { uid, body: { id } });

test('share create → anonymous read → owner list → revoke, with private durable files', async t => {
  const h = await startServer(t);
  const dir = path.join(h.dataDir, 'shares');
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual((await list(h)).body, { shares: [] });
  const created = await create(h);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const { id, createdAt } = created.body;
  assert.match(id, SHARE_ID);
  assert.equal(new Date(createdAt).toISOString(), createdAt);
  assert.deepEqual(created.body, { id, url: `/s/${id}`, createdAt });
  const file = path.join(dir, `${id}.json`);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { id, uid: OWNER, kind: 'workout', createdAt, snapshot: SNAPSHOT });

  const publicRead = await h.request(`/api/shares/${id}`);
  assert.equal(publicRead.status, 200);
  assert.deepEqual(publicRead.body, { id, kind: 'workout', createdAt, snapshot: SNAPSHOT });
  assert.equal(publicRead.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(publicRead.headers.get('x-robots-tag'), 'noindex');
  assert.equal(publicRead.headers.has('set-cookie'), false);

  const routine = { ...SNAPSHOT, kind: 'routine', title: 'Full body' };
  const later = await create(h, OWNER, { kind: 'routine', snapshot: routine });
  assert.equal(later.status, 201);
  assert.deepEqual((await list(h)).body, { shares: [
    { id: later.body.id, kind: 'routine', title: 'Full body', createdAt: later.body.createdAt },
    { id, kind: 'workout', title: 'Leg day', createdAt }
  ] });
  const revoked = await revoke(h, id);
  assert.equal(revoked.status, 200);
  assert.deepEqual(revoked.body, { ok: true });
  assert.equal(fs.existsSync(file), false);
  const missing = await h.request(`/api/shares/${id}`);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'not_found' });
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await list(h)).body.shares.map(s => s.id), [later.body.id]);
  assert.equal((await revoke(h, id)).status, 404);

  const audit = fs.readFileSync(path.join(h.dataDir, 'audit.log'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(audit.filter(row => row.ev.startsWith('share.')).map(({ ev, uid }) => [ev, uid]), [
    ['share.create', OWNER], ['share.create', OWNER], ['share.revoke', OWNER]
  ]);
});

test('shares enforce session auth, ownership, CSRF, and ID validation', async t => {
  const h = await startServer(t);
  assert.equal((await h.request('/api/shares', { body: INPUT })).status, 401);
  assert.equal((await h.request('/api/shares')).status, 401);
  assert.equal((await h.request('/api/shares/revoke', { body: { id: 'aaaaaaaaaaaa' } })).status, 401);
  assert.equal((await h.request('/api/shares', { uid: OWNER, body: INPUT, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await h.request('/api/shares/too-short')).status, 400);
  assert.equal((await h.request('/api/shares/a%2Fb')).status, 400);
  assert.equal((await h.request('/api/shares/AbCd12345678')).status, 404);
  assert.equal((await create(h, OWNER, { ...INPUT, snapshot: { ...SNAPSHOT, uid: OWNER } })).status, 400);

  const { body: { id }, status } = await create(h);
  assert.equal(status, 201);
  assert.equal((await list(h, OTHER)).status, 200);
  assert.deepEqual((await list(h, OTHER)).body, { shares: [] });
  const notOwned = await revoke(h, id, OTHER);
  assert.equal(notOwned.status, 404);
  assert.deepEqual(notOwned.body, { error: 'not_found' });
  assert.equal((await h.request('/api/shares/revoke', { uid: OWNER, body: { id }, headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await h.request(`/api/shares/${id}`)).status, 200);
});

test('share create responds 413 to oversized fixed-length and chunked JSON bodies', async t => {
  const h = await startServer(t);
  const huge = { ...INPUT, snapshot: { ...SNAPSHOT, aiText: 'x'.repeat(256 * 1024) } };
  const fixed = await create(h, OWNER, huge);
  assert.equal(fixed.status, 413, JSON.stringify(fixed.body));
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(`${h.api}/api/shares`, {
      method: 'POST', headers: { ...sessionHeaders(OWNER), 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }
    }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    const text = JSON.stringify(huge);
    req.write(text.slice(0, 128 * 1024));
    req.end(text.slice(128 * 1024));
  });
  assert.equal(chunked, 413);
  assert.deepEqual((await list(h)).body, { shares: [] });
});

test('share create returns 409 at 200 shares; it does not delete the oldest', async t => {
  const oldest = '000000000000';
  const seed = (dataDir, n) => {
    const dir = path.join(dataDir, 'shares');
    fs.mkdirSync(dir, { mode: 0o700 });
    for (let i = 0; i < n; i++) {
      const id = String(i).padStart(12, '0');
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
        id, uid: OWNER, kind: 'workout', createdAt: new Date(i).toISOString(), snapshot: SNAPSHOT
      }), { mode: 0o600 });
    }
  };
  const h = await startServer(t, { prepare: dataDir => seed(dataDir, 199) });
  const lastSlot = await create(h);
  assert.equal(lastSlot.status, 201);
  const limited = await create(h);
  assert.equal(limited.status, 409);
  assert.deepEqual(limited.body, { error: 'share_limit' });
  assert.equal((await list(h)).body.shares.length, 200);
  assert.equal((await h.request(`/api/shares/${oldest}`)).status, 200);
  assert.equal((await create(h, OTHER)).status, 201);
  assert.equal((await revoke(h, oldest)).status, 200);
  assert.equal((await create(h)).status, 201);
});

test('share create limits each account to 30 successful creates per hour', async t => {
  const h = await startServer(t);
  for (let i = 0; i < 30; i++) assert.equal((await create(h)).status, 201, `create ${i + 1}`);
  assert.equal((await create(h)).status, 429);
  assert.equal((await create(h, OTHER)).status, 201);
  assert.equal((await list(h)).body.shares.length, 30);
});

test('share routes return 503 when storage is unavailable or corrupt', async t => {
  const h = await startServer(t, { prepare: dataDir => fs.writeFileSync(path.join(dataDir, 'shares'), '') });
  const id = 'aaaaaaaaaaaa';
  for (const result of [await create(h), await list(h), await revoke(h, id), await h.request(`/api/shares/${id}`)]) {
    assert.equal(result.status, 503);
    assert.ok(['storage_unavailable', 'storage_corrupt'].includes(result.body.error));
  }

  const dir = path.join(h.dataDir, 'shares');
  fs.unlinkSync(dir);
  fs.mkdirSync(dir, { mode: 0o700 });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({
    id, uid: OWNER, kind: 'workout', createdAt: ['2026-11-19'], snapshot: SNAPSHOT
  }));
  const corrupt = await h.request(`/api/shares/${id}`);
  assert.equal(corrupt.status, 503);
  assert.equal(corrupt.body.error, 'storage_corrupt');
  assert.equal(corrupt.headers.get('cache-control'), 'no-store');
});
