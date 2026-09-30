import { useEffect, useRef, useState } from 'react'
import { BREATHING_EXERCISES, phaseAt } from '../lib/breathing.js'
import { phaseBoundaryHaptic } from '../lib/breathing-haptics.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

const isHidden = () => typeof document === 'undefined' || document.hidden || document.visibilityState === 'hidden'
const phaseToken = phase => `${phase.cycle}:${phase.phaseIndex}:${phase.id}`
const phaseSeconds = phase => Math.max(0, Math.ceil((phase.durationMs - phase.phaseElapsedMs) / 1000))

export default function BreathingGuide({ exerciseId, startedAt, timer, hapticsEnabled }) {
  const exercise = BREATHING_EXERCISES.find(item => item.id === exerciseId) || BREATHING_EXERCISES[1]
  const [sequence, setSequence] = useState({ startedAt, variantId: exercise.defaultVariant })
  const [phase, setPhase] = useState(() => phaseAt(exercise.id, Date.now() - startedAt, timer.endsAt - Date.now(), exercise.defaultVariant))
  const [seconds, setSeconds] = useState(() => phaseSeconds(phase))
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, timer.endsAt - Date.now()))
  const [visible, setVisible] = useState(() => !isHidden())
  const [syncEpoch, setSyncEpoch] = useState(0)
  const previousToken = useRef(null)
  const active = useRef(true)
  const effectEpoch = useRef(0)
  const endsAt = useRef(timer.endsAt)
  endsAt.current = timer.endsAt

  const variants = exercise.variants.filter(variant =>
    variant.id !== '4-7-8' || remainingMs >= 80_000 || sequence.variantId === variant.id
  )

  useEffect(() => {
    const thisEffect = ++effectEpoch.current
    active.current = true
    let tickId = null
    const update = allowHaptic => {
      if (isHidden()) {
        setVisible(false)
        return
      }
      setVisible(true)
      const now = Date.now()
      const remaining = Math.max(0, endsAt.current - now)
      const next = phaseAt(exercise.id, now - sequence.startedAt, remaining, sequence.variantId)
      const token = phaseToken(next)
      if (allowHaptic && previousToken.current && token !== previousToken.current && !next.completed) {
        void phaseBoundaryHaptic(hapticsEnabled, () =>
          active.current && effectEpoch.current === thisEffect && !isHidden() && Date.now() < endsAt.current
        )
      }
      if (token !== previousToken.current || !allowHaptic) setPhase(next)
      previousToken.current = token
      setSeconds(phaseSeconds(next))
      setRemainingMs(remaining)
    }
    const startTicks = allowHaptic => {
      clearInterval(tickId)
      update(allowHaptic)
      tickId = setInterval(() => update(true), 250)
    }
    const onVisibility = () => {
      if (isHidden()) {
        setVisible(false)
        clearInterval(tickId)
        tickId = null
      } else {
        setSyncEpoch(epoch => epoch + 1)
        startTicks(false)
      }
    }

    startTicks(false)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active.current = false
      clearInterval(tickId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [exercise.id, sequence, hapticsEnabled, timer.endsAt])

  const chooseVariant = id => {
    if (id === sequence.variantId) return
    if (id === '4-7-8' && timer.endsAt - Date.now() < 80_000) return
    previousToken.current = null
    setSequence({ startedAt: Date.now(), variantId: id })
  }

  if (!phase.id) return null
  const round = phase.completed ? phase.roundsCompleted : phase.cycle
  const roundText = round > 0 ? t('Round {0} of {1}', round, phase.rounds) : ''
  const liveText = [phase.label && t(phase.label), phase.cue && t(phase.cue), roundText].filter(Boolean).join('. ')
  const moving = phase.motion === 'inhale' || phase.motion === 'exhale'
  const orbClass = [
    'breathing-orb',
    moving ? phase.motion : phase.id === 'hold-empty' ? 'hold-empty' : phase.motion,
    phase.id === 'second-inhale' ? 'second-inhale' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className="breathing-guide" id="breathing-guide" aria-label={t('Breathing guide')}>
      <div className="breathing-guide-main">
        <div
          key={`${phaseToken(phase)}:${syncEpoch}`}
          className={orbClass}
          aria-hidden="true"
          style={{
            '--breath-duration': `${phase.durationMs}ms`,
            '--breath-delay': `-${phase.phaseElapsedMs}ms`,
            animationPlayState: visible ? 'running' : 'paused',
          }}
        />
        <div className="breathing-copy">
          <div className="breathing-phase">
            <span>{phase.label && t(phase.label)}</span>
            {seconds > 0 && !phase.completed && <span className="breathing-seconds" aria-hidden="true">{seconds}s</span>}
          </div>
          {phase.cue && <div className="breathing-cue">{t(phase.cue)}</div>}
          {roundText && <div className="breathing-round">{roundText}</div>}
        </div>
      </div>

      {variants.length > 1 && (
        <div className="breathing-modes" role="group" aria-label={t('Breathing mode')}>
          {variants.map(variant => (
            <Button
              key={variant.id}
              size="sm"
              className="breathing-mode"
              aria-pressed={sequence.variantId === variant.id}
              disabled={variant.id === '4-7-8' && remainingMs < 80_000}
              onClick={() => chooseVariant(variant.id)}
            >{t(variant.label)}</Button>
          ))}
        </div>
      )}

      <p className="breathing-safety">{t('Breathe comfortably. Stop if uncomfortable or dizzy.')}</p>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</span>
    </section>
  )
}
