import { useEffect, useRef, useState } from 'react'
import { phaseAt } from '../lib/breathing.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { clock } from './RestTimer.jsx'
import { useFullscreenOverlay } from './useFullscreenOverlay.js'

const hidden = () => document.hidden || document.visibilityState === 'hidden'
// Invert cubic Bézier x to get the matching y; bounded bisection stays stable at endpoints.
const cubic = (x, x1, y1, x2, y2) => {
  const point = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
  let low = 0, high = 1
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2
    if (point(mid, x1, x2) < x) low = mid
    else high = mid
  }
  return point((low + high) / 2, y1, y2)
}

export default function BreathingFocus({ exercise, sequence, phase, seconds, timer, variants, chooseVariant, onMinimize, onClose, addRest, stopRest, liveText }) {
  const overlayRef = useRef(null)
  const minimizeRef = useRef(null)
  const orbRef = useRef(null)
  const currentPhase = useRef(phase)
  const endsAt = useRef(timer.endsAt)
  const tilt = useRef({ x: 0, y: 0 })
  const displayed = useRef({ fill: 0, halo: 0 })
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
    if (reduced) return
    let frame = null, lastFrame = null, fill = displayed.current.fill, halo = displayed.current.halo, completionStart = null, completionFill = 0
    const written = new Map()
    const write = (name, value, unit = '') => {
      if (written.has(name) && Math.abs(written.get(name) - value) <= .002) return
      written.set(name, value)
      orbRef.current?.style.setProperty(name, `${value.toFixed(4)}${unit}`)
    }
    const draw = timestamp => {
      if (hidden()) { frame = null; return }
      const now = Date.now()
      const current = currentPhase.current.completed ? currentPhase.current : phaseAt(exercise.id, now - sequence.startedAt, Math.max(0, endsAt.current - now), sequence.variantId)
      const progress = Math.max(0, Math.min(1, current.progress))
      const eased = current.motion === 'exhale' ? cubic(progress, .45, 0, .3, 1) : cubic(progress, .3, .05, .2, 1)
      let target = current.motion === 'inhale' ? eased : current.motion === 'exhale' ? 1 - eased : current.id === 'hold-empty' || current.completed ? 0 : 1
      if (exercise.id === 'physiological-sigh' && current.motion === 'inhale') target = current.id === 'second-inhale' ? .82 + .18 * eased : .82 * eased
      const dt = lastFrame === null ? 16 : Math.max(0, Math.min(100, timestamp - lastFrame))
      lastFrame = timestamp
      if (current.completed) {
        if (completionStart === null) { completionStart = timestamp; completionFill = fill }
        fill = completionFill * (1 - cubic(Math.min(1, (timestamp - completionStart) / 700), .23, 1, .32, 1))
      } else {
        completionStart = null
        fill += (Math.pow(target, 1.15) - fill) * (1 - Math.exp(-dt / 120))
      }
      halo += (fill - halo) * (1 - Math.exp(-dt / (current.motion === 'exhale' || current.completed ? 450 : 250)))
      displayed.current.fill = fill
      displayed.current.halo = halo
      const pulse = current.motion === 'hold' ? Math.sin(current.phaseElapsedMs * Math.PI / 2000) * .015 : 0
      write('--breath-p', fill)
      write('--halo-p', halo)
      write('--breath-pulse', pulse)
      write('--phase-p', current.completed ? 0 : progress)
      write('--tilt-x', tilt.current.x, 'deg')
      write('--tilt-y', tilt.current.y, 'deg')
      frame = requestAnimationFrame(draw)
    }
    const visibility = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      lastFrame = null
      if (!hidden()) frame = requestAnimationFrame(draw)
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [exercise.id, sequence, reduced])

  useEffect(() => {
    if (!reduced || !orbRef.current) return
    const level = phase.completed || phase.id === 'hold-empty' ? 0 : phase.motion === 'exhale' || phase.motion === 'hold' ? 1 : 0
    displayed.current = { fill: level, halo: level }
    orbRef.current.style.setProperty('--breath-p', level)
    orbRef.current.style.setProperty('--halo-p', level)
    orbRef.current.style.setProperty('--phase-p', 0)
    orbRef.current.style.setProperty('--breath-pulse', 0)
  }, [phase.id, phase.cycle, phase.completed, phase.motion, reduced])

  const roundText = phase.completed ? phase.roundsCompleted : phase.cycle
  return <div ref={overlayRef} className={'breathing-focus' + (reduced ? ' reduced-motion' : '')} role="dialog" aria-modal="true" aria-labelledby="breathing-focus-name">
    <header className="breathing-focus-head">
      <div className="breathing-focus-title">
        <div className="breathing-focus-eyebrow">{t('Breathing guide')}</div>
        <h2 id="breathing-focus-name">{t(exercise.label)}</h2>
      </div>
      <button type="button" ref={minimizeRef} className="breathing-focus-icon" aria-label={t('Minimize breathing guide')} onClick={onMinimize}><Icon name="minimize" /></button>
      <button type="button" className="breathing-focus-icon" aria-label={t('Close breathing guide')} onClick={onClose}><Icon name="xmark" /></button>
    </header>
    <div className="breathing-focus-stage">
      <div ref={orbRef} className={'breathing-focus-art ' + (phase.motion === 'exhale' ? 'release' : 'draw')} aria-hidden="true">
        <div className="breathing-field" />
        <div className="breathing-ground" />
        <div className="breathing-halo halo-back" />
        <div className="breathing-halo halo-front" />
        <div className="breathing-sphere"><div className="breathing-fill" /><div className="breathing-sheen" /></div>
        <svg className="breathing-progress-ring" viewBox="0 0 100 100"><circle className="track" cx="50" cy="50" r="48" /><circle className="progress" cx="50" cy="50" r="48" pathLength="1" /></svg>
        {!phase.completed && seconds > 0 && <span className="breathing-count">{seconds}</span>}
      </div>
      <div className="breathing-focus-copy">
        <div className="breathing-focus-phase">{phase.label && t(phase.label)}</div>
        <div className="breathing-focus-cue">{phase.cue && t(phase.cue)}</div>
        <div className="breathing-focus-dots" aria-hidden="true">{Array.from({ length: phase.rounds }, (_, i) => <i key={i} className={i < phase.roundsCompleted ? 'filled' : ''} />)}</div>
        {roundText > 0 && <div className="breathing-focus-round">{t('Round {0} of {1}', roundText, phase.rounds)}</div>}
      </div>
    </div>
    <footer className="breathing-focus-footer">
      {variants.length > 1 && <div className="breathing-focus-modes" role="group" aria-label={t('Breathing mode')}>
        {variants.map(variant => <button type="button" key={variant.id} aria-pressed={sequence.variantId === variant.id} onClick={() => chooseVariant(variant.id)}>{variant.numericLabel ? variant.label : t(variant.label)}</button>)}
      </div>}
      <div className="breathing-focus-rest"><span>{t('Rest timer')}</span><strong role="timer" aria-live="off">{clock(timer.left)}</strong></div>
      <div className="breathing-focus-actions"><button type="button" onClick={() => addRest(15)}>+15s</button><button type="button" onClick={stopRest}>{t('Skip')}</button></div>
      {exercise.energising && <p className="breathing-focus-warning">{t('Stop if lightheaded')}</p>}
      <p className="breathing-focus-safety">{t('Breathe comfortably. Stop if uncomfortable or dizzy.')}</p>
    </footer>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveText}</span>
  </div>
}
