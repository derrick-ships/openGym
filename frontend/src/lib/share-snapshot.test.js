// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { EXIDX } from './exercises.js'
import { workoutSnapshot, routineSnapshot, createShare, listShares, revokeShare } from './share-snapshot.js'

const S = { unit: 'kg', accent: 'sky', body: 'female', restSec: 90, week: { 1: ['push'] }, bodyweight: [{ w: 83 }], customEx: [{ id: 'custom', n: 'My press', bp: 'chest', media: { id: 'secret' } }] }
const workout = { name: 'Upper', d: '2026-11-19', start: 1000, end: 61000, bw: 83, vol: 400, entries: [
  { id: '0025', sg: 'group-long-id', sets: [{ w: 20, r: 10, done: true, phase: 'warmup' }, { w: 40, r: 10, done: true }] },
  { id: 'custom', sets: [{ w: 20, r: 5, done: true }] },
] }
const routine = { id: 'push', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 8, sg: 'group-long-id' }, { id: 'custom', sets: 3, reps: 8, sg: 'group-long-id' }] }

describe('hosted share snapshots', () => {
  it('builds a bounded public workout with catalog media, completed sets and no private body weight or assets', () => {
    const snapshot = workoutSnapshot(S, workout, { prs: ['0025'], owner: '  Alex  ' })
    expect(snapshot).toMatchObject({ v: 1, kind: 'workout', title: 'Upper', date: '2026-11-19', unit: 'kg', accent: '#0a84ff', body: 'female', owner: 'Alex', durationMs: 60000, stats: { volume: 400, sets: 3, workSets: 2, prs: 1 } })
    expect(snapshot.entries[0]).toMatchObject({ id: '0025', img: EXIDX['0025'].img, gif: EXIDX['0025'].gif })
    expect(snapshot.entries[0].sets[0]).toMatchObject({ warmup: true })
    expect(snapshot.entries[1]).not.toHaveProperty('img')
    expect(snapshot.entries[1]).not.toHaveProperty('gif')
    expect(snapshot.load.chest).toBeGreaterThan(0)
    expect(JSON.stringify(snapshot)).not.toMatch(/bodyweight|\"bw\"|\/api\/assets|secret/i)
    expect(snapshot.aiText).toContain('Upper')
    expect(snapshot.aiText).toContain('40×10')
    expect(snapshot.aiText).not.toMatch(/Bodyweight:|Body weight:/i)
  })
  it('stores a compact prompt under the API limit and leaves private history, context and profile out', () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      id: `exercise-${i}`, n: `Exercise ${i} ${'深'.repeat(100)}`, sets: Array(5).fill({ w: 40, r: 10, done: true }),
      note: 'Controlled tempo '.repeat(10),
    }))
    const current = { ...workout, context: { note: 'PRIVATE CONTEXT' }, entries }
    const state = { ...S, workouts: [{ ...workout, name: 'PRIVATE HISTORY', start: 1 }], athlete: { notes: 'PRIVATE PROFILE' } }
    const result = workoutSnapshot(state, current)
    expect(result.aiText.length).toBeLessThanOrEqual(6000)
    expect(result.aiText).toContain('5×10 @ 40 kg')
    expect(result.aiText).toMatch(/…and [1-9]\d* more exercises/)
    expect(result.aiText).not.toMatch(/PRIVATE|Bodyweight:|Set 1:/)
    expect(result.entries).toHaveLength(60)
    const plan = routineSnapshot(state, { ...routine, ex: entries.map(e => ({ id: e.id, n: e.n, sets: 3, reps: 8 })) })
    expect(plan.aiText.length).toBeLessThanOrEqual(6000)
    expect(plan.aiText).not.toContain('PRIVATE PROFILE')
  })
  it('bounds fields, strips control characters, groups supersets, and builds a routine map', () => {
    const snapshot = routineSnapshot(S, { ...routine, name: 'x'.repeat(150), note: 'a\u0000b', ex: Array(80).fill(routine.ex[0]) }, { aiText: 'z'.repeat(7000), owner: 'a'.repeat(100) })
    expect(snapshot.title).toHaveLength(120)
    expect(snapshot.aiText).toHaveLength(6000)
    expect(snapshot.owner).toHaveLength(60)
    expect(snapshot.entries).toHaveLength(60)
    expect(snapshot.entries[0].superset.length).toBeLessThanOrEqual(8)
    expect(snapshot.note).toBe('ab')
    expect(snapshot.days).toContain('Monday')
    expect(snapshot.load.chest).toBeGreaterThan(0)
  })
  it('clamps server numeric limits and removes hidden format controls', () => {
    const result = workoutSnapshot(S, { ...workout, name: 'A\u202eB', start: 1, end: 9000000000, vol: 99999999999 }, {})
    expect(result.title).toBe('AB')
    expect(result.durationMs).toBeLessThanOrEqual(604800000)
    expect(result.stats.volume).toBeLessThanOrEqual(10000000)
    const planned = routineSnapshot(S, { ...routine, ex: [{ ...routine.ex[0], restSec: 9000 }] })
    expect(planned.entries[0].restSec).toBeLessThanOrEqual(3600)
  })
  it('formats a snapshot without exposing private custom exercise descriptions', () => {
    const state = { ...S, customEx: [{ id: 'custom', n: 'Private name', desc: 'PRIVATE DESCRIPTION', img: '/api/assets/secret' }] }
    const result = routineSnapshot(state, { ...routine, ex: [routine.ex[1]] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE DESCRIPTION')
    expect(result.aiText).toContain('Private name')
  })
  it('uses the exact API contract', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'abc' }) })
    const snapshot = routineSnapshot(S, routine)
    await createShare('routine', snapshot); await listShares(); await revokeShare('abc')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/shares', '/api/shares', '/api/shares/revoke'])
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ kind: 'routine', snapshot })
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ id: 'abc' })
    fetch.mockRestore()
  })
})
