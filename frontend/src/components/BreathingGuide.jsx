import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BREATHING_EXERCISES, phaseAt } from '../lib/breathing.js'
import { hapticForTransition, phaseBoundaryHaptic } from '../lib/breathing-haptics.js'
import BreathingFocus from './BreathingFocus.jsx'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

const isHidden = () => typeof document === 'undefined' || document.hidden || document.visibilityState === 'hidden'
const phaseToken = phase => `${phase.cycle}:${phase.phaseIndex}:${phase.id}`
const phaseSeconds = phase => Math.max(0, Math.ceil((phase.durationMs - phase.phaseElapsedMs) / 1000))

export default function BreathingGuide({ exerciseId, startedAt, timer, hapticsEnabled, onComplete, addRest, stopRest, slot }) {
  const exercise = BREATHING_EXERCISES.find(item => item.id === exerciseId) || BREATHING_EXERCISES[1]
  const [sequence, setSequence] = useState({ startedAt, variantId: exercise.defaultVariant })
  const [expanded, setExpanded] = useState(true)
  const minimize = useCallback(() => setExpanded(false), [])
  const [phase, setPhase] = useState(() => phaseAt(exercise.id, Date.now() - startedAt, timer.endsAt - Date.now(), exercise.defaultVariant))
  const [seconds, setSeconds] = useState(() => phaseSeconds(phase))
  const [classicAvailable, setClassicAvailable] = useState(() => timer.endsAt - Date.now() >= 80_000)
  const [visible, setVisible] = useState(() => !isHidden())
  const [syncEpoch, setSyncEpoch] = useState(0)
  const [overlayRoot] = useState(() => document.getElementById('app')?.parentElement || document.getElementById('timer')?.parentElement || document.body)
  const previousToken = useRef(null)
  const previousPhase = useRef(null)
  const stoppedAtRound = useRef(null)
  const active = useRef(true)
  const effectEpoch = useRef(0)
  const endsAt = useRef(timer.endsAt)
  endsAt.current = timer.endsAt

  const variants = exercise.variants.filter(variant =>
    variant.id !== '4-7-8' || classicAvailable || sequence.variantId === variant.id
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
      const elapsed = Math.max(0, now - sequence.startedAt)
      let next = phaseAt(exercise.id, elapsed, remaining, sequence.variantId)
      // Check the start of a round, not the sampling tick: intervals rarely land exactly on a boundary.
      if (!next.completed && (previousPhase.current === null || next.cycle > previousPhase.current.cycle)) {
        const variant = exercise.variants.find(item => item.id === sequence.variantId)
        const duration = variant.phases.reduce((sum, item) => sum + item.durationMs, 0)
        const insideRound = elapsed % duration
        const atStart = phaseAt(exercise.id, elapsed - insideRound, remaining + insideRound, sequence.variantId)
        if (atStart.completed) next = atStart
      }
      if (next.completed && next.label === 'Not enough time for a full round') stoppedAtRound.current ??= next.roundsCompleted
      // Once a round was declined it cannot silently start late after rest is extended.
      if (stoppedAtRound.current !== null && !next.completed) {
        next = { ...next, id: 'ready', label: 'Not enough time for a full round', cue: 'Take a normal breath', motion: 'still', phaseIndex: -1, completed: true, durationMs: 0, phaseElapsedMs: 0, roundsCompleted: stoppedAtRound.current }
      }
      const token = phaseToken(next)
      if (!next.id) onComplete()
      const kind = allowHaptic ? hapticForTransition(previousPhase.current, next) : null
      if (kind) {
        void phaseBoundaryHaptic(hapticsEnabled, () =>
          active.current && effectEpoch.current === thisEffect && !isHidden() && Date.now() < endsAt.current, kind
        )
      }
      if (token !== previousToken.current || !allowHaptic) setPhase(next)
      previousToken.current = token
      previousPhase.current = next
      setSeconds(phaseSeconds(next))
      setClassicAvailable(remaining >= 80_000)
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
  }, [exercise.id, sequence, hapticsEnabled, timer.endsAt, onComplete])

  const chooseVariant = id => {
    if (id === sequence.variantId) return
    if (id === '4-7-8' && timer.endsAt - Date.now() < 80_000) return
    previousToken.current = null
    previousPhase.current = null
    stoppedAtRound.current = null
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

  return <>
    {createPortal(<section className="breathing-guide" id="breathing-guide" aria-label={t('Breathing guide')} data-expanded={expanded}>
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
        <button type="button" className="breathing-expand" aria-label={t('Expand breathing guide')} onClick={() => setExpanded(true)}><Icon name="expand" /></button>
      </div>

      {variants.length > 1 && (
        <div className="breathing-modes" role="group" aria-label={t('Breathing mode')}>
          {variants.map(variant => (
            <Button
              key={variant.id}
              size="sm"
              className="breathing-mode"
              aria-pressed={sequence.variantId === variant.id}
              onClick={() => chooseVariant(variant.id)}
            >{t(variant.label)}</Button>
          ))}
        </div>
      )}

      {exercise.energising && <p className="breathing-safety">{t('Stop if lightheaded')}</p>}
      <p className="breathing-safety">{t('Breathe comfortably. Stop if uncomfortable or dizzy.')}</p>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</span>
    </section>, slot)}
    {expanded && createPortal(<BreathingFocus exercise={exercise} sequence={sequence} phase={phase} seconds={seconds} timer={timer}
      variants={variants} chooseVariant={chooseVariant} onMinimize={minimize} onClose={onComplete} addRest={addRest} stopRest={stopRest} liveText={liveText} />, overlayRoot)}
  </>
}
