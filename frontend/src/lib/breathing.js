const phase = (id, label, durationMs, motion, cue, side) => ({
  id, label, durationMs, motion, cue, ...(side ? { side } : {}),
})

const inhale = (durationMs, cue = 'Through your nose') => phase('inhale', 'Inhale', durationMs, 'inhale', cue)
const exhale = (durationMs, cue = 'Through your mouth') => phase('exhale', 'Exhale', durationMs, 'exhale', cue)
const hold = (id, durationMs, cue) => phase(id, 'Hold', durationMs, 'hold', cue)

export const BREATHING_EXERCISES = [
  {
    id: 'physiological-sigh', label: 'Physiological sigh', rounds: 3, defaultVariant: 'default',
    variants: [{
      id: 'default', label: 'Guided sigh', rounds: 3,
      phases: [
        inhale(2000),
        phase('second-inhale', 'Second inhale', 1000, 'inhale', 'Take a small nasal sip'),
        exhale(6000),
      ],
    }],
  },
  {
    id: 'coherent', label: 'Coherent breathing', rounds: 10, defaultVariant: '5-5',
    variants: [
      { id: '5-5', label: '5 in / 5 out', rounds: 10, phases: [inhale(5000), exhale(5000, 'Through your nose or mouth')] },
      { id: '4-6', label: '4 in / 6 out', rounds: 10, phases: [inhale(4000), exhale(6000, 'Through your nose or mouth')] },
    ],
  },
  {
    id: 'extended-exhale', label: 'Extended exhale', rounds: 5, defaultVariant: 'gym-safe',
    variants: [
      { id: 'gym-safe', label: '4 in / 6 out · no hold', rounds: 5, phases: [inhale(4000), exhale(6000, 'Slow and easy')] },
      { id: '4-7-8', label: '4-7-8', rounds: 4, phases: [inhale(4000), hold('hold', 7000, 'Only if comfortable'), exhale(8000, 'Whoosh out gently')] },
    ],
  },
  {
    id: 'bhramari', label: 'Bhramari (humming breath)', rounds: 5, defaultVariant: 'default',
    variants: [{
      id: 'default', label: 'Gentle hum', rounds: 5,
      phases: [inhale(4000), phase('hum', 'Hum', 7000, 'exhale', 'Hum softly with your mouth closed')],
    }],
  },
  {
    id: 'alternate-nostril', label: 'Alternate nostril', rounds: 4, defaultVariant: 'alternate',
    variants: [
      {
        id: 'alternate', label: 'Alternate nostril', rounds: 4,
        phases: [
          phase('inhale-left', 'Inhale', 4000, 'inhale', 'Left nostril', 'left'),
          phase('exhale-right', 'Exhale', 6000, 'exhale', 'Right nostril', 'right'),
          phase('inhale-right', 'Inhale', 4000, 'inhale', 'Switch sides · right nostril', 'right'),
          phase('exhale-left', 'Exhale', 6000, 'exhale', 'Switch sides · left nostril', 'left'),
        ],
      },
      {
        id: 'box', label: 'Box breathing', rounds: 4,
        phases: [
          inhale(4000),
          hold('hold', 4000, 'Hold comfortably'),
          exhale(4000, 'Through your nose'),
          hold('hold-empty', 4000, 'Pause comfortably'),
        ],
      },
    ],
  },
]

const cycleDuration = phases => phases.reduce((total, item) => total + item.durationMs, 0)

const finished = (rounds, roundsCompleted, state = 'complete') => ({
  id: state === 'ended' ? null : 'ready',
  label: state === 'ended' ? null : state === 'soon' ? 'Next set soon'
    : state === 'not-enough-time' ? 'Not enough time for a full round' : 'Guide complete — rest continues',
  cue: state === 'ended' ? null : state === 'complete' ? 'Breathe normally' : 'Take a normal breath',
  motion: 'still',
  phaseIndex: -1,
  durationMs: 0,
  phaseElapsedMs: 0,
  progress: 1,
  cycle: roundsCompleted,
  rounds,
  roundsCompleted,
  completed: true,
  nextPhaseId: null,
})

// A stateless lookup lets the UI use its wall clock directly, without accumulating timer-tick drift.
export function phaseAt(exerciseId, elapsedMs, remainingMs = Infinity, variantId = null) {
  const exercise = BREATHING_EXERCISES.find(item => item.id === exerciseId) || BREATHING_EXERCISES[1]
  const variant = exercise.variants.find(item => item.id === variantId)
    || exercise.variants.find(item => item.id === exercise.defaultVariant)
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const remaining = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : Infinity
  const duration = cycleDuration(variant.phases)
  const rounds = variant.rounds
  const completedCycles = Math.min(rounds, Math.floor(elapsed / duration))

  if (remaining <= 0) return finished(rounds, completedCycles, 'ended')
  if (remaining <= 5000) return finished(rounds, completedCycles, 'soon')
  if (elapsed >= duration * rounds) return finished(rounds, rounds)

  const cycleElapsed = elapsed % duration
  const cycle = completedCycles + 1
  // Do not begin another round unless it can finish before the final five seconds of rest.
  if (cycleElapsed === 0 && remaining < duration + 5000) {
    return finished(rounds, completedCycles, completedCycles ? 'complete' : 'not-enough-time')
  }

  let offset = 0
  for (let index = 0; index < variant.phases.length; index++) {
    const current = variant.phases[index]
    if (cycleElapsed < offset + current.durationMs) {
      const phaseElapsedMs = cycleElapsed - offset
      return {
        ...current,
        phaseIndex: index,
        phaseElapsedMs,
        progress: phaseElapsedMs / current.durationMs,
        cycle,
        rounds,
        roundsCompleted: completedCycles,
        completed: false,
        nextPhaseId: variant.phases[(index + 1) % variant.phases.length].id,
      }
    }
    offset += current.durationMs
  }

  return finished(rounds, completedCycles)
}
