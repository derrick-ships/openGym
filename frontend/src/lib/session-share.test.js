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
      ],
    }
    const text = sessionShareText(S, w)
    expect(text).toContain('Bodyweight: 82 kg')
    expect(text).toContain('12')
    expect(text).toContain('0:45')
    expect(text).not.toContain('0×12 kg')
  })
})
