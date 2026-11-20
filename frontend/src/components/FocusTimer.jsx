import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { clock } from './RestTimer.jsx'
import { useFullscreenOverlay } from './useFullscreenOverlay.js'

// The open/minimized choice belongs to this hold, not to the saved preference.
export default function FocusTimer({ ref }) {
  const work = useUI(s => s.work)
  const autoOpen = useStore(s => s.S.focusTimer !== false)
  const finishWorkEarly = useUI(s => s.finishWorkEarly)
  const stopWork = useUI(s => s.stopWork)
  const [choice, setChoice] = useState(null)
  const key = work?.endsAt
  const open = !!work && (choice?.key === key ? choice.open : autoOpen)
  const doneRef = useRef(null)
  const overlayRef = useRef(null)
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false)

  useImperativeHandle(ref, () => ({ expand: () => { if (work) setChoice({ key, open: true }) } }), [key, work])
  useEffect(() => { if (!work) setChoice(null) }, [!!work])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return
    const onChange = event => setReduced(event.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])
  const minimize = useCallback(() => setChoice({ key, open: false }), [key])
  useFullscreenOverlay(open, overlayRef, doneRef, minimize)

  if (!open) return null
  const fraction = Math.max(0, Math.min(1, work.left / work.total))
  const announcement = work.left === 10 ? t('10 seconds remaining') : work.left === 3 ? t('3 seconds remaining') : ''
  return <div ref={overlayRef} className={'focus-timer' + (reduced ? ' reduced-motion' : '') + (work.left <= 3 ? ' final-seconds' : '')}
    role="dialog" aria-modal="true" aria-labelledby="focus-timer-name">
    <header className="focus-timer-head">
      <div className="focus-timer-heading">
        <div className="focus-timer-eyebrow">{t('Timed set')}</div>
        <h2 id="focus-timer-name" title={work.label || t('Timed set')}>{work.label || t('Timed set')}</h2>
      </div>
      <button type="button" className="focus-timer-minimize" aria-label={t('Minimize timer')}
        onClick={() => setChoice({ key, open: false })}><Icon name="minimize" /></button>
    </header>
    <div className="focus-timer-center">
      <div className={'focus-timer-clock' + (work.left >= 600 ? ' long' : '')} role="timer" aria-live="off">{clock(work.left)}</div>
      <div className="focus-timer-caption">{t('Time remaining')}</div>
    </div>
    <footer className="focus-timer-footer">
      <div className="focus-timer-progress" aria-hidden="true"><i style={{ transform: `scaleX(${fraction})` }} /></div>
      <div className="focus-timer-actions">
        <button type="button" className="focus-timer-stop" onClick={stopWork}>{t('Cancel')}</button>
        <button type="button" ref={doneRef} className="focus-timer-done" onClick={finishWorkEarly}>{t('Done')}</button>
      </div>
    </footer>
    <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
  </div>
}
