import { useCallback, useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'
import BreathingGuide from './BreathingGuide.jsx'

const clock = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')

// One bar, two meanings: the rest countdown between sets, and the work countdown during a
// timed set (issue #16). They are mutually exclusive by construction — startWork() stops any
// running rest — so the bar can never have to show both, and a work set gets its own colour
// plus a "Done" that logs the time actually held.
export default function RestTimer() {
  const timer = useUI(s => s.timer)
  const work = useUI(s => s.work)
  const settings = useStore(s => s.S)
  const { addRest, stopRest, finishWorkEarly, stopWork } = useUI()
  const exerciseId = settings.breathingExercise || 'coherent'
  const [guide, setGuide] = useState(null)
  const closeGuide = useCallback(() => setGuide(null), [])
  const restIdentity = useRef(null)
  const on = work || timer
  const restKey = timer && !work ? String(timer.endsAt - timer.total * 1000) : null
  // The bar is fixed above the tab bar and floats over whatever is beneath it — during a
  // rest that was the next set's row. Extra bottom padding lets the page scroll clear.
  useEffect(() => {
    document.body.classList.toggle('resting', !!on)
    return () => document.body.classList.remove('resting')
  }, [!!on])
  useEffect(() => {
    if (!restKey) {
      restIdentity.current = null
      setGuide(null)
      return
    }
    if (restIdentity.current !== null && restIdentity.current !== restKey) setGuide(null)
    restIdentity.current = restKey
  }, [restKey])
  useEffect(() => {
    if (guide && guide.restKey === restKey && guide.exerciseId !== exerciseId) {
      setGuide({ exerciseId, startedAt: Date.now(), restKey })
    }
  }, [exerciseId, guide, restKey])
  useEffect(() => {
    document.body.classList.toggle('rest-guide', !!guide && !!timer && !work)
    return () => document.body.classList.remove('rest-guide')
  }, [!!guide, !!timer, !!work])
  if (!on) return null
  const pct = (on.left / on.total) * 100

  if (work) return (
    <div id="timer" className="working">
      <div className="t">{clock(work.left)}</div>
      <div className="grow">
        {work.label && <div className="lbl">{work.label}</div>}
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
      </div>
      <Button size="sm" onClick={stopWork}>{t('Cancel')}</Button>
      <Button size="sm" variant="primary" icon="check" onClick={finishWorkEarly}>{t('Done')}</Button>
    </div>
  )
  // Three controls plus the clock don't fit one line on a phone — at 360px the bar is left
  // with about 30px and stops saying anything. So the rest variant stacks: clock and bar
  // read at a glance, controls get their own row. −15 and +15 sit together in number-line
  // order; Skip is pushed to the far edge, away from the button you tap to buy more time.
  return (
    <div id="timer" className={`rest${guide ? ' guided' : ''}`}>
      <div className="head">
        <div className="t">{clock(timer.left)}</div>
        <div className="bar"><i style={{ width: pct + '%' }} /></div>
        <Button
          size="sm"
          variant={guide ? 'plain' : 'breathe'}
          className="breathe-toggle"
          aria-label={guide ? t('Close breathing guide') : undefined}
          aria-expanded={!!guide}
          aria-controls={guide ? 'breathing-guide' : undefined}
          onClick={() => setGuide(current => current ? null : { exerciseId, startedAt: Date.now(), restKey })}
          icon={guide ? 'xmark' : undefined}
        >{guide ? null : t('Breathe')}</Button>
      </div>
      {guide && <BreathingGuide
        key={guide.exerciseId}
        exerciseId={guide.exerciseId}
        hapticsEnabled={settings.breathingHaptics !== false}
        startedAt={guide.startedAt}
        timer={timer}
        onComplete={closeGuide}
      />}
      <div className="acts">
        <Button size="sm" icon="minus" onClick={() => addRest(-15)}>15s</Button>
        <Button size="sm" icon="plus" onClick={() => addRest(15)}>15s</Button>
        <Button size="sm" variant="primary" className="skip" onClick={stopRest}>{t('Skip')}</Button>
      </div>
    </div>
  )
}
