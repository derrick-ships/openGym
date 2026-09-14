#!/usr/bin/env node
/*
 * Disposable acceptance harness for the MCP capability surface.
 *
 * It starts the API and Streamable HTTP gateway against a temporary data directory and uses
 * direct bearer grants created only in that directory. No production URL, /opt/opengym mount,
 * browser session, or real credential is read. Mutations are made through the MCP SDK; API calls
 * are limited to security/precondition/image-boundary checks that are not MCP tools themselves.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { EXDB } from '../frontend/src/lib/exercises-data.js'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const requireApi = createRequire(path.join(ROOT, 'api', 'package.json'))
const sharp = requireApi('sharp')
// The repository keeps the MCP gateway's dependency tree under mcp/. This harness lives beside
// the API scripts, so resolve the SDK from that package rather than requiring a root install.
const mcpSdkRoot = path.join(ROOT, 'mcp/node_modules/@modelcontextprotocol/sdk/dist/esm')
const { Client } = await import(pathToFileURL(path.join(mcpSdkRoot, 'client/index.js')).href)
const { StreamableHTTPClientTransport } = await import(pathToFileURL(path.join(mcpSdkRoot, 'client/streamableHttp.js')).href)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opengym-mcp-capabilities-'))
const secret = 'mcp-capabilities-staging-secret'
const uid = 'cap-user-a'
const otherUid = 'cap-user-b'
const fullToken = 'mcp-capabilities-full-token'
const readToken = 'mcp-capabilities-read-token'
const otherToken = 'mcp-capabilities-other-token'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

const print = (label, value) => console.log(`${label}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
const assertStatus = (result, expected, label) => {
  assert.equal(result.response.status, expected, `${label}: HTTP ${result.response.status}`)
  return result
}
const bearer = token => ({ Authorization: `Bearer ${token}` })
const tokenFor = id => {
  const payload = `${id}:${Date.now() + 3600000}:0`
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}
const userSession = tokenFor(uid)
const otherSession = tokenFor(otherUid)
const digestBase64Url = value => crypto.createHash('sha256').update(String(value)).digest('base64url')

const stateFixture = (name, extra = {}) => ({
  unit: 'kg', restSec: 90,
  routines: [{ id: 'r-base', name, emoji: 'figureStrength', ex: [{ id: '0001', sets: 3, reps: 5, weight: 50 }] }],
  week: { 1: ['r-base'] }, dayPlan: {},
  workouts: [{
    id: `${name}-workout`, d: '2026-09-06', start: 1000, end: 2500,
    entries: [{ id: '0001', target: { sets: 1, reps: 5 }, sets: [{ w: 50, r: 5, done: true, rir: 0, rpe: 0 }] }]
  }],
  bodyweight: [], targetW: null, active: null, customEx: [], exWeights: {}, equipProfiles: [],
  ...extra
})

const writeJson = (name, value) => fs.writeFileSync(path.join(tmp, name), JSON.stringify(value, null, 2))
writeJson('db.json', { users: [{ id: uid, name: 'Capabilities A' }, { id: otherUid, name: 'Capabilities B' }], creds: [], subs: [], invites: [] })
writeJson(`state-${uid}.json`, stateFixture('Capabilities A'))
writeJson(`state-${otherUid}.json`, stateFixture('Capabilities B', { routines: [{ id: 'other-routine', name: 'Other only', ex: [] }] }))
writeJson('mcp-grants.json', { grants: [
  {
    id: 'cap-full', uid, name: 'capabilities full fixture',
    scopes: [
      'exercise:read', 'routine:read', 'workout:read', 'bodyweight:read', 'progress:read',
      'workout:write', 'routine:propose', 'exercise:write', 'routine:write', 'image:write',
      'equipment:read', 'equipment:write', 'plan:write'
    ], tokenHash: hash(fullToken), created: new Date().toISOString(), expires: Date.now() + 3600000
  },
  {
    id: 'cap-read', uid, name: 'capabilities read fixture', scopes: ['exercise:read', 'routine:read'],
    tokenHash: hash(readToken), created: new Date().toISOString(), expires: Date.now() + 3600000
  },
  {
    id: 'cap-other', uid: otherUid, name: 'capabilities other fixture', scopes: ['routine:read'],
    tokenHash: hash(otherToken), created: new Date().toISOString(), expires: Date.now() + 3600000
  }
] })
fs.writeFileSync(path.join(tmp, 'secret'), secret, { mode: 0o600 })

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(`process exited before readiness: ${output}`)
    if (output.includes('gym-api on') || output.includes('Streamable HTTP on')) return child
    await wait(30)
  }
  throw new Error(`process did not become ready: ${output}`)
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  for (let attempt = 0; attempt < 60 && child.exitCode === null; attempt++) await wait(20)
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function request(base, endpoint, options = {}) {
  const response = await fetch(base + endpoint, { ...options, headers: { ...(options.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

async function rawRequest(base, endpoint, options = {}) {
  const response = await fetch(base + endpoint, { ...options, headers: { ...(options.headers || {}) } })
  return { response, bytes: Buffer.from(await response.arrayBuffer()) }
}

const jsonBody = (value, headers = {}) => ({
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value)
})

async function solidImage() {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: { r: 42, g: 108, b: 170 } } })
    .png({ compressionLevel: 9 }).toBuffer()
}

async function largeImage() {
  // Random RGB pixels prevent PNG compression from making a deceptively tiny fixture. The raw
  // pixel payload is intentionally above 1.5 MiB, while the normalized server output remains
  // within its normal image quota/output limits.
  const width = 900; const height = 700
  const pixels = crypto.randomBytes(width * height * 3)
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer()
}

// A disposable proxy makes an accidental OAuth discovery/exchange visible while the real SDK
// client still exercises the same remote Streamable HTTP gateway and session handling. OAuth is
// allowed here only for the later fresh-DCR consent fixture; bearer clients must not need it.
async function startBearerProxy(targetBase, { blockOAuth = false } = {}) {
  const target = new URL(targetBase)
  const oauthAttempts = []
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, targetBase)
    const isOAuth = parsed.pathname.startsWith('/api/oauth/') || parsed.pathname.startsWith('/oauth/') || parsed.pathname.startsWith('/.well-known/')
    if (isOAuth) oauthAttempts.push(parsed.pathname)
    if (isOAuth && blockOAuth) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify({ error: 'OAuth is disabled in bearer-only staging' }))
    }
    const upstream = http.request({
      hostname: target.hostname, port: target.port, method: req.method,
      path: parsed.pathname + parsed.search,
      headers: { ...req.headers, host: `${target.hostname}:${target.port}` }
    }, response => {
      res.writeHead(response.statusCode || 502, response.headers)
      response.pipe(res)
    })
    upstream.on('error', error => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    })
    req.pipe(upstream)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return { base: `http://127.0.0.1:${address.port}`, oauthAttempts, server }
}

function mcpPayload(result, label) {
  assert.notEqual(result?.isError, true, `${label}: ${result?.content?.[0]?.text || 'MCP tool error'}`)
  const text = result?.content?.find(block => block.type === 'text')?.text || '{}'
  try { return JSON.parse(text) } catch (error) { throw new Error(`${label}: invalid MCP JSON result (${error.message})`) }
}

function mcpErrorText(result) {
  return result?.content?.find(block => block.type === 'text')?.text || ''
}

async function connectClient(base, token, name) {
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  })
  const client = new Client({ name, version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)
  const listing = await client.listTools()
  assert.ok(Array.isArray(listing.tools), `${name}: tools/list returned no tools`)
  return { client, transport, listing }
}

async function closeClient(entry) {
  if (!entry) return
  await entry.client.close().catch(() => {})
  await entry.transport.close().catch(() => {})
}

async function main() {
  let apiChild = null
  let gatewayChild = null
  let proxy = null
  let apiBase = ''
  let gatewayBase = ''
  const clients = []
  try {
    const apiPort = await freePort()
    apiBase = `http://127.0.0.1:${apiPort}`
    apiChild = await start('node', ['api/server.js'], {
      PORT: apiPort, DATA_DIR: tmp, RP_ID: 'localhost', ORIGIN: 'http://localhost',
      MCP_ENABLED: '1', MCP_PROPOSALS_ENABLED: '1', CUSTOM_IMAGES_ENABLED: '1', AUDIT_LOG: '0'
    })
    proxy = await startBearerProxy(apiBase)
    const gatewayPort = await freePort()
    gatewayBase = `http://127.0.0.1:${gatewayPort}`
    const stagingResource = 'https://gym.staging.example/mcp'
    gatewayChild = await start('node', ['mcp/src/http.js'], {
      MCP_PORT: gatewayPort, OPENGYM_API: proxy.base,
      MCP_PUBLIC_URL: stagingResource, MCP_CORS_ORIGIN: 'http://127.0.0.1'
    })

    const local = await connectClient(gatewayBase, fullToken, 'capabilities-local-client')
    const hosted = await connectClient(gatewayBase, fullToken, 'capabilities-hosted-client')
    const readOnly = await connectClient(gatewayBase, readToken, 'capabilities-read-only-client')
    clients.push(local, hosted, readOnly)
    print('MCP_CAPABILITIES_CLIENT_LOCAL', 'connected via isolated Streamable HTTP gateway')
    print('MCP_CAPABILITIES_CLIENT_HOSTED', 'connected via isolated gateway as hosted-client fixture')
    assert.equal(proxy.oauthAttempts.length, 0, 'bearer clients unexpectedly attempted OAuth')

    const fullToolNames = new Set(local.listing.tools.map(tool => tool.name))
    const readToolNames = new Set(readOnly.listing.tools.map(tool => tool.name))
    const toolByName = name => local.listing.tools.find(tool => tool.name === name)
    const assertChangeSchema = (toolName, keys) => {
      const changes = toolByName(toolName)?.inputSchema?.properties?.changes
      assert.equal(changes?.type, 'object', `${toolName} changes must be an object schema`)
      assert.equal(changes?.additionalProperties, false, `${toolName} changes must not be opaque additionalProperties`)
      for (const key of keys) assert.ok(changes.properties?.[key], `${toolName} changes missing canonical key ${key}`)
    }
    for (const required of [
      'list_exercises', 'get_exercise', 'list_routines', 'get_routine', 'get_week_plan',
      'get_workout', 'list_equipment_profiles', 'create_routine', 'edit_routine',
      'create_custom_exercise', 'edit_custom_exercise', 'upload_exercise_image',
      'create_equipment_profile', 'edit_equipment_profile', 'update_week_plan'
    ]) assert.ok(fullToolNames.has(required), `full grant missing MCP tool ${required}`)
    assertChangeSchema('edit_routine', ['name', 'emoji', 'prog', 'excludeFromProgression', 'ex'])
    assertChangeSchema('edit_custom_exercise', ['name', 'body_part', 'equipment', 'description', 'primary_muscles', 'secondary_muscles', 'muscle_groups', 'instructions', 'icon'])
    assertChangeSchema('edit_equipment_profile', ['name', 'equipment'])
    print('MCP_CAPABILITIES_EDIT_SCHEMAS', {
      edit_routine: ['name', 'emoji', 'prog', 'excludeFromProgression', 'ex'],
      edit_custom_exercise: ['name', 'body_part', 'equipment', 'description', 'primary_muscles', 'secondary_muscles', 'muscle_groups', 'instructions', 'icon'],
      edit_equipment_profile: ['name', 'equipment'], opaque_changes_rejected: true
    })
    assert.equal(readToolNames.has('create_routine'), false, 'read-only grant exposed create_routine')
    assert.equal(readToolNames.has('create_custom_exercise'), false, 'read-only grant exposed create_custom_exercise')
    const insufficient = await request(apiBase, '/api/mcp/revision?scope=routine:write', { headers: bearer(readToken) })
    assertStatus(insufficient, 403, 'insufficient scope revision')
    const crossUser = await request(apiBase, `/api/mcp/state?scope=routine:read&uid=${otherUid}`, { headers: bearer(fullToken) })
    assertStatus(crossUser, 403, 'cross-user state request')
    print('MCP_CAPABILITIES_INSUFFICIENT_SCOPE', { read_only_writer_hidden: true, api_status: insufficient.response.status })
    print('MCP_CAPABILITIES_CROSS_USER_DENIED', { api_status: crossUser.response.status })
    print('MCP_CAPABILITIES_BEARER_NO_OAUTH', { oauth_requests_before_consent: proxy.oauthAttempts.length })

    // Dynamic client registration without an explicit scope must still present every intended
    // write scope at consent. This reproduces a fresh client, not an already seeded grant, and
    // then proves the resulting access token exposes the writer tools. The existing fixture grants
    // are snapshotted so registration cannot silently rewrite or broaden them.
    const existingGrantsBeforeOAuth = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp-grants.json'), 'utf8')).grants
      .map(grant => ({ ...grant }))
    const redirectUri = 'http://127.0.0.1:49999/capabilities-callback'
    const dcr = assertStatus(await request(gatewayBase, '/oauth/register', {
      ...jsonBody({
        client_name: 'Fresh capabilities DCR', redirect_uris: [redirectUri],
        grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none'
      })
    }), 201, 'fresh dynamic client registration').data
    assert.ok(dcr.client_id)
    assert.equal(dcr.token_endpoint_auth_method, 'none')
    const verifier = crypto.randomBytes(48).toString('base64url')
    const challenge = digestBase64Url(verifier)
    const dcrState = 'capabilities-dcr-state'
    const authorizationUrl = new URL('/oauth/authorize', gatewayBase)
    for (const [key, value] of [
      ['response_type', 'code'], ['client_id', dcr.client_id], ['redirect_uri', redirectUri],
      ['code_challenge', challenge], ['code_challenge_method', 'S256'],
      ['resource', stagingResource], ['state', dcrState]
    ]) authorizationUrl.searchParams.set(key, value)
    const authorizeGet = await fetch(authorizationUrl, { headers: { Cookie: `gymsid=${userSession}`, Accept: 'text/html' } })
    assert.equal(authorizeGet.status, 200, `fresh DCR consent page: HTTP ${authorizeGet.status}`)
    const consentHtml = await authorizeGet.text()
    const csrf = /name="csrf" value="([^"]+)"/.exec(consentHtml)?.[1]
    assert.ok(csrf, 'fresh DCR consent page did not include CSRF token')
    const consentScopes = [...consentHtml.matchAll(/name="scope" value="([^"]+)"/g)].map(match => match[1])
    const intendedWriteScopes = ['routine:write', 'exercise:write', 'image:write', 'equipment:write', 'plan:write']
    const intendedReadScopes = ['exercise:read', 'routine:read', 'workout:read', 'bodyweight:read', 'progress:read']
    for (const scope of intendedWriteScopes) assert.ok(consentScopes.includes(scope), `fresh DCR consent missing ${scope}`)
    for (const scope of intendedReadScopes) assert.ok(consentScopes.includes(scope), `fresh DCR consent missing ${scope}`)
    const consentForm = new URLSearchParams({
      csrf, client_id: dcr.client_id, redirect_uri: redirectUri, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', resource: stagingResource, state: dcrState,
      decision: 'allow'
    })
    for (const scope of consentScopes) consentForm.append('scope', scope)
    const authorizePost = await fetch(`${gatewayBase}/oauth/authorize`, {
      method: 'POST', redirect: 'manual', headers: { Cookie: `gymsid=${userSession}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: consentForm
    })
    const authorizePostText = await authorizePost.text()
    if (authorizePost.status !== 302) print('MCP_CAPABILITIES_DEBUG_OAUTH_POST', authorizePostText)
    assert.equal(authorizePost.status, 302, `fresh DCR consent allow: HTTP ${authorizePost.status}`)
    const callback = new URL(authorizePost.headers.get('location'))
    assert.ok(callback.searchParams.get('code'))
    assert.equal(callback.searchParams.get('state'), dcrState)
    const tokenForm = new URLSearchParams({
      grant_type: 'authorization_code', code: callback.searchParams.get('code'), client_id: dcr.client_id,
      redirect_uri: redirectUri, resource: stagingResource, code_verifier: verifier
    })
    const tokenResponse = assertStatus(await request(gatewayBase, '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenForm
    }), 200, 'fresh DCR token exchange').data
    assert.ok(tokenResponse.access_token)
    assert.equal(tokenResponse.token_type, 'Bearer')
    for (const scope of intendedWriteScopes) assert.ok(String(tokenResponse.scope).split(/\s+/).includes(scope), `fresh DCR token missing ${scope}`)
    for (const scope of intendedReadScopes) assert.ok(String(tokenResponse.scope).split(/\s+/).includes(scope), `fresh DCR token missing ${scope}`)
    const oauthClient = await connectClient(gatewayBase, tokenResponse.access_token, 'fresh-dcr-capability-client')
    clients.push(oauthClient)
    const oauthToolNames = new Set(oauthClient.listing.tools.map(tool => tool.name))
    for (const writer of ['create_routine', 'edit_routine', 'create_custom_exercise', 'edit_custom_exercise', 'upload_exercise_image', 'create_equipment_profile', 'edit_equipment_profile', 'update_week_plan']) {
      assert.ok(oauthToolNames.has(writer), `fresh DCR token missing writer ${writer}`)
    }
    for (const reader of ['list_exercises', 'list_routines', 'list_workouts', 'get_bodyweight', 'get_routine']) {
      assert.ok(oauthToolNames.has(reader), `fresh DCR token missing reader ${reader}`)
    }
    const oauthRead = mcpPayload(await oauthClient.client.callTool({ name: 'get_routine', arguments: { routine_id: 'r-base' } }), 'fresh DCR read before edit')
    const oauthEdit = mcpPayload(await oauthClient.client.callTool({
      name: 'edit_routine',
      arguments: {
        routine_id: 'r-base', changes: { name: 'OAuth DCR read-edit proof' },
        revision: oauthRead.revision, request_id: 'cap-oauth-read-edit-1'
      }
    }), 'fresh DCR conditional edit')
    assert.equal(oauthEdit.routine.id, 'r-base')
    assert.equal(oauthEdit.routine.name, 'OAuth DCR read-edit proof')
    const existingGrantsAfterOAuth = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp-grants.json'), 'utf8')).grants
    for (const before of existingGrantsBeforeOAuth) assert.deepEqual(existingGrantsAfterOAuth.find(grant => grant.id === before.id), before, `existing grant changed during fresh DCR: ${before.id}`)
    assert.equal(existingGrantsAfterOAuth.length, existingGrantsBeforeOAuth.length + 1)
    print('MCP_CAPABILITIES_FRESH_DCR_CONSENT', {
      explicit_scope_at_registration: false, consent_scopes: consentScopes,
      explicit_scope_at_authorize: false, read_scopes: intendedReadScopes,
      token_exchange: 'authorization_code + PKCE', reader_tools_available: true, writer_tools_available: true,
      read_then_conditional_edit: { read_routine: 'r-base', edited_name: oauthEdit.routine.name },
      existing_grants_unchanged: true, new_grant_only: true, oauth_requests: proxy.oauthAttempts.length
    })

    // Create a custom exercise first so the routine round-trip proves the MCP-created custom ID
    // can be used by a later routine mutation, not only by the catalogue endpoint.
    const createdExerciseResult = await local.client.callTool({
      name: 'create_custom_exercise',
      arguments: {
        exercise: {
          name: 'MCP Capability Press', body_part: 'chest', equipment: 'body weight',
          description: 'Controlled capability fixture exercise.',
          primary_muscles: ['chest'], secondary_muscles: ['triceps', 'deltoids'],
          muscle_groups: ['chest', 'triceps'],
          instructions: ['Set the shoulders down and back.', 'Press with a steady tempo.', 'Return under control.'],
          icon: 'stretch'
        }, request_id: 'cap-exercise-create-1'
      }
    })
    const createdExercise = mcpPayload(createdExerciseResult, 'create_custom_exercise')
    const exerciseId = createdExercise.exercise?.id
    assert.ok(exerciseId, 'created exercise did not return a stable id')
    assert.equal(createdExercise.exercise.custom, true)
    assert.equal(createdExercise.exercise.bp, 'chest')
    assert.equal(createdExercise.exercise.eq, 'body weight')
    assert.deepEqual(createdExercise.exercise.primaries, ['chest'])
    assert.deepEqual(createdExercise.exercise.secondaries, ['triceps', 'deltoids'])
    const exerciseReadResult = await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } })
    const exerciseRead = mcpPayload(exerciseReadResult, 'get_exercise after create')
    assert.equal(exerciseRead.body_part, 'chest')
    assert.equal(exerciseRead.equipment, 'body weight')
    assert.deepEqual(exerciseRead.primary_muscles, ['chest'])
    assert.deepEqual(exerciseRead.secondary_muscles, ['triceps', 'deltoids'])
    assert.deepEqual(exerciseRead.instructions, ['Set the shoulders down and back.', 'Press with a steady tempo.', 'Return under control.'])
    assert.equal(exerciseRead.icon, 'stretch')
    const exerciseEditResult = await local.client.callTool({
      name: 'edit_custom_exercise',
      arguments: {
        exercise_id: exerciseId,
        changes: {
          name: 'MCP Capability Press Edited', description: 'Edited metadata survives the round-trip.',
          secondary_muscles: ['triceps'], instructions: ['Brace.', 'Press.', 'Pause.'], icon: 'bolt'
        },
        revision: exerciseRead.revision, request_id: 'cap-exercise-edit-1'
      }
    })
    const editedExercise = mcpPayload(exerciseEditResult, 'edit_custom_exercise')
    assert.equal(editedExercise.exercise.id, exerciseId)
    const editedExerciseReadResult = await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } })
    const editedExerciseRead = mcpPayload(editedExerciseReadResult, 'get_exercise after edit')
    assert.equal(editedExerciseRead.name, 'MCP Capability Press Edited')
    assert.equal(editedExerciseRead.body_part, 'chest')
    assert.equal(editedExerciseRead.equipment, 'body weight')
    assert.deepEqual(editedExerciseRead.primary_muscles, ['chest'])
    assert.deepEqual(editedExerciseRead.secondary_muscles, ['triceps'])
    assert.deepEqual(editedExerciseRead.instructions, ['Brace.', 'Press.', 'Pause.'])
    assert.equal(editedExerciseRead.icon, 'bolt')
    print('MCP_CAPABILITIES_EXERCISE_CREATE_EDIT', {
      id: exerciseId, body_part: editedExerciseRead.body_part, equipment: editedExerciseRead.equipment,
      primary_muscles: editedExerciseRead.primary_muscles, secondary_muscles: editedExerciseRead.secondary_muscles,
      instructions: editedExerciseRead.instructions, icon: editedExerciseRead.icon
    })

    // The same exercise ID appears twice with deliberately different configuration. This catches
    // accidental Map-by-ID collapsing that loses one occurrence or copies the wrong targets.
    const routineInput = {
      name: 'MCP Capability Routine', emoji: 'figureStrength', prog: 'linear', excludeFromProgression: false,
      ex: [
        {
          id: exerciseId, sets: 3, mode: 'reps', reps: 8, repsMin: 6, repsMax: 10, weight: 40,
          side: true, warmupSets: 2, warmupRestSec: 45, restSec: 120, prog: 'linear', inc: 2.5,
          deloadFactor: 0.8, sg: 'pressing', note: 'first occurrence note',
          intensifier: { type: 'dropset', count: 2, pct: 20 }
        },
        {
          id: exerciseId, sets: 2, mode: 'time', sec: 30, weight: 0,
          side: false, warmupSets: 1, warmupRestSec: 30, restSec: 60, prog: 'time', inc: 0,
          deloadFactor: 0.9, sg: 'hold', note: 'second occurrence note',
          intensifier: { type: 'restpause', totalReps: 6, restSec: 15 }
        }
      ]
    }
    const noIfMatch = await request(apiBase, '/api/mcp/routines', {
      ...jsonBody({ routine: routineInput, request_id: 'cap-no-if-match' }), headers: { ...bearer(fullToken), 'Idempotency-Key': 'cap-no-if-match' }
    })
    assertStatus(noIfMatch, 428, 'routine write without If-Match')
    const createdRoutineResult = await local.client.callTool({ name: 'create_routine', arguments: { routine: routineInput, request_id: 'cap-routine-create-1' } })
    const createdRoutine = mcpPayload(createdRoutineResult, 'create_routine')
    const routineId = createdRoutine.routine?.id
    assert.ok(routineId, 'created routine did not return a stable id')
    const duplicateRoutineResult = await local.client.callTool({ name: 'create_routine', arguments: { routine: routineInput, request_id: 'cap-routine-create-1' } })
    const duplicateRoutine = mcpPayload(duplicateRoutineResult, 'duplicate create_routine')
    assert.equal(duplicateRoutine.routine.id, routineId)
    const listAfterDuplicate = mcpPayload(await local.client.callTool({ name: 'list_routines', arguments: {} }), 'list_routines after duplicate')
    assert.equal(listAfterDuplicate.routines.filter(routine => routine.id === routineId).length, 1)
    const routineReadResult = await local.client.callTool({ name: 'get_routine', arguments: { routine_id: routineId } })
    const routineRead = mcpPayload(routineReadResult, 'get_routine after create')
    assert.equal(routineRead.exercises.length, 2)
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.note), ['first occurrence note', 'second occurrence note'])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.sets), [3, 2])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.side), [true, false])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.warmupSets), [2, 1])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.restSec), [120, 60])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.prog), ['linear', 'time'])
    assert.deepEqual(routineRead.exercises.map(exercise => exercise.raw_config.intensifier.type), ['dropset', 'restpause'])
    assert.equal(routineRead.exercises[0].raw_config.deloadFactor, 0.8)
    assert.equal(routineRead.exercises[0].raw_config.inc, 2.5)
    const editedRoutineResult = await local.client.callTool({
      name: 'edit_routine',
      arguments: {
        routine_id: routineId,
        changes: {
          name: 'MCP Capability Routine Edited', emoji: 'stretch',
          ex: [
            { ...routineInput.ex[0], note: 'edited first occurrence note' },
            { ...routineInput.ex[1] }
          ]
        },
        revision: routineRead.revision, request_id: 'cap-routine-edit-1'
      }
    })
    const editedRoutine = mcpPayload(editedRoutineResult, 'edit_routine')
    assert.equal(editedRoutine.routine.id, routineId)
    assert.equal(editedRoutine.routine.name, 'MCP Capability Routine Edited')
    const routineReadAfterEdit = mcpPayload(await local.client.callTool({ name: 'get_routine', arguments: { routine_id: routineId } }), 'get_routine after edit')
    assert.equal(routineReadAfterEdit.name, 'MCP Capability Routine Edited')
    assert.equal(routineReadAfterEdit.emoji, 'stretch')
    assert.deepEqual(routineReadAfterEdit.exercises.map(exercise => exercise.raw_config.note), ['edited first occurrence note', 'second occurrence note'])
    assert.deepEqual(routineReadAfterEdit.exercises.map(exercise => exercise.raw_config.warmupSets), [2, 1])
    const phoneRead = assertStatus(await request(apiBase, '/api/data', { headers: { Cookie: `gymsid=${userSession}` } }), 200, 'phone edit baseline').data
    const phoneState = {
      ...phoneRead.state,
      routines: phoneRead.state.routines.map(routine => routine.id === routineId ? { ...routine, name: 'Phone pending edit survives' } : routine)
    }
    const phoneEdit = await request(apiBase, '/api/data', {
      method: 'PUT', headers: {
        Cookie: `gymsid=${userSession}`, 'Content-Type': 'application/json',
        'If-Match': phoneRead.revision, 'Idempotency-Key': 'cap-phone-edit-1'
      }, body: JSON.stringify({ state: phoneState })
    })
    assertStatus(phoneEdit, 200, 'phone conditional edit')
    const staleRoutineEdit = await local.client.callTool({
      name: 'edit_routine',
      arguments: { routine_id: routineId, changes: { name: 'stale MCP overwrite must reject' }, revision: routineReadAfterEdit.revision, request_id: 'cap-stale-routine-edit-1' }
    })
    assert.equal(staleRoutineEdit.isError, true)
    assert.match(mcpErrorText(staleRoutineEdit), /stale revision/i)
    const staleApiEdit = await request(apiBase, `/api/mcp/routines/${encodeURIComponent(routineId)}`, {
      method: 'PUT', headers: { ...bearer(fullToken), 'Content-Type': 'application/json', 'If-Match': routineReadAfterEdit.revision, 'Idempotency-Key': 'cap-stale-routine-edit-api-1' },
      body: JSON.stringify({ changes: { name: 'stale API overwrite must reject', request_id: 'cap-stale-routine-edit-api-1' } })
    })
    assertStatus(staleApiEdit, 412, 'stale routine edit API status')
    const afterConflict = assertStatus(await request(apiBase, '/api/data', { headers: { Cookie: `gymsid=${userSession}` } }), 200, 'phone edit after stale MCP conflict').data
    assert.equal(afterConflict.state.routines.find(routine => routine.id === routineId)?.name, 'Phone pending edit survives')
    print('MCP_CAPABILITIES_428_PRECONDITION', { status: noIfMatch.response.status, writes_not_accepted: true })
    print('MCP_CAPABILITIES_412_CONFLICT', { status: 412, pending_device_edit: 'Phone pending edit survives', stale_mcp_rejected: true })
    print('MCP_CAPABILITIES_IDEMPOTENCY', { duplicate_request_same_id: routineId, routine_occurrences_after_retry: 1 })
    print('MCP_CAPABILITIES_ROUTINE_CREATE_EDIT_ROUNDTRIP', {
      routine_id: routineId, name_preserved_after_phone_edit: true,
      nested_sets: 2, warmup_sets: [2, 1], warmup_rest_sec: [45, 30], rest_sec: [120, 60],
      progression: ['linear', 'time'], increments: [2.5, 0], deload_factors: [0.8, 0.9],
      per_side: [true, false], intensifiers: ['dropset', 'restpause'],
      notes: ['edited first occurrence note', 'second occurrence note'], duplicate_configs_preserved: true,
      successful_edit: { name: 'MCP Capability Routine Edited', emoji: 'stretch' }
    })

    const profileCreateResult = await local.client.callTool({
      name: 'create_equipment_profile',
      arguments: { profile: { name: 'Capability Home Gym', equipment: ['body weight', 'dumbbell', 'band'] }, active: true, request_id: 'cap-equipment-create-1' }
    })
    const profileCreate = mcpPayload(profileCreateResult, 'create_equipment_profile')
    const profileId = profileCreate.profile?.id
    assert.ok(profileId, 'equipment profile did not return a stable id')
    const profilesBeforeEdit = mcpPayload(await local.client.callTool({ name: 'list_equipment_profiles', arguments: {} }), 'list_equipment_profiles after create')
    assert.equal(profilesBeforeEdit.active_profile_id, profileId)
    const profileEditResult = await local.client.callTool({
      name: 'edit_equipment_profile',
      arguments: {
        profile_id: profileId, changes: { name: 'Capability Travel Gym', equipment: ['body weight', 'barbell'] },
        active: true, revision: profilesBeforeEdit.revision, request_id: 'cap-equipment-edit-1'
      }
    })
    const profileEdit = mcpPayload(profileEditResult, 'edit_equipment_profile')
    assert.equal(profileEdit.profile.id, profileId)
    const profilesAfterEdit = mcpPayload(await local.client.callTool({ name: 'list_equipment_profiles', arguments: {} }), 'list_equipment_profiles after edit')
    const editedProfile = profilesAfterEdit.profiles.find(profile => profile.id === profileId)
    assert.deepEqual(editedProfile, { id: profileId, name: 'Capability Travel Gym', equipment: ['body weight', 'barbell'] })
    assert.equal(profilesAfterEdit.active_profile_id, profileId)
    print('MCP_CAPABILITIES_EQUIPMENT_PROFILE_CREATE_EDIT', { profile: editedProfile, active_profile_id: profilesAfterEdit.active_profile_id })

    const today = new Date()
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const planBefore = mcpPayload(await local.client.callTool({ name: 'get_week_plan', arguments: {} }), 'get_week_plan before update')
    const planUpdateResult = await local.client.callTool({
      name: 'update_week_plan',
      arguments: {
        plan: { week: { 1: [routineId, 'r-base'], 4: [routineId] }, dayPlan: { [todayIso]: routineId }, weekStart: 1 },
        revision: planBefore.revision, request_id: 'cap-plan-update-1'
      }
    })
    const planUpdate = mcpPayload(planUpdateResult, 'update_week_plan')
    assert.deepEqual(planUpdate.week['1'], [routineId, 'r-base'])
    assert.deepEqual(planUpdate.week['4'], [routineId])
    assert.equal(planUpdate.dayPlan[todayIso], routineId)
    assert.equal(planUpdate.weekStart, 1)
    const planAfter = mcpPayload(await local.client.callTool({ name: 'get_week_plan', arguments: {} }), 'get_week_plan after update')
    assert.equal(planAfter.today, todayIso)
    assert.equal(planAfter.today_routine_id, routineId)
    const planState = assertStatus(await request(apiBase, '/api/mcp/state?scope=routine:read', { headers: bearer(fullToken) }), 200, 'plan state read').data.state
    assert.deepEqual(planState.week['1'], [routineId, 'r-base'])
    assert.deepEqual(planState.week['4'], [routineId])
    assert.equal(planState.dayPlan[todayIso], routineId)
    print('MCP_CAPABILITIES_WEEK_PLAN', { weekday_arrays: { '1': [routineId, 'r-base'], '4': [routineId] }, date_scalar: { [todayIso]: routineId }, week_start: 1 })

    const workoutRead = mcpPayload(await local.client.callTool({ name: 'get_workout', arguments: { workout_id: 'Capabilities A-workout' } }), 'get_workout RIR/RPE')
    const workoutSet = workoutRead.entries?.[0]?.sets?.[0]
    assert.equal(workoutSet.rir, 0)
    assert.equal(workoutSet.rpe, 0)
    print('MCP_CAPABILITIES_RIR_RPE_ZERO_READ', { workout_id: workoutRead.id, rir: workoutSet.rir, rpe: workoutSet.rpe })

    const catalog = []
    let offset = 0
    while (true) {
      const page = mcpPayload(await local.client.callTool({ name: 'list_exercises', arguments: { offset, limit: 200 } }), `list_exercises offset ${offset}`)
      catalog.push(...page.exercises)
      if (page.next_offset == null) break
      assert.ok(page.next_offset > offset, 'catalog pagination did not advance')
      offset = page.next_offset
    }
    assert.equal(catalog.length, EXDB.length + 1)
    assert.equal(new Set(catalog.map(exercise => exercise.id)).size, EXDB.length + 1)
    assert.equal(catalog.find(exercise => exercise.id === exerciseId)?.has_private_image, false)
    print('MCP_CAPABILITIES_FULL_CATALOG_TRAVERSAL', { expected: EXDB.length + 1, traversed: catalog.length, unique_ids: new Set(catalog.map(exercise => exercise.id)).size })

    const image = await solidImage()
    const imageReadBefore = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise revision before image')
    const imageUploadResult = await local.client.callTool({
      name: 'upload_exercise_image',
      arguments: {
        exercise_id: exerciseId, mime: 'image/png', data: image.toString('base64'),
        revision: imageReadBefore.revision, request_id: 'cap-image-upload-1'
      }
    })
    const imageUpload = mcpPayload(imageUploadResult, 'upload_exercise_image')
    assert.ok(imageUpload.asset?.id)
    assert.ok(imageUpload.asset?.sha256)
    assert.equal(imageUpload.exercise?.media?.id, imageUpload.asset.id)
    assert.equal(imageUpload.exercise?.media?.sha256, imageUpload.asset.sha256)
    assert.equal(imageUpload.exercise?.media?.url, undefined)
    const imageReadAfter = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise read after image')
    assert.equal(imageReadAfter.has_private_image, true)
    assert.equal(imageReadAfter.media, undefined, 'MCP exercise read exposed private media details')
    const largeInput = await largeImage()
    assert.ok(largeInput.length > 1_500_000, `large image fixture is only ${largeInput.length} bytes`)
    const largeImageRead = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise revision before large image')
    const largeUploadResult = await local.client.callTool({
      name: 'upload_exercise_image',
      arguments: {
        exercise_id: exerciseId, mime: 'image/png', data: largeInput.toString('base64'),
        revision: largeImageRead.revision, request_id: 'cap-image-large-upload-1'
      }
    })
    const largeUpload = mcpPayload(largeUploadResult, 'large upload_exercise_image')
    assert.ok(largeUpload.asset?.id)
    assert.ok(largeUpload.asset?.sha256)
    assert.equal(largeUpload.exercise?.media?.id, largeUpload.asset.id)
    assert.equal(largeUpload.exercise?.media?.sha256, largeUpload.asset.sha256)
    const largeImageReadAfter = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise read after large image')
    assert.equal(largeImageReadAfter.has_private_image, true)
    const ownAsset = await rawRequest(apiBase, `/api/assets/${largeUpload.asset.id}`, { headers: { Cookie: `gymsid=${userSession}` } })
    assertStatus(ownAsset, 200, 'owner private image retrieval')
    assert.equal(hash(ownAsset.bytes), largeUpload.asset.sha256)
    const unauthenticatedAsset = await rawRequest(apiBase, `/api/assets/${largeUpload.asset.id}`)
    const crossUserAsset = await rawRequest(apiBase, `/api/assets/${largeUpload.asset.id}`, { headers: { Cookie: `gymsid=${otherSession}` } })
    assertStatus(unauthenticatedAsset, 401, 'unauthorized private image retrieval')
    assertStatus(crossUserAsset, 404, 'cross-user private image retrieval')
    print('MCP_CAPABILITIES_PRIVATE_IMAGE_UPLOAD', { asset_id: largeUpload.asset.id, mime: largeUpload.asset.mime, bytes: largeUpload.asset.size, sha256: largeUpload.asset.sha256, raw_input_bytes: largeInput.length, gateway_base64_payload_bytes: Buffer.byteLength(largeInput.toString('base64')), public_url_exposed: false, owner_render_bytes_match: true, over_1_5MiB_raw_fixture: true })
    print('MCP_CAPABILITIES_PRIVATE_IMAGE_UNAUTHORIZED', { anonymous_status: unauthenticatedAsset.response.status, other_user_status: crossUserAsset.response.status })

    const priorMedia = largeUpload.exercise.media
    const failedImageRead = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise revision before failed replacement')
    const failedReplacementResult = await local.client.callTool({
      name: 'upload_exercise_image',
      arguments: {
        exercise_id: exerciseId, mime: 'image/png', data: Buffer.from('not-an-image').toString('base64'),
        revision: failedImageRead.revision, request_id: 'cap-image-failed-replacement-1'
      }
    })
    assert.equal(failedReplacementResult.isError, true)
    assert.match(mcpErrorText(failedReplacementResult), /IMAGE_|image|400|415|413/i)
    const afterFailedImageRead = mcpPayload(await local.client.callTool({ name: 'get_exercise', arguments: { exercise_id: exerciseId } }), 'exercise after failed replacement')
    assert.equal(afterFailedImageRead.has_private_image, true)
    const afterFailedState = assertStatus(await request(apiBase, '/api/mcp/state?scope=exercise:read', { headers: bearer(fullToken) }), 200, 'state after failed image replacement').data.state
    const afterFailedMedia = afterFailedState.customEx.find(exercise => exercise.id === exerciseId)?.media
    assert.deepEqual(afterFailedMedia, priorMedia)
    const retainedAsset = await rawRequest(apiBase, `/api/assets/${priorMedia.id}`, { headers: { Cookie: `gymsid=${userSession}` } })
    assertStatus(retainedAsset, 200, 'retained private image after failed replacement')
    assert.equal(hash(retainedAsset.bytes), priorMedia.sha256)
    print('MCP_CAPABILITIES_PRIVATE_IMAGE_FAILED_REPLACEMENT', { rejected: true, prior_asset_id: priorMedia.id, prior_sha256: priorMedia.sha256, prior_media_preserved: true, prior_bytes_preserved: true })

    // The capability receipts above are only printed after their assertions have passed.
    print('MCP_CAPABILITIES_STAGING', 'PASS')
  } finally {
    for (const client of clients.reverse()) await closeClient(client)
    await stop(gatewayChild)
    if (proxy) await new Promise(resolve => proxy.server.close(resolve))
    await stop(apiChild)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

try {
  await main()
} catch (error) {
  console.error(`MCP_CAPABILITIES_STAGING=FAIL ${error.message}`)
  if (error?.stack) console.error(error.stack)
  process.exitCode = 1
}
