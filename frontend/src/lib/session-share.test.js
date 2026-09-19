import { describe, expect, it } from 'vitest'
import { sessionShareText } from './session-share.js'

describe('plain-text completed session sharing', () => {
  it('includes only completed work and preserves the recorded session details', () => {
    const S = { unit: 'kg', customEx: [] }
    const w = {
      d: '2026-09-18', start: Date.parse('2026-09-18T10:00:00'), end: Date.parse('2026-09-18T11:05:00'),
      name: 'Push', vol: 800, entries: [{
        id: '0025', target: { id: '0025', mode: 'reps', bodyweight: false },
        sets: [{ w: 80, r: 8, done: true }, { w: 90, r: 5, done: false }, { w: 40, r: 10, done: true, phase: 'warmup' }],
      }, {
        id: '3637', target: { id: '3637', mode: 'cardio' },
        sets: [{ min: 12, speed: 8, done: true }],
      }],
    }
    const text = sessionShareText(S, w, ['0025'], [{ id: '0025', est: 105 }])
    expect(text).toContain('Push')
    expect(text).toContain('Duration: 1h 5m')
    expect(text).toContain('80×8 kg')
    expect(text).not.toContain('90×5')
    expect(text).toContain('Warm-up: 40×10 kg')
    expect(text).toContain('12 min @ 8 km/h')
    expect(text).toContain('New PR: barbell bench press')
    expect(text).toContain('Best estimated 1RM: barbell bench press · 105 kg')
  })

  it('keeps bodyweight and legacy timed records readable without a planned target', () => {
    const S = { unit: 'kg', customEx: [] }
    const w = {
      d: '2026-09-18', name: 'Freestyle', bw: 82, vol: 0, entries: [
        { id: '0001', sets: [{ w: 0, r: 12, done: true }] },
        { id: 'legacy-time', sets: [{ sec: 45, w: 0, done: true }] },
        { id: 'timed-load', sets: [{ sec: 45, w: 20, done: true }] },
        { id: '0001', target: { id: '0001', mode: 'reps', bodyweight: true }, sets: [{ w: 0, r: 12, done: true, type: 'dropset', drops: [{ w: 0, r: 8 }] }] },
      ],
    }
    const text = sessionShareText(S, w)
    expect(text).toContain('Bodyweight: 82 kg')
    expect(text).toContain('12')
    expect(text).toContain('0:45')
    expect(text).toContain('0:45 · 20 kg')
    expect(text).toContain('drops: 8 reps')
    expect(text).not.toContain('0×12 kg')
  })

  it('prints partial sides, effort, notes, drops, and rest-pause bursts from the saved rows', () => {
    const S = { unit: 'kg', customEx: [] }
    const w = {
      d: '2026-09-18', name: 'Lower', vol: 240, entries: [{
        id: '0025', target: { id: '0025', mode: 'reps', bodyweight: false }, note: 'Keep the left side controlled.', sets: [
          { w: 60, r: 8, done: true, type: 'dropset', drops: [{ w: 50, r: 6 }], rir: 2 },
          { w: 50, r: 10, done: true, type: 'restpause', clusters: [{ r: 4, restSec: 15 }, { r: 2, restSec: 15 }] },
          { sides: {
            L: { w: 20, r: 8, done: true, rir: 1, type: 'dropset', drops: [{ w: 15, r: 6 }] },
            R: { w: 20, r: 8, done: false },
          }, done: false },
        ],
      }],
    }
    const text = sessionShareText(S, w)
    expect(text).toContain('60×8 kg (RIR 2) · drops: 50×6 kg')
    expect(text).toContain('rest-pause: 4 reps (15s rest), 2 reps (15s rest)')
    expect(text).toContain('L 20×8 kg (RIR 1) · R — · L drops: 15×6 kg')
    expect(text).toContain('Note: Keep the left side controlled.')
    expect(text).toContain('Sets: 3')
    expect(text).toContain('3 work')
  })
})
