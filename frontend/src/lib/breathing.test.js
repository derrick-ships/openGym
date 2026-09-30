import { describe, expect, it } from 'vitest'
import { BREATHING_EXERCISES, phaseAt } from './breathing.js'

describe('breathing pattern catalog', () => {
  it('defines the five rest-guide exercises and their round caps', () => {
    expect(BREATHING_EXERCISES.map(x => x.id)).toEqual([
      'physiological-sigh', 'coherent', 'extended-exhale', 'bhramari', 'alternate-nostril',
    ])
    expect(BREATHING_EXERCISES.map(x => x.rounds)).toEqual([3, 10, 5, 5, 4])
  })
})

describe('phaseAt', () => {
  it('walks the physiological sigh phases and stops after three cycles', () => {
    expect(phaseAt('physiological-sigh', 0).id).toBe('inhale')
    expect(phaseAt('physiological-sigh', 1999).id).toBe('inhale')
    expect(phaseAt('physiological-sigh', 2000).id).toBe('second-inhale')
    expect(phaseAt('physiological-sigh', 3000).id).toBe('exhale')
    expect(phaseAt('physiological-sigh', 9000).id).toBe('inhale')
    expect(phaseAt('physiological-sigh', 27000)).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 3, completed: true,
    })
  })

  it('uses a deterministic phase index, duration, and progress', () => {
    expect(phaseAt('coherent', 2500)).toMatchObject({
      id: 'inhale', phaseIndex: 0, durationMs: 5000, phaseElapsedMs: 2500,
      progress: 0.5, cycle: 1, roundsCompleted: 0, completed: false,
    })
    expect(phaseAt('coherent', 5000)).toMatchObject({
      id: 'exhale', phaseIndex: 1, durationMs: 5000, phaseElapsedMs: 0,
      progress: 0, cycle: 1,
    })
  })

  it('supports the coherent 4-in/6-out variant and caps at ten rounds', () => {
    expect(phaseAt('coherent', 0, Infinity, '4-6')).toMatchObject({ id: 'inhale', durationMs: 4000 })
    expect(phaseAt('coherent', 4000, Infinity, '4-6')).toMatchObject({ id: 'exhale', durationMs: 6000 })
    expect(phaseAt('coherent', 100000, Infinity, '4-6')).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 10, completed: true,
    })
  })

  it('uses the gym-safe extended exhale by default and exposes 4-7-8 only when selected', () => {
    expect(phaseAt('extended-exhale', 0)).toMatchObject({ id: 'inhale', durationMs: 4000 })
    expect(phaseAt('extended-exhale', 4000)).toMatchObject({ id: 'exhale', durationMs: 6000 })
    expect(phaseAt('extended-exhale', 4000, Infinity, '4-7-8')).toMatchObject({
      id: 'hold', label: 'Hold', durationMs: 7000,
    })
    expect(phaseAt('extended-exhale', 11000, Infinity, '4-7-8')).toMatchObject({
      id: 'exhale', durationMs: 8000,
    })
    expect(phaseAt('extended-exhale', 76000, Infinity, '4-7-8')).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 4, completed: true,
    })
  })

  it('guides five gentle bhramari rounds with a hum on the exhale', () => {
    expect(phaseAt('bhramari', 0)).toMatchObject({ id: 'inhale', durationMs: 4000 })
    expect(phaseAt('bhramari', 4000)).toMatchObject({
      id: 'hum', label: 'Hum', durationMs: 7000, motion: 'exhale',
    })
    expect(phaseAt('bhramari', 55000)).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 5, completed: true,
    })
  })

  it('alternates nostril sides over four rounds', () => {
    expect(phaseAt('alternate-nostril', 0)).toMatchObject({
      id: 'inhale-left', side: 'left', durationMs: 4000,
      cue: 'Close your right nostril; breathe through the left nostril',
    })
    expect(phaseAt('alternate-nostril', 4000)).toMatchObject({
      id: 'exhale-right', side: 'right', durationMs: 6000,
      cue: 'Close your left nostril; breathe through the right nostril',
    })
    expect(phaseAt('alternate-nostril', 10000)).toMatchObject({
      id: 'inhale-right', side: 'right', durationMs: 4000,
      cue: 'Close your left nostril; breathe through the right nostril',
    })
    expect(phaseAt('alternate-nostril', 14000)).toMatchObject({
      id: 'exhale-left', side: 'left', durationMs: 6000,
      cue: 'Close your right nostril; breathe through the left nostril',
    })
    expect(phaseAt('alternate-nostril', 20000)).toMatchObject({ id: 'inhale-left', cycle: 2 })
    expect(phaseAt('alternate-nostril', 80000)).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 4, completed: true,
    })
  })

  it('offers box breathing as an alternate-nostril stand-in', () => {
    expect(phaseAt('alternate-nostril', 0, Infinity, 'box')).toMatchObject({ id: 'inhale', durationMs: 4000 })
    expect(phaseAt('alternate-nostril', 4000, Infinity, 'box')).toMatchObject({ id: 'hold', durationMs: 4000 })
    expect(phaseAt('alternate-nostril', 8000, Infinity, 'box')).toMatchObject({ id: 'exhale', durationMs: 4000 })
    expect(phaseAt('alternate-nostril', 12000, Infinity, 'box')).toMatchObject({
      id: 'hold-empty', label: 'Hold', durationMs: 4000,
    })
    expect(phaseAt('alternate-nostril', 64000, Infinity, 'box')).toMatchObject({
      id: 'ready', label: 'Guide complete — rest continues', roundsCompleted: 4, completed: true,
    })
  })

  it('reserves the final five seconds for normal breathing and does not start an unfinishable cycle', () => {
    expect(phaseAt('coherent', 0, 5000)).toMatchObject({
      id: 'ready', label: 'Take a normal breath', cue: 'Next set soon', completed: true,
    })
    expect(phaseAt('coherent', 10000, 14999)).toMatchObject({
      id: 'ready', label: 'Not enough time for a full round', cue: 'Take a normal breath',
      roundsCompleted: 1, completed: true,
    })
    expect(phaseAt('coherent', 10000, 15000)).toMatchObject({
      id: 'inhale', cycle: 2, roundsCompleted: 1, completed: false,
    })
    expect(phaseAt('coherent', 0, 14999)).toMatchObject({
      id: 'ready', label: 'Not enough time for a full round', cue: 'Take a normal breath',
      roundsCompleted: 0, completed: true,
    })
    expect(phaseAt('coherent', 0, 0)).toMatchObject({
      id: null, label: null, completed: true,
    })
  })

  it('does not claim round-cap completion when another round cannot fit', () => {
    expect(phaseAt('coherent', 20000, 14999)).toMatchObject({
      id: 'ready', label: 'Not enough time for a full round', cue: 'Take a normal breath',
      roundsCompleted: 2, completed: true,
    })
  })

  it('keeps the current cycle when rest is shortened mid-cycle', () => {
    expect(phaseAt('coherent', 4000, 9000)).toMatchObject({
      id: 'inhale', cycle: 1, completed: false,
    })
    expect(phaseAt('coherent', 5000, 5000)).toMatchObject({
      id: 'ready', label: 'Take a normal breath', cue: 'Next set soon', roundsCompleted: 0, completed: true,
    })
  })

  it('clamps negative elapsed time and falls back to coherent for an unknown exercise', () => {
    expect(phaseAt('coherent', -100)).toMatchObject({ id: 'inhale', phaseElapsedMs: 0, cycle: 1 })
    expect(phaseAt('unknown', 0)).toMatchObject({ id: 'inhale', durationMs: 5000 })
  })
})
