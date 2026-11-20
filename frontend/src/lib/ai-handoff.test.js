import { describe, expect, it } from 'vitest'
import {
  ATHLETE_DEFAULT, HEALTH_SOURCES, SESSION_CONTEXT_FLAGS, AI_PROVIDERS,
  athleteOf, progressSnapshot, coachSkillText, previousComparable, sessionComparison,
  sessionHandoffText, routineHandoffText, aiDeepLink,
} from './ai-handoff.js'
import * as handoff from './ai-handoff.js'
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
  { id: 'c-pullup', target: { bodyweight: true }, sets: [reps(0, 8)] },
] })
const latest = workout('latest', '2026-11-17', { vol: 1000, entries: [
  { id: BENCH, target: { mode: 'reps' }, sets: [reps(150, 10, { phase: 'warmup' }), reps(120, 5, { done: false }), reps(92, 1), reps(80, 8)] },
  { id: 'c-plank', sets: [hold(90, { warmup: true }), hold(45)] },
  { id: 'c-pullup', target: { bodyweight: true }, sets: [reps(0, 8)] },
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

describe('provider prompts', () => {
  it('tailors the same workout to each coach', () => {
    expect(handoff.providerPrompt('chatgpt', 'SESSION')).toMatch(/saved memory.*progress log.*next session[\s\S]*SESSION/i)
    expect(handoff.providerPrompt('claude', 'SESSION')).toMatch(/Project.*debrief.*adjustment[\s\S]*SESSION/i)
  })
})

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
    ].map(line => expect.objectContaining(line))))
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
    expect(text).toContain('get_athlete_profile')
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
    expect(text).toMatch(/Plank: .*45 s.*2026-11-17.*60 s.*2026-11-10/)
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
    expect(text).toContain('Do not treat lower numbers as lost strength')
    expect(text).toContain('do not ask me again what happened')
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

describe('compact handoffs', () => {
  it('fits all 25 realistic five-set exercises, context, and at most eight changes for both providers', () => {
    const names = [
      'Barbell back squat', 'Dumbbell bench press', 'Chest-supported dumbbell row', 'Romanian deadlift', 'Lat pulldown',
      'Seated cable row', 'Dumbbell shoulder press', 'Front-foot elevated split squat', 'Cable triceps pushdown', 'Incline dumbbell curl',
      'Cable lateral raise', 'Barbell hip thrust', 'Seated leg curl', 'Leg extension', 'Standing calf raise',
      'Cable face pull', 'Pec deck fly', 'Reverse fly', 'Dumbbell hammer curl', 'Overhead cable triceps extension',
      'Leg press', 'Hip abduction', 'Cable crunch', 'Pull-up', 'Plank',
    ]
    const customEx = names.map((n, i) => ({ id: `long-${i}`, n }))
    const makeEntries = delta => customEx.map(({ id }, i) => {
      const weight = 25 + i * 2.5 + delta
      return {
        id, ...(i < 5 && { note: 'Controlled eccentric; add load only when all three sets feel clean.' }),
        ...(i === 23 ? { target: { bodyweight: true }, sets: [10, 9, 8, 8, 7].map(r => reps(0, r)) }
          : i === 24 ? { sets: [45, 45, 45, 30, 30].map(sec => hold(sec + delta)) }
          : { sets: [reps(weight - 15, 10, { warmup: true }), reps(weight - 5, 8, { warmup: true }), ...Array(3).fill(reps(weight, 8))] }),
      }
    })
    const current = workout('long-latest', '2026-11-17', { name: 'Full body strength', end: Date.parse('2026-11-17T11:35:00Z'), vol: 15720, entries: makeEntries(0), context: { flags: ['poor-sleep'], note: 'Long travel day' } })
    const S = { unit: 'kg', customEx, workouts: [workout('long-before', '2026-11-10', { name: current.name, vol: 14600, entries: makeEntries(-2.5) })] }
    const options = { prs: ['long-0'] }
    const compact = handoff.sessionCompactHandoffText(S, current, options)
    const full = sessionHandoffText(S, current, options)
    expect(compact).toContain('Full body strength')
    expect(compact).toContain('2026-11-17')
    expect(compact).toContain('Duration:')
    expect(compact).toContain('Volume:')
    expect(compact).toContain('Slept badly; Long travel day')
    expect(compact).toMatch(/Barbell back squat.*10×10 kg wu.*3×8 @ 25 kg.*\(PR\)/)
    expect(compact).toMatch(/Pull-up.*bw×10/)
    expect(compact).toMatch(/Plank.*45s/)
    expect(compact).not.toContain('all three sets feel clean')
    expect(full).toContain('all three sets feel clean')
    const [exercises, comparison] = compact.split('Exercises:\n')[1].split('\n\nCompared')
    expect(exercises.split('\n')).toHaveLength(25)
    expect(comparison.match(/\(up\)/g)).toHaveLength(8)
    expect(comparison).toContain('do not ask me again what happened')
    for (const id of Object.keys(AI_PROVIDERS)) {
      const compactPrompt = handoff.providerPrompt(id, compact)
      expect(handoff.deepLinkFits(id, handoff.providerPrompt(id, full))).toBe(false)
      expect(handoff.deepLinkFits(id, compactPrompt)).toBe(true)
      expect(new URL(aiDeepLink(id, compactPrompt)).searchParams.get('q')).toBe(compactPrompt)
    }
  })

  it('compacts oversized coach instructions without shortening the clipboard text', () => {
    const S = { ...state, athlete: { notes: '🏋️'.repeat(200), injuries: 'Private notes '.repeat(70) } }
    const full = coachSkillText(S, { now: NOW })
    const compact = coachSkillText(S, { now: NOW, compact: true })
    expect(handoff.deepLinkFits('chatgpt', handoff.providerPrompt('chatgpt', full))).toBe(false)
    expect(handoff.deepLinkFits('chatgpt', handoff.providerPrompt('chatgpt', compact))).toBe(true)
    expect(compact).toContain('## Load rules')
    expect(compact).toContain('## My current numbers')
  })

  it('keeps each routine prescription on one line without replacing the full copy', () => {
    const S = { unit: 'kg', athlete: { experience: 'intermediate' } }
    const routine = { name: 'Upper', ex: [{ id: BENCH, sets: 3, repsMin: 6, repsMax: 8, weight: 60, restSec: 90 }] }
    expect(handoff.routineCompactHandoffText(S, routine)).toContain('barbell bench press — 3×6–8 @ 60 kg, 90s rest')
    expect(handoff.routineCompactHandoffText(S, routine)).toContain('Experience: intermediate')
    expect(routineHandoffText(S, routine)).toContain('Primary muscles:')
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

  it('never opens a bare provider even for empty, oversized, or malformed text', () => {
    const query = 'https://chatgpt.com/?q=%C3%A9'
    expect(aiDeepLink('chatgpt', 'é', { maxUrl: query.length })).toBe(query)
    for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
      for (const text of ['', null, undefined, ' '.repeat(10), '🏋️'.repeat(6000), '\uD800'.repeat(1000)]) {
        const url = aiDeepLink(id, text)
        expect(url).not.toBe(provider.base)
        expect(url.length).toBeLessThan(7000)
        expect(new URL(url).searchParams.get('q')).toBe(handoff.providerPrompt(id, "I just copied my latest openGym session to my clipboard. I'll paste it in my next message — wait for it, then compare it with my previous sessions and update my progress log."))
      }
    }
    expect(new URL(aiDeepLink('chatgpt', 'é', { maxUrl: query.length - 1 })).searchParams.get('q')).toContain('wait for it')
  })

  it('uses a short prompt about the right handoff when the original does not fit', () => {
    const long = '💪'.repeat(2000)
    expect(new URL(aiDeepLink('claude', long, { kind: 'routine' })).searchParams.get('q')).toMatch(/Project[\s\S]*routine.*clipboard/)
    expect(new URL(aiDeepLink('chatgpt', long, { kind: 'coach' })).searchParams.get('q')).toMatch(/coach instructions.*clipboard/)
    expect(new URL(aiDeepLink('chatgpt', long, { kind: 'share' })).searchParams.get('q')).not.toMatch(/clipboard/)
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


describe('handoff review regressions', () => {
  it.each(['sick', 'poor-sleep', 'pain', 'short-time', 'low-energy', 'stressed'])('uses %s as off-day context instead of re-asking', flag => {
    const text = sessionHandoffText(state, latest, { context: { flags: [flag] } })
    expect(text).toContain('Do not treat lower numbers as lost strength')
    expect(text).toContain('do not ask me again what happened')
    expect(text).toContain('tell me whether and how to adjust next session')
  })

  it('asks what happened only on a drop without context', () => {
    expect(sessionHandoffText(state, latest)).toContain('ask me what happened before changing my loads')
    for (const context of [{ note: 'Travel day' }, { flags: ['great'] }]) {
      const text = sessionHandoffText(state, latest, { context })
      expect(text).toContain('How it went:')
      expect(text).toContain('do not ask me again what happened')
      expect(text).not.toContain('ask me what happened before changing my loads')
    }
    expect(sessionHandoffText({}, latest)).not.toContain('ask me what happened')
  })

  it('retains the dates of latest and best sets, and explains snapshot scope', () => {
    expect(progressSnapshot(state, { now: NOW }).exercises.find(ex => ex.id === 'c-plank')).toMatchObject({
      lastSet: { sec: 45 }, lastDate: '2026-11-17', bestSet: { sec: 60 }, bestDate: '2026-11-10',
    })
    const text = coachSkillText(state, { now: NOW })
    expect(text).toContain('This is a snapshot of my top exercises from the last 8 weeks; ask me about anything not listed instead of treating it as new.')
    expect(text).toContain("For an exercise with no history, ask me for a starting weight; if I don't know, give a conservative range clearly labelled as a guess and aim for about RPE 7.")
    expect(text).toContain('If the openGym MCP is connected, read my profile (get_athlete_profile), workouts, estimated 1RM and muscle balance from it instead of asking me. Suggest routine changes as proposals for me to approve when your connection allows it.')
  })

  it('distinguishes added weight from body weight and never estimates bodyweight 1RM', () => {
    const current = { ...latest, entries: [
      { id: '0001', sets: [reps(0, 10)] },
      { id: 'c-pullup', target: { bodyweight: true }, sets: [reps(20, 8)] },
    ] }
    const S = { ...state, unit: 'kg', workouts: [current] }
    const text = coachSkillText(S, { now: NOW })
    expect(text).toContain('bodyweight × 10')
    expect(text).toContain('Pull-up: +20 kg × 8')
    expect(progressSnapshot(S, { now: NOW }).exercises.map(ex => ex.est1RM)).toEqual([null, null])
  })

  it('keeps timed loads and uses them to break a tie at equal times', () => {
    const before = { ...previous, entries: [{ id: 'c-plank', sets: [hold(45, { w: 5 })] }] }
    const current = { ...latest, entries: [{ id: 'c-plank', sets: [hold(44, { w: 20 }), hold(45, { w: 10 })] }] }
    const S = { ...state, workouts: [before] }
    expect(sessionComparison(S, current).exercises[0]).toMatchObject({ now: { sec: 45, w: 10 }, before: { sec: 45, w: 5 }, change: 'up' })
    expect(sessionHandoffText(S, current)).toContain('Plank: 45 s · 10 lb vs 45 s · 5 lb (up)')
  })

  it('coerces numeric strings, enforces age and height limits, and caps trimmed text', () => {
    const result = athleteOf({ athlete: {
      birthYear: ' 1920 ', heightCm: '272', sex: ' s '.repeat(100), notes: 'x'.repeat(1050), injuries: 'y'.repeat(1050),
    } }, { now: NOW })
    expect(result).toMatchObject({ birthYear: 1920, heightCm: 272 })
    expect(result.sex).toHaveLength(100)
    expect(result.notes).toHaveLength(1000)
    expect(result.injuries).toHaveLength(1000)
    expect(athleteOf({ athlete: { birthYear: '1915', heightCm: '273' } }, { now: NOW })).toEqual(ATHLETE_DEFAULT)
    expect(athleteOf({ athlete: { birthYear: '2022', heightCm: '49' } }, { now: NOW })).toEqual(ATHLETE_DEFAULT)
  })

  it('repairs lone UTF-16 surrogates and uses the same encoded length for the fit check', () => {
    const text = '🏋\uD800X\uDC00'
    const query = 'https://claude.ai/new?q=%F0%9F%8F%8B%EF%BF%BDX%EF%BF%BD'
    expect(aiDeepLink('claude', text)).toBe(query)
    expect(handoff.deepLinkFits('claude', text, { maxUrl: query.length })).toBe(true)
    expect(handoff.deepLinkFits('claude', text, { maxUrl: query.length - 1 })).toBe(false)
    expect(new URL(aiDeepLink('claude', text, { maxUrl: query.length - 1 })).searchParams.get('q')).toContain('wait for it')
  })

  it('uses the routine handoff clock for approximate age', () => {
    const text = routineHandoffText({ athlete: { birthYear: '2000' } }, {}, { now: Date.parse('2030-06-15T12:00:00Z') })
    expect(text).toContain('Age: about 30')
  })

  it('reads the latest eligible weigh-in by local date, not array position', () => {
    const now = new Date(2026, 10, 19, 23, 30).getTime()
    expect(progressSnapshot({ bodyweight: [
      { d: '2026-11-19', w: 80 }, { d: '2026-11-20', w: 90 }, { d: '2026-11-18', w: 79 },
    ] }, { now }).bodyWeight).toBe(80)
  })

  it('accepts an unset state and null records in saved history or a shared session', () => {
    expect(athleteOf(undefined)).toEqual(ATHLETE_DEFAULT)
    expect(progressSnapshot(undefined, { now: NOW }).workouts).toBe(0)
    expect(progressSnapshot({ workouts: [null, { ...latest, entries: [null, latest.entries[0]] }] }, { now: NOW }).exercises).toHaveLength(1)
    expect(previousComparable(undefined, latest)).toBeNull()
    expect(sessionHandoffText(undefined, { entries: [null] })).toContain('Exercises:')
  })

  it('omits stretching from attendance and only compares it with other stretches', () => {
    const stretch = workout('stretch', '2026-11-16', { kind: 'stretching' })
    const workouts = [previous, stretch]
    expect(progressSnapshot({ workouts }, { now: NOW })).toMatchObject({ workouts: 1, sessionsPerWeek: 1 / 8 })
    expect(previousComparable({ workouts }, latest)).toBe(previous)
    expect(previousComparable({ workouts }, { ...latest, kind: 'stretching' })).toBe(stretch)
  })
})
