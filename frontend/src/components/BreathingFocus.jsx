import { useEffect, useRef, useState } from 'react'
import { phaseAt } from '../lib/breathing.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { clock } from './RestTimer.jsx'
import { useFullscreenOverlay } from './useFullscreenOverlay.js'

const hidden = () => document.hidden || document.visibilityState === 'hidden'
const ease = p => (1 - Math.cos(Math.PI * p)) / 2

export default function BreathingFocus({ exercise, sequence, phase, seconds, timer, variants, chooseVariant, onMinimize, onClose, addRest, stopRest, liveText }) {
  const overlayRef = useRef(null)
  const minimizeRef = useRef(null)
  const orbRef = useRef(null)
  const currentPhase = useRef(phase)
  const endsAt = useRef(timer.endsAt)
  const tilt = useRef({ x: 0, y: 0 })
  currentPhase.current = phase
  endsAt.current = timer.endsAt
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false)
  useFullscreenOverlay(true, overlayRef, minimizeRef, onMinimize)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const change = event => setReduced(event.matches)
    media.addEventListener?.('change', change)
    return () => media.removeEventListener?.('change', change)
  }, [])

  useEffect(() => {
    if (reduced || !window.DeviceOrientationEvent || typeof window.DeviceOrientationEvent.requestPermission === 'function') return
    const orient = event => {
      if (event.beta == null || event.gamma == null) return
      tilt.current = { x: Math.max(-4, Math.min(4, (event.beta - 30) / 15)), y: Math.max(-4, Math.min(4, event.gamma / 15)) }
    }
    window.addEventListener('deviceorientation', orient)
    return () => window.removeEventListener('deviceorientation', orient)
  }, [reduced])

  useEffect(() => {
    let frame = null
    let lastFrame = 0
    let halo = 0
    const draw = timestamp => {
      if (hidden()) { frame = null; return }
      const now = Date.now()
      const current = currentPhase.current.completed ? currentPhase.current : phaseAt(exercise.id, now - sequence.startedAt, Math.max(0, endsAt.current - now), sequence.variantId)
      const p = ease(Math.max(0, Math.min(1, current.progress)))
      let fill = current.motion === 'inhale' ? p : current.motion === 'exhale' ? 1 - p : current.id === 'hold-empty' || current.completed ? 0 : 1
      if (exercise.id === 'physiological-sigh' && current.motion === 'inhale') fill = current.id === 'second-inhale' ? .82 + .18 * p : .82 * p
      // Ease the halo behind the core; wall-clock phase remains the source of truth.
      const dt = lastFrame && timestamp ? Math.min(100, timestamp - lastFrame) : 100
      lastFrame = timestamp || 0
      halo += (fill - halo) * (1 - Math.exp(-dt / 350))
      const settle = current.motion === 'hold' && current.id !== 'hold-empty' ? .012 * Math.exp(-current.phaseElapsedMs / 600) * Math.sin(current.phaseElapsedMs / 180) : 0
      const pulse = current.motion === 'hold' ? Math.sin(current.phaseElapsedMs * Math.PI / 2000) * .015 + settle : 0
      if (reduced) fill = fill < .5 ? 0 : 1
      const art = orbRef.current
      if (art) {
        art.style.setProperty('--breath-p', fill.toFixed(4))
        art.style.setProperty('--halo-p', (reduced ? fill : halo).toFixed(4))
        art.style.setProperty('--breath-pulse', pulse.toFixed(4))
        art.style.setProperty('--tilt-x', `${tilt.current.x.toFixed(2)}deg`)
        art.style.setProperty('--tilt-y', `${tilt.current.y.toFixed(2)}deg`)
      }
      frame = requestAnimationFrame(draw)
    }
    const visibility = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      if (!hidden()) draw()
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [exercise.id, sequence, reduced])

  const roundText = phase.completed ? phase.roundsCompleted : phase.cycle
  return <div ref={overlayRef} className={'breathing-focus' + (reduced ? ' reduced-motion' : '')} role="dialog" aria-modal="true" aria-labelledby="breathing-focus-name">
    <header className="breathing-focus-head">
      <div className="breathing-focus-title">
        <div className="breathing-focus-eyebrow">{t('Breathing guide')}</div>
        <h2 id="breathing-focus-name">{t(exercise.label)}</h2>
        {variants.length > 1 && <div className="breathing-focus-modes" role="group" aria-label={t('Breathing mode')}>
          {variants.map(variant => <button type="button" key={variant.id} aria-pressed={sequence.variantId === variant.id} onClick={() => chooseVariant(variant.id)}>{t(variant.label)}</button>)}
        </div>}
      </div>
      <button type="button" ref={minimizeRef} className="breathing-focus-icon" aria-label={t('Minimize breathing guide')} onClick={onMinimize}><Icon name="minimize" /></button>
      <button type="button" className="breathing-focus-icon" aria-label={t('Close breathing guide')} onClick={onClose}><Icon name="xmark" /></button>
    </header>
    <div className="breathing-focus-stage">
      <div ref={orbRef} className={'breathing-focus-art ' + (phase.motion === 'exhale' ? 'release' : 'draw')} aria-hidden="true">
        <div className="breathing-field" />
        <div className="breathing-halo halo-back" />
        <div className="breathing-halo halo-front" />
        <div className="breathing-sphere"><div className="breathing-fill" /><div className="breathing-sheen" /></div>
      </div>
      <div className="breathing-focus-copy">
        <div className="breathing-focus-phase">{phase.label && t(phase.label)}{seconds > 0 && !phase.completed && <span aria-hidden="true">{seconds}</span>}</div>
        <div className="breathing-focus-cue">{phase.cue && t(phase.cue)}</div>
        <div className="breathing-focus-dots" aria-hidden="true">{Array.from({ length: phase.rounds }, (_, i) => <i key={i} className={i < phase.roundsCompleted ? 'filled' : ''} />)}</div>
        {roundText > 0 && <div className="breathing-focus-round">{t('Round {0} of {1}', roundText, phase.rounds)}</div>}
      </div>
    </div>
    <footer className="breathing-focus-footer">
      <div className="breathing-focus-rest"><span>{t('Rest timer')}</span><strong role="timer" aria-live="off">{clock(timer.left)}</strong></div>
      <div className="breathing-focus-actions"><button type="button" onClick={() => addRest(15)}>+15s</button><button type="button" onClick={stopRest}>{t('Skip')}</button></div>
      {exercise.energising && <p className="breathing-focus-warning">{t('Stop if lightheaded')}</p>}
      <p className="breathing-focus-safety">{t('Breathe comfortably. Stop if uncomfortable or dizzy.')}</p>
    </footer>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</span>
  </div>
}
