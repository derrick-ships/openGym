import crypto from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 12;
const KINDS = ['workout', 'routine'];

export function newShareId() {
  // Discard the partial bucket so each character has the same number of byte values.
  const cutoff = 256 - (256 % ALPHABET.length);
  let id = '';
  for (;;) {
    for (const byte of crypto.randomBytes(16)) {
      if (byte >= cutoff) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === ID_LENGTH) return id;
    }
  }
}

export function isShareId(id) {
  return typeof id === 'string' && id.length === ID_LENGTH && /^[A-Za-z0-9]+$/.test(id);
}

export function shareTitle(record) {
  return record.snapshot.title;
}

class InvalidSnapshot extends Error {}
function invalid(field) { throw new InvalidSnapshot(`invalid ${field}`); }

function isObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const INVISIBLE = /[\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/;

function text(max, multiline = false) {
  const controls = multiline ? /[\x00-\x09\x0b-\x1f\x7f-\x9f]/ : /[\x00-\x1f\x7f-\x9f]/;
  return (value, field) => {
    if (typeof value !== 'string' || controls.test(value) || INVISIBLE.test(value)) invalid(field);
    const trimmed = value.trim();
    if (trimmed.length > max) invalid(field);
    return trimmed;
  };
}

function oneOf(...choices) {
  const trim = text(Math.max(...choices.map(value => value.length)));
  return (value, field) => {
    const trimmed = trim(value, field);
    if (!choices.includes(trimmed)) invalid(field);
    return trimmed;
  };
}

function matching(max, pattern) {
  const trim = text(max);
  return (value, field) => {
    const trimmed = trim(value, field);
    if (!pattern.test(trimmed)) invalid(field);
    return trimmed;
  };
}

const MAX_TIMESTAMP_MS = 8.64e15;

function number(max, integer = false) {
  return (value, field) => {
    if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid(field);
    return value;
  };
}

const duration = number(7 * 24 * 60 * 60 * 1000, true);
const count = number(10000, true);
const intensity = number(1000);

export function isShareTimestamp(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_TIMESTAMP_MS;
}

function timestamp(value, field) {
  if (!isShareTimestamp(value)) invalid(field);
  return value;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}

function array(max, item) {
  return (value, field) => {
    if (!Array.isArray(value) || value.length > max) invalid(field);
    return Array.from(value, (element, i) => item(element, `${field}[${i}]`));
  };
}

function object(required, optional = {}) {
  return (value, field) => {
    if (!isObject(value)) invalid(field);
    const copy = {};
    for (const key of Object.keys(value)) {
      const validate = Object.hasOwn(required, key) ? required[key] : Object.hasOwn(optional, key) ? optional[key] : null;
      if (!validate) invalid(`${field} key`);
      copy[key] = validate(value[key], `${field}.${key}`);
    }
    for (const key of Object.keys(required)) {
      if (!Object.hasOwn(copy, key)) invalid(`${field}.${key}`);
    }
    return copy;
  };
}

function load(value, field) {
  if (!isObject(value)) invalid(field);
  const entries = Object.entries(value);
  if (entries.length > 40) invalid(field);
  return Object.fromEntries(entries.map(([slug, value]) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalid(`${field} slug`);
    return [slug, intensity(value, field)];
  }));
}

const workoutDateText = matching(10, /^\d{4}-\d{2}-\d{2}$/);
function workoutDate(value, field) {
  const trimmed = workoutDateText(value, field);
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(trimmed + 'T')) invalid(field);
  return trimmed;
}

const set = object({ label: text(80) }, { warmup: boolean, pr: boolean });
const entry = object({ id: text(120), name: text(120), muscles: array(12, text(40)), sets: array(40, set) }, {
  img: matching(125, /^[\w.-]{1,120}\.(jpg|jpeg|png|webp)$/), gif: matching(124, /^[\w.-]{1,120}\.gif$/),
  scheme: text(80), restSec: number(3600, true), superset: text(8), note: text(300, true)
});
const stats = object({ volume: number(1e7), sets: count, workSets: count, prs: count, durationMs: duration });
const pr = object({ name: text(120), detail: text(80) });
const snapshotV1 = object({
  v: (value, field) => value === 1 ? 1 : invalid(field), kind: oneOf(...KINDS), title: text(120), date: workoutDate,
  unit: oneOf('kg', 'lb'), accent: matching(7, /^#[0-9a-f]{6}$/i), body: oneOf('male', 'female'), load,
  entries: array(60, entry)
}, {
  subtitle: text(160), startedAt: timestamp, durationMs: duration, owner: text(60), stats, prs: array(30, pr),
  note: text(500, true), days: array(7, text(20)), aiText: text(6000, true)
});

export function validateSnapshot(kind, snapshot) {
  if (!KINDS.includes(kind)) return { ok: false, error: 'invalid kind' };
  try {
    const normalized = snapshotV1(snapshot, 'snapshot');
    if (normalized.kind !== kind) invalid('snapshot.kind');
    return { ok: true, snapshot: normalized };
  } catch (error) {
    if (!(error instanceof InvalidSnapshot)) throw error;
    return { ok: false, error: error.message };
  }
}
