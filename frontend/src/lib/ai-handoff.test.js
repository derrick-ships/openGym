import { describe, expect, it } from 'vitest'
import {
  ATHLETE_DEFAULT, HEALTH_SOURCES, SESSION_CONTEXT_FLAGS, AI_PROVIDERS,
  athleteOf, progressSnapshot, coachSkillText, previousComparable, sessionComparison,
  sessionHandoffText, routineHandoffText, aiDeepLink,
} from './ai-handoff.js'
import { sessionShareText } from './session-share.js'
import { routineShareText } from './plan-share.js'

const NOW = Date.parse('2026-11-19T20:00:00Z')
const BENCH = '0025'
const reps = (w, r, extra) => ({ w, r, done: true, ...extra })
const hold = (sec, extra) => ({ w: 0, sec, done: true, ...extra })
const workout = (id, d, extra) => ({
  id, d, start: Date.parse(`${d}T10:00:00Z`), name: 'Upper', routineIds: ['upper'], entries: [], ...extra,
})
const previous = workout('previous', '2026-11-10', { vol: 800, entries: [
  { id: BENCH, sets: [reps(90, 3)] },
  { id: 'c-plank', target: { mode: 'time' }, sets: [hold(60)] },
  { id: 'c-pullup', sets: [reps(0, 8)] },
] })
const latest = workout('latest', '2026-11-17', { vol: 1000, entries: [
  { id: BENCH, target: { mode: 'reps' }, sets: [reps(150, 10, { phase: 'warmup' }), reps(120, 5, { done: false }), reps(92, 1), reps(80, 8)] },
  { id: 'c-plank', sets: [hold(90, { warmup: true }), hold(45)] },
  { id: 'c-pullup', sets: [reps(0, 8)] },
  { id: 'c-row', muscleSnapshot: { n: 'Cable row' }, sets: [reps(40, 10)] },
  { id: 'c-warmup-only', sets: [reps(40, 10, { warmup: true })] },
  { id: '3637', target: { mode: 'cardio' }, sets: [{ min: 20, speed: 9, done: true }] },
] })
const state = {
  unit: 'lb', customEx: [{ id: 'c-plank', n: 'Plank' }, { id: 'c-pullup', n: 'Pull-up' }],
  bodyweight: [{ d: '2026-09-01', w: 176 }, { d: '2026-11-15', w: 178 }],
  workouts: [latest, workout('future', '2026-11-20'), previous, workout('old', '2026-08-01', {
    entries: [{ id: BENCH, sets: [reps(200, 5)] }],
  })],
}

describe('athleteOf', () => {
  it('exports the empty profile and the exact picker catalogs', () => {
    expect(ATHLETE_DEFAULT).toEqual({ sex: null, birthYear: null, heightCm: null, experience: null, goal: null, injuries: '', healthSources: [], notes: '' })
    expect(HEALTH_SOURCES).toEqual([
      { id: 'apple-health', label: 'Apple Health' }, { id: 'google-fit', label: 'Google Fit / Health Connect' },
      { id: 'oura', label: 'Oura Ring' }, { id: 'whoop', label: 'Whoop' }, { id: 'garmin', label: 'Garmin' },
      { id: 'fitbit', label: 'Fitbit' }, { id: 'strava', label: 'Strava' }, { id: 'other', label: 'Other' },
    ])
    expect(SESSION_CONTEXT_FLAGS).toEqual([
      { id: 'poor-sleep', label: 'Slept badly' }, { id: 'sick', label: 'Sick' }, { id: 'pain', label: 'Pain or injury' },
      { id: 'short-time', label: 'Short on time' }, { id: 'low-energy', label: 'Low energy' },
      { id: 'stressed', label: 'Stressed' }, { id: 'great', label: 'Felt great' },
    ])
    expect(athleteOf({})).toEqual(ATHLETE_DEFAULT)
    expect(athleteOf({ athlete: 'bad import' })).toEqual(ATHLETE_DEFAULT)
    expect(athleteOf({}).healthSources).not.toBe(ATHLETE_DEFAULT.healthSources)
  })

  it('preserves filled values and filters malformed fields and unknown sources', () => {
    expect(athleteOf({ athlete: {
      sex: 'female', birthYear: 1994, heightCm: 170, experience: 'intermediate', goal: 'get stronger',
      injuries: 3, healthSources: ['oura', {}, 'invalid', 'garmin'], notes: '  Home gym  ', extra: true,
    } })).toEqual({
      sex: 'female', birthYear: 1994, heightCm: 170, experience: 'intermediate', goal: 'get stronger',
      injuries: '', healthSources: ['oura', 'garmin'], notes: 'Home gym',
    })
    expect(athleteOf({ athlete: { birthYear: NaN, heightCm: -1, sex: {}, goal: [], healthSources: 'oura' } })).toEqual(ATHLETE_DEFAULT)
  })
})

describe('progressSnapshot', () => {
  it('returns an empty, usable snapshot on a new profile', () => {
    expect(progressSnapshot({}, { now: NOW })).toEqual({ workouts: 0, sessionsPerWeek: 0, bodyWeight: null, exercises: [] })
  })

  it('uses workouts inside the window, recorded body weight, and completed work only', () => {
    const snapshot = progressSnapshot(state, { now: NOW, weeks: 2 })
    expect(snapshot).toMatchObject({ workouts: 2, sessionsPerWeek: 1, bodyWeight: 178 })
    expect(snapshot.exercises).toHaveLength(4)
    expect(snapshot.exercises).toEqual(expect.arrayContaining([
      { id: BENCH, name: 'barbell bench press', sessions: 2, lastDate: '2026-11-17', bestSet: { w: 80, r: 8 }, est1RM: 101.3 },
      { id: 'c-plank', name: 'Plank', sessions: 2, lastDate: '2026-11-17', bestSet: { sec: 60 }, est1RM: null },
      { id: 'c-pullup', name: 'Pull-up', sessions: 2, lastDate: '2026-11-17', bestSet: { w: 0, r: 8 }, est1RM: null },
      { id: 'c-row', name: 'Cable row', sessions: 1, lastDate: '2026-11-17', bestSet: { w: 40, r: 10 }, est1RM: 53.3 },
    ]))
    expect(progressSnapshot(state, { now: NOW, weeks: 1 }).workouts).toBe(1)
  })

  it('keeps a supported 1RM estimate when another set is above the estimator’s rep cap', () => {
    const { exercises } = progressSnapshot({ workouts: [workout('1', '2026-11-16', {
      entries: [{ id: BENCH, sets: [reps(80, 8), reps(90, 15)] }],
    })] }, { now: NOW })
    expect(exercises[0]).toMatchObject({ bestSet: { w: 80, r: 8 }, est1RM: 101.3 })
  })

  it('caps the list at 12 exercises and counts duplicate entries once per session', () => {
    const entries = Array.from({ length: 13 }, (_, i) => ({ id: `c-${i}`, sets: [reps(10, 5)] }))
    const repeated = { id: 'c-12', sets: [reps(12, 5)] }
    const { exercises } = progressSnapshot({ workouts: [
      workout('1', '2026-11-16', { entries: [...entries, repeated] }),
      workout('2', '2026-11-17', { entries: [entries[12]] }),
    ] }, { now: NOW })
    expect(exercises).toHaveLength(12)
    expect(exercises[0]).toMatchObject({ id: 'c-12', sessions: 2, bestSet: { w: 12, r: 5 } })
  })
})

describe('coachSkillText', () => {
  it('provides all the portable coaching rules with no logged data', () => {
    const text = coachSkillText({}, { now: NOW })
    for (const section of ['Role', 'Memory rules', 'Before recommending', 'Load rules', 'When a session is off', 'Health data', 'openGym MCP note', 'My profile', 'My current numbers']) {
      expect(text).toContain(`## ${section}\n`)
    }
    expect(text).toContain('at most 3')
    expect(text).toContain('RPE 7')
    expect(text).toContain('5–10%')
    expect(text).toContain('proposals I approve')
    expect(text).toContain('0 sessions')
    expect(text).not.toContain('Age:')
    expect(text).not.toContain('Body weight:')
  })

  it('uses the supplied year for approximate age and fills only available profile and training data', () => {
    const text = coachSkillText({ ...state, athlete: {
      sex: 'female', birthYear: 1994, heightCm: 170, goal: 'get stronger', healthSources: ['oura', 'apple-health'],
    } }, { now: NOW })
    expect(text).toContain('Age: about 32')
    expect(text).toContain('Sex: female')
    expect(text).toContain('Height: 170 cm')
    expect(text).toContain('Goal: get stronger')
    expect(text).not.toContain('Experience:')
    expect(text).toContain('Oura Ring, Apple Health')
    expect(text).toContain('Body weight: 178 lb')
    expect(text).toContain('101.3 lb estimated 1RM')
    expect(text).toContain('Plank: 60 s')
    expect(text.length).toBeLessThan(6000)
  })
})

describe('previousComparable', () => {
  it('finds the latest earlier overlap regardless of order, name, or duplicate current id', () => {
    const merged = { ...latest, routineIds: ['upper', 'push'] }
    const overlap = workout('both', '2026-11-16', { name: 'Push', routineIds: ['push'] })
    expect(previousComparable({ workouts: [overlap,
      workout('latest', '2026-11-17', { start: latest.start - 1 }),
      workout('wrong', '2026-11-17', { start: latest.start - 1, routineIds: ['legs'] }),
      workout('future', '2026-11-18'), previous, merged,
    ] }, merged)).toBe(overlap)
  })

  it('uses the name only for freestyle, respects same-day timestamps, and reads legacy routineId', () => {
    const freestyle = { ...latest, name: 'Freestyle', routineIds: [] }
    const earlier = { ...freestyle, id: 'earlier', start: freestyle.start - 3600_000 }
    const namedRoutine = { ...earlier, id: 'named', start: freestyle.start - 1, routineIds: ['upper'] }
    expect(previousComparable({ workouts: [earlier, namedRoutine] }, freestyle)).toBe(earlier)
    const legacy = { ...previous, routineIds: undefined, routineId: 'upper' }
    expect(previousComparable({ workouts: [legacy] }, latest)).toBe(legacy)
    expect(previousComparable({}, freestyle)).toBeNull()
  })
})

describe('sessionComparison', () => {
  it('compares top sets by estimate or duration, not the heaviest load or warm-up', () => {
    const result = sessionComparison(state, latest)
    expect(result).toEqual({ prev: previous, volumeDelta: 200, volumePct: 25, exercises: [
      { id: BENCH, name: 'barbell bench press', now: { w: 80, r: 8 }, before: { w: 90, r: 3 }, change: 'up' },
      { id: 'c-plank', name: 'Plank', now: { sec: 45 }, before: { sec: 60 }, change: 'down' },
      { id: 'c-pullup', name: 'Pull-up', now: { w: 0, r: 8 }, before: { w: 0, r: 8 }, change: 'same' },
      { id: 'c-row', name: 'Cable row', now: { w: 40, r: 10 }, before: null, change: 'new' },
    ] })
  })

  it('does not compare reps to seconds and uses work volume if the total was omitted', () => {
    const before = workout('before', '2026-11-10', { entries: [{ id: BENCH, sets: [hold(45)] }] })
    const current = { ...latest, vol: undefined, entries: [{ id: BENCH, sets: [reps(80, 8), reps(100, 5, { warmup: true })] }] }
    expect(sessionComparison({ workouts: [before] }, current)).toMatchObject({
      prev: before, volumeDelta: 640, volumePct: null,
      exercises: [{ id: BENCH, before: null, change: 'new' }],
    })
    expect(sessionComparison({}, { entries: [] })).toEqual({ prev: null, volumeDelta: null, volumePct: null, exercises: [] })
  })

  it('reads the finished side of a unilateral row instead of the unchecked side or aggregate', () => {
    const current = { ...latest, entries: [{ id: BENCH, sets: [
      { w: 95, r: 20, done: false, sides: { L: reps(25, 8), R: reps(95, 12, { done: false }) } },
    ] }] }
    expect(sessionComparison({}, current).exercises[0]).toMatchObject({ now: { w: 25, r: 8 }, change: 'new' })
  })
})

describe('sessionHandoffText', () => {
  it('wraps the exact session share, includes context and comparison, and asks before changing loads', () => {
    const withContext = { ...latest, context: { flags: ['poor-sleep', 'pain', 'unknown'], note: '  Travel day  ' } }
    const prs = [BENCH]
    const e1prs = [{ id: BENCH, est: 101.3 }]
    const text = sessionHandoffText(state, withContext, { prs, e1prs })
    expect(text).toMatch(/^Here is my latest openGym session\. Compare it with my previous sessions and update my progress log\./)
    expect(text).toContain('How it went: Slept badly; Pain or injury; Travel day')
    expect(text).not.toContain('unknown')
    expect(text).toContain(sessionShareText(state, withContext, prs, e1prs))
    expect(text).toContain('New PR: barbell bench press')
    expect(text).toContain('Best estimated 1RM: barbell bench press')
    expect(text).toContain('Compared with my last Upper session (2026-11-10):')
    expect(text).toContain('+200 lb (+25%)')
    expect(text).toContain('Plank: 45 s vs 60 s (down)')
    expect(text).toContain('Do not treat this session as a strength drop')
    expect(text).toMatch(/If anything dropped compared with my usual numbers, ask me what happened before changing my loads \(sleep, sickness, pain, time\)\. Then tell me what to aim for next session\.$/)
  })

  it('allows context override, and omits the comparison and concern warning when not applicable', () => {
    const text = sessionHandoffText({}, { ...latest, context: { flags: ['sick'] } }, { context: { flags: ['great'] } })
    expect(text).toContain('How it went: Felt great')
    expect(text).not.toContain('Sick')
    expect(text).not.toContain('strength drop')
    expect(text).not.toContain('Compared with')
    expect(sessionHandoffText({}, { entries: [] })).not.toContain('How it went:')
  })
})

describe('AI deep links', () => {
  it('exports provider metadata and encodes the complete text', () => {
    expect(AI_PROVIDERS).toEqual({
      chatgpt: { id: 'chatgpt', name: 'ChatGPT', base: 'https://chatgpt.com/', query: 'https://chatgpt.com/?q=' },
      claude: { id: 'claude', name: 'Claude', base: 'https://claude.ai/new', query: 'https://claude.ai/new?q=' },
    })
    expect(aiDeepLink('claude', 'A&B \n🏋')).toBe('https://claude.ai/new?q=A%26B%20%0A%F0%9F%8F%8B')
    expect(aiDeepLink('constructor', 'A&B')).toBe('https://chatgpt.com/?q=A%26B')
  })

  it('falls back to the base only if the full encoded URL exceeds the limit', () => {
    const query = 'https://chatgpt.com/?q=%C3%A9'
    expect(aiDeepLink('chatgpt', 'é', { maxUrl: query.length })).toBe(query)
    expect(aiDeepLink('chatgpt', 'é', { maxUrl: query.length - 1 })).toBe('https://chatgpt.com/')
    expect(aiDeepLink('claude', 'x'.repeat(7000))).toBe('https://claude.ai/new')
  })
})

describe('routineHandoffText', () => {
  it('asks for a routine review, preserves the existing share block, and adds filled profile details', () => {
    const S = { unit: 'kg', athlete: { experience: 'intermediate', goal: 'get stronger' } }
    const routine = { name: 'Upper', ex: [{ id: BENCH, sets: 3, reps: 8, weight: 80 }] }
    const text = routineHandoffText(S, routine)
    expect(text).toMatch(/^Please review and adjust this openGym routine for me/)
    expect(text).toContain(routineShareText(S, routine))
    expect(text).toContain('My profile: Experience: intermediate; Goal: get stronger')
    expect(routineHandoffText({}, routine)).toContain('My profile: No profile details logged.')
  })
})
