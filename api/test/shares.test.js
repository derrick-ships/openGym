import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShareId, newShareId, shareTitle, validateSnapshot } from '../shares.js';

const entry = () => ({ id: '0025', name: 'Bench press', muscles: ['chest'], sets: [{ label: '60 kg × 5' }] });
const snapshot = (kind = 'workout') => ({
  v: 1, kind, title: 'Push day', date: '2026-11-19', unit: 'kg', accent: '#dd4433', body: 'male',
  load: { chest: 0.8, 'upper-back': 0.1 }, entries: [entry()]
});
const stats = { volume: 400, sets: 2, workSets: 1, prs: 1, durationMs: 120000 };
const pr = { name: 'Bench press', detail: '60 kg' };

for (const kind of ['workout', 'routine']) {
  test(`accepts, trims, and copies a ${kind} without retaining references`, () => {
    const input = {
      ...snapshot(kind), title: ' Push day ', subtitle: ' Phase 1 ', unit: ' lb ', accent: ' #AaB09f ',
      body: ' female ', owner: ' Ada ', startedAt: 1795132800000, durationMs: 120000, stats, prs: [pr],
      note: ' first line\nsecond line ', aiText: ' Review:\nBench press ', days: [' Thursday '],
      entries: [{ ...entry(), img: ' 0025.jpg ', gif: ' 0025.gif ', scheme: ' 3 × 5 ', restSec: 0,
        superset: ' A ', note: ' Pause\nat the bottom ', muscles: [' chest '],
        sets: [{ label: ' 60 kg × 5 ', warmup: false, pr: true }] }]
    };
    const result = validateSnapshot(kind, input);
    assert.deepEqual(result, { ok: true, snapshot: {
      ...snapshot(kind), subtitle: 'Phase 1', unit: 'lb', accent: '#AaB09f', body: 'female', owner: 'Ada',
      startedAt: 1795132800000, durationMs: 120000, stats, prs: [pr], note: 'first line\nsecond line',
      aiText: 'Review:\nBench press', days: ['Thursday'],
      entries: [{ ...entry(), img: '0025.jpg', gif: '0025.gif', scheme: '3 × 5', restSec: 0, superset: 'A',
        note: 'Pause\nat the bottom', sets: [{ label: '60 kg × 5', warmup: false, pr: true }] }]
    } });
    assert.equal(input.title, ' Push day ');
    for (const key of ['entries', 'load', 'stats', 'prs', 'days']) assert.notEqual(result.snapshot[key], input[key]);
    assert.notEqual(result.snapshot.entries[0].sets[0], input.entries[0].sets[0]);
    assert.notEqual(result.snapshot.prs[0], input.prs[0]);
    assert.equal(shareTitle({ kind, snapshot: result.snapshot }), 'Push day');
  });
}

const extras = (key, value) => ({ ...snapshot(), [key]: value });
const withEntry = (key, value) => extras('entries', [{ ...entry(), [key]: value }]);
const listOf = (n, value) => Array.from({ length: n }, () => value);
const loadWith = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`muscle-${i}`, i]));

const bounds = [
  ...Object.entries({ title: 120, subtitle: 160, owner: 60, note: 500, aiText: 6000 })
    .map(([key, max]) => [key, max, value => extras(key, value), n => 'x'.repeat(n)]),
  ...Object.entries({ id: 120, name: 120, scheme: 80, superset: 8, note: 300 })
    .map(([key, max]) => [`entry ${key}`, max, value => withEntry(key, value), n => 'x'.repeat(n)]),
  ['set label', 80, value => withEntry('sets', [{ label: value }]), n => 'x'.repeat(n)],
  ['PR name', 120, value => extras('prs', [{ ...pr, name: value }]), n => 'x'.repeat(n)],
  ['PR detail', 80, value => extras('prs', [{ ...pr, detail: value }]), n => 'x'.repeat(n)],
  ['muscle name', 40, value => withEntry('muscles', [value]), n => 'x'.repeat(n)],
  ['day string', 20, value => extras('days', [value]), n => 'x'.repeat(n)],
  ['entries', 60, value => extras('entries', value), n => listOf(n, entry())],
  ['sets', 40, value => withEntry('sets', value), n => listOf(n, { label: '5 reps' })],
  ['muscles', 12, value => withEntry('muscles', value), n => listOf(n, 'chest')],
  ['load keys', 40, value => extras('load', value), loadWith],
  ['PRs', 30, value => extras('prs', value), n => listOf(n, pr)],
  ['days', 7, value => extras('days', value), n => listOf(n, 'Mon')],
  ['img basename', 120, value => withEntry('img', value), n => `${'x'.repeat(n)}.webp`],
  ['gif basename', 120, value => withEntry('gif', value), n => `${'x'.repeat(n)}.gif`]
];

test('enforces every D4 size boundary', () => {
  for (const [label, max, make, value] of bounds) {
    assert.equal(validateSnapshot('workout', make(value(max))).ok, true, `${label} at limit`);
    assert.equal(validateSnapshot('workout', make(value(max + 1))).ok, false, `${label} above limit`);
  }
});

test('rejects invalid values, unknown properties and nested garbage', () => {
  const invalid = {
    'null snapshot': null, 'array snapshot': [], 'mismatched kinds': snapshot('routine'),
    'unsupported version': extras('v', 2), 'unknown top-level key': extras('uid', 'private'),
    'huge title': extras('title', 'x'.repeat(200000)), 'missing title': extras('title', undefined),
    'date format': extras('date', '2026-1-19'), 'invalid calendar date': extras('date', '2026-02-29'),
    'bad unit': extras('unit', 'lbs'), 'bad body': extras('body', 'other'),
    'bad accent': extras('accent', '#a1b2c3ff'), 'bad hex': extras('accent', '#a1b2cz'),
    'control before trimming': extras('title', '\tTitle'), 'title newline': extras('title', 'two\nlines'),
    'carriage return': extras('note', 'note\r\n'), 'C1 control': extras('aiText', 'x\u0085y'),
    'invalid startedAt': extras('startedAt', 'yesterday'), 'negative top-level duration': extras('durationMs', -1),
    'bad stats type': extras('stats', []), 'bad stats value': extras('stats', { ...stats, volume: Infinity }),
    'unknown stat': extras('stats', { ...stats, heartRate: 120 }),
    'bad load type': extras('load', []), 'invalid slug': extras('load', { 'upper back': 0 }),
    'bad load value': extras('load', { chest: NaN }), 'negative load': extras('load', { chest: -0.5 }),
    'bad entry type': extras('entries', [null]), 'missing sets': withEntry('sets', undefined),
    'nested garbage': withEntry('extra', { private: 'data' }), 'bad muscle type': withEntry('muscles', [{}]),
    'private asset': withEntry('img', '/api/assets/abc'), 'invalid image extension': withEntry('img', 'pic.svg'),
    'invalid image path': withEntry('img', '../pic.png'), 'uppercase image extension': withEntry('img', 'pic.JPG'),
    'invalid gif': withEntry('gif', 'pic.png'), 'empty gif basename': withEntry('gif', '.gif'),
    'invalid rest': withEntry('restSec', -10), 'bad note type': withEntry('note', {}),
    'nested set object': withEntry('sets', [{ label: { text: '5 reps' } }]),
    'bad warmup': withEntry('sets', [{ label: '5 reps', warmup: 'false' }]),
    'bad pr flag': withEntry('sets', [{ label: '5 reps', pr: 1 }]),
    'unknown set field': withEntry('sets', [{ label: '5 reps', raw: {} }]),
    'bad PR shape': extras('prs', [{ name: 'PR' }]), 'bad day': extras('days', [7]),
    'own __proto__ key': { ...snapshot(), ...JSON.parse('{"__proto__":{}}') },
    'own __proto__ load key': extras('load', JSON.parse('{"__proto__":1}')),
    'own __proto__ nested key': withEntry('sets', [JSON.parse('{"label":"5 reps","__proto__":{}}')]),
    'inherited snapshot properties': Object.create(snapshot())
  };
  for (const [label, value] of Object.entries(invalid)) {
    const result = validateSnapshot('workout', value);
    assert.equal(result.ok, false, label);
    assert.equal(typeof result.error, 'string', label);
  }
  assert.equal(validateSnapshot('other', snapshot('other')).ok, false);
});

test('share IDs are 12 base62 characters', () => {
  const ids = Array.from({ length: 500 }, newShareId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[0-9A-Za-z]{12}$/.test(id) && isShareId(id)));
  for (const bad of [null, 123456789012, ['a'.repeat(12)], 'a'.repeat(11), 'a'.repeat(13), 'a'.repeat(12) + '\n', 'a'.repeat(11) + '_']) {
    assert.equal(isShareId(bad), false);
  }
});
