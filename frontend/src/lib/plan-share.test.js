import { afterEach, describe, expect, it } from 'vitest'
import { buildPlanBundle, mergePlan, parsePlan, routineShareText } from './plan-share.js'
import { _setLangState } from './i18n-core.js'

// There was no test file for plan sharing at all, which is how a whole prescription field
// went missing without anyone noticing.
const stateWith = ex => ({
  routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 5, weight: 100, ...ex }] }],
  week: {}, customEx: [],
})
const roundTrip = ex => parsePlan(JSON.stringify(buildPlanBundle(stateWith(ex), 'Plan'))).routines[0].ex[0]

describe('what survives a shared plan', () => {
  it('carries a drop-set prescription', () => {
    expect(roundTrip({ intensifier: { type: 'dropset', count: 2, pct: 20 } }).intensifier)
      .toEqual({ type: 'dropset', count: 2, pct: 20 })
  })

  it('carries a rest-pause prescription', () => {
    expect(roundTrip({ intensifier: { type: 'restpause', totalReps: 12, restSec: 15 } }).intensifier)
      .toEqual({ type: 'restpause', totalReps: 12, restSec: 15 })
  })

  it('carries planned warm-ups', () => {
    expect(roundTrip({ warmupSets: 3 }).warmupSets).toBe(3)
  })

  it('carries a non-default Epley deload factor and omits the default', () => {
    expect(roundTrip({ deloadFactor: 0.8 }).deloadFactor).toBe(0.8)
    expect('deloadFactor' in roundTrip({ deloadFactor: 0.9 })).toBe(false)
  })

  it('carries progression exclusion on a routine through export and merge', () => {
    const source = stateWith({})
    source.routines[0].excludeFromProgression = true
    const bundle = parsePlan(buildPlanBundle(source, 'Plan'))
    const target = { routines: [], week: {}, customEx: [] }

    expect(bundle.routines[0].excludeFromProgression).toBe(true)
    mergePlan(target, bundle)
    expect(target.routines[0].excludeFromProgression).toBe(true)
  })

  // Issue #10: the rest an exercise prescribes is part of the prescription. A shared 5x5 whose
  // rests arrive as the recipient's 60 s default is a different session than the one written.
  it('carries a per-exercise rest', () => {
    expect(roundTrip({ restSec: 180 }).restSec).toBe(180)
  })

  // The ramp's own rest is the same kind of prescription: a shared plan whose warm-up sets
  // arrive resting the full working rest is not the plan that was written.
  it('carries a per-exercise warm-up rest, and leaves it out when unset', () => {
    expect(roundTrip({ restSec: 150, warmupRestSec: 45 }).warmupRestSec).toBe(45)
    expect('warmupRestSec' in roundTrip({})).toBe(false)
    expect('warmupRestSec' in roundTrip({ warmupRestSec: 0 })).toBe(false)
  })

  // The absence has to survive too: writing a 0 would pin the recipient's timer to "off"
  // instead of letting the exercise keep inheriting whatever their own default is.
  it('leaves an exercise that set no rest free of the field', () => {
    expect('restSec' in roundTrip({})).toBe(false)
    expect('restSec' in roundTrip({ restSec: 0 })).toBe(false)
  })

  it('carries the rest onto the routine mergePlan adds', () => {
    const bundle = parsePlan(JSON.stringify(buildPlanBundle(stateWith({ restSec: 180 }), 'Plan')))
    const s = { routines: [], customEx: [], week: {} }
    mergePlan(s, bundle, { schedule: false })
    expect(s.routines[0].ex[0].restSec).toBe(180)
  })

  it('drops an intensifier it does not recognise rather than passing it on', () => {
    expect(roundTrip({ intensifier: { type: 'nonsense', count: 3 } }).intensifier).toBeUndefined()
  })

  it('clamps a hand-edited warm-up count instead of showing it verbatim', () => {
    const bundle = { opengym_plan: 1, name: 'x', routines: [{ id: 'r', name: 'R', ex: [{ id: '0025', sets: 3, reps: 5, warmupSets: 999 }] }], week: {}, customEx: [] }
    expect(parsePlan(bundle).routines[0].ex[0].warmupSets).toBe(5)
  })

  // A plan file is someone else's data: a rest that arrives as a string would reach the timer's
  // arithmetic as one, and a negative or garbage one has no meaning to keep.
  it('normalises a hand-edited rest to a positive whole number or drops it', () => {
    const withRest = restSec => ({ opengym_plan: 1, name: 'x', routines: [{ id: 'r', name: 'R', ex: [{ id: '0025', sets: 3, reps: 5, restSec }] }], week: {}, customEx: [] })
    expect(parsePlan(withRest('120')).routines[0].ex[0].restSec).toBe(120)
    expect(parsePlan(withRest(90.6)).routines[0].ex[0].restSec).toBe(91)
    expect('restSec' in parsePlan(withRest(-30)).routines[0].ex[0]).toBe(false)
    expect('restSec' in parsePlan(withRest('abc')).routines[0].ex[0]).toBe(false)
  })

  // The floors are the config sheet's own (count >= 1, pct >= 5); a value that is present but
  // out of range is pulled up to the floor, while a missing one falls back to the default.
  it('clamps out-of-range intensifier numbers to the floors the app enforces', () => {
    const bundle = { opengym_plan: 1, name: 'x', routines: [{ id: 'r', name: 'R', ex: [{ id: '0025', sets: 3, reps: 5, intensifier: { type: 'dropset', count: 0, pct: -5 } }] }], week: {}, customEx: [] }
    expect(parsePlan(bundle).routines[0].ex[0].intensifier).toEqual({ type: 'dropset', count: 1, pct: 5 })
  })

  it('falls back to the default drop percentage when the file omits it', () => {
    const bundle = { opengym_plan: 1, name: 'x', routines: [{ id: 'r', name: 'R', ex: [{ id: '0025', sets: 3, reps: 5, intensifier: { type: 'dropset' } }] }], week: {}, customEx: [] }
    expect(parsePlan(bundle).routines[0].ex[0].intensifier).toEqual({ type: 'dropset', count: 1, pct: 20 })
  })
})

// ---- combine routines: a weekday holds a routine-id list (ENG-9 §5) ----
describe('week schedule as a routine-id list', () => {
  const twoRoutines = {
    routines: [
      { id: 'a', name: 'A', ex: [{ id: '0025', sets: 3, reps: 5 }] },
      { id: 'b', name: 'B', ex: [{ id: '0031', sets: 3, reps: 8 }] },
    ],
    customEx: [],
  }

  it('build → parse → merge round-trips an array week with arrays intact', () => {
    const src = { ...twoRoutines, week: { 1: ['a', 'b'], 3: ['a'] } }
    const parsed = parsePlan(JSON.stringify(buildPlanBundle(src, 'Plan')))
    expect(parsed.scheduledDays).toBe(2)

    const target = { routines: [], week: {}, customEx: [] }
    mergePlan(target, parsed, { schedule: true })
    const [idA, idB] = target.routines.map(r => r.id)
    expect(target.week[1]).toEqual([idA, idB])
    expect(target.week[3]).toEqual([idA])
  })

  it('tolerates a legacy scalar bundle value', () => {
    const legacy = { opengym_plan: 1, name: 'x', customEx: [], week: { 1: 'a' }, routines: twoRoutines.routines }
    const parsed = parsePlan(legacy)
    expect(parsed.scheduledDays).toBe(1)
    const target = { routines: [], week: {}, customEx: [] }
    mergePlan(target, parsed, { schedule: true })
    expect(target.week[1]).toEqual([target.routines[0].id])
  })

  it('mergePlan drops an element whose id did not survive parsing, never writes undefined', () => {
    // 'gone' is not among the bundle routines → ridMap has no entry → filtered out
    const bundle = { routines: [{ id: 'a', name: 'A', ex: [{ id: '0025', sets: 3, reps: 5 }] }], week: { 1: ['a', 'gone'], 2: ['gone'] }, customEx: [] }
    const target = { routines: [], week: {}, customEx: [] }
    mergePlan(target, bundle, { schedule: true })
    expect(target.week[1]).toEqual([target.routines[0].id])
    expect(target.week[2]).toBeUndefined()             // emptied → left absent, not stored as []
  })

  it('scheduledDays counts a populated array day as 1 and a [] / absent day as 0', () => {
    expect(parsePlan({ opengym_plan: 1, routines: [], customEx: [], week: { 1: ['a'], 2: [], 4: 'b' } }).scheduledDays).toBe(2)
  })
})

describe('plain-text routine sharing', () => {
  afterEach(() => _setLangState('en', null, null, null))

  it('prints every occurrence and its complete prescription in English without history or private media', () => {
    // The output is deliberately English even when the editor is currently Spanish.
    _setLangState('es', { Routine: 'Rutina', Exercises: 'Ejercicios' }, null, { '0025': 'Press de banca' })
    const S = {
      unit: 'kg',
      restSec: 90,
      routines: [{
        id: 'push', name: 'Push day', prog: 'linear', excludeFromProgression: false,
        ex: [
          {
            id: '0025', sets: 3, reps: 10, weight: 80, mode: 'reps', side: true,
            warmupSets: 2, warmupRestSec: 30, restSec: 120, prog: 'double', inc: 2.5,
            repsMin: 6, repsMax: 12, deloadFactor: 0.8,
            intensifier: { type: 'dropset', count: 2, pct: 20 }, sg: 'pair',
            note: 'Keep the wrists stacked\nexactly.',
          },
          { id: '0025', sets: 1, mode: 'time', sec: 45, weight: 0, restSec: 60, note: 'Second occurrence' },
        ]
      }],
      customEx: [{
        id: 'custom-1', n: 'My exact exercise', bp: 'back', desc: 'User description',
        st: ['User instruction'], primaries: ['lats'], secondaries: ['biceps'], eq: 'cable',
        icon: 'pullup', media: { id: 'private-asset', sha256: 'secret' },
      }],
      workouts: [{ id: 'history', entries: [{ id: '0025', sets: [{ w: 999, r: 99, done: true }] }] }],
    }
    const text = routineShareText(S, S.routines[0])

    expect(text).toContain('Routine: Push day')
    expect(text).toContain('Exercises: 2')
    expect(text).toContain('Reps: 6-12')
    expect(text).toContain('Reps per side: 5 (10 total)')
    expect(text).toContain('Warm-up sets: 2')
    expect(text).toContain('Warm-up rest override: 30 seconds between warm-up sets; the break before the first work set uses work rest.')
    expect(text).toContain('Rest: 120 seconds')
    expect(text).toContain('Progression: Double progression (exercise override); increment: 2.5 kg')
    expect(text).toContain('Deload 1RM target: 80%')
    expect(text).toContain('Intensifier: Drop-set; 2 drops; 20% lighter')
    expect(text).toContain('Superset: group 1')
    expect(text).toContain('Note: Keep the wrists stacked\nexactly.')
    expect(text).toContain('2. barbell bench press') // occurrence order stays intact; locale is not used for sharing
    expect(text).not.toContain('Press de banca')
    expect(text).not.toContain('999')

    const customRoutine = {
      id: 'share', name: 'Custom routine', prog: 'linear', excludeFromProgression: true,
      ex: [{ id: 'custom-1', sets: 2, reps: 8, weight: 10, note: 'Do not translate this.' }]
    }
    const customText = routineShareText(S, customRoutine)
    expect(customText).toContain('1. My exact exercise')
    expect(customText).toContain('Primary muscles: lats')
    expect(customText).toContain('Secondary muscles: biceps')
    expect(customText).toContain('Equipment: cable')
    expect(customText).toContain('Description: User description')
    expect(customText).toContain('Instructions:\n      1. User instruction')
    expect(customText).toContain('Sets: 2')
    expect(customText).toContain('Reps: 8')
    expect(customText).toContain('Weight: 10 kg')
    expect(customText).toContain('Note: Do not translate this.')
    expect(customText).not.toContain('private-asset')
  })

  it('uses the effective time/cardio and bodyweight rules without inventing a load', () => {
    const S = {
      unit: 'lb', restSec: 75, routines: [], customEx: [], workouts: []
    }
    const routine = {
      id: 'mixed', name: 'Mixed', prog: 'time', ex: [
        { id: '0025', sets: 2, mode: 'time', sec: 45, weight: 0, inc: 10 },
        { id: '1160', sets: 3, min: 4, speed: 8, restSec: 30 },
        { id: '0025', sets: 3, reps: 10, weight: 0, bodyweight: true, side: true },
      ]
    }
    const text = routineShareText(S, routine)

    expect(text).toContain('Mode: time')
    expect(text).toContain('Duration: 0:45')
    expect(text).toContain('Progression: Add time (routine default); increment: 10 seconds')
    expect(text).toContain('Mode: cardio')
    expect(text).toContain('Duration: 4 minutes')
    expect(text).toContain('Speed: 8 km/h')
    expect(text).toContain('Load: bodyweight')
    expect(text).toContain('Reps per side: 5 (10 total)')
    expect(text).toContain('Rest: 75 seconds (workout default)')
  })
})
