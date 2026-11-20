import { useEffect, useRef, useState } from 'react'
import BodyMap from '../components/BodyMap.jsx'
import Icon from '../components/Icon.jsx'
import { AiButtons } from '../components/PublicAiButtons.jsx'
import { fmtDate, fmtDur, fmtNum } from '../lib/format.js'
import { getLang, setLang, t, useLang } from '../lib/i18n.js'
import { MUSCLE_NAME, rankOf } from '../lib/muscles.js'
import { api } from '../lib/api.js'

const imageBase = import.meta.env.VITE_IMG_BASE || '/img/'
const gifBase = import.meta.env.VITE_GIF_BASE || '/gif/'
const asset = (base, file) => base.replace(/\/?$/, '/') + file

function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root || !window.IntersectionObserver || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(items => items.forEach(item => {
      if (item.isIntersecting) { item.target.classList.add('is-visible'); observer.unobserve(item.target) }
    }), { threshold: 0.08 })
    root.querySelectorAll('.share-reveal').forEach((el, index) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return
      el.style.transitionDelay = `${Math.min(index, 3) * 50}ms`
      el.classList.add('will-reveal'); observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])
  return ref
}

function Stat({ label, value, suffix }) {
  const animate = Number.isFinite(value) && typeof window.requestAnimationFrame === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [number, setNumber] = useState(() => animate ? 0 : value)
  useEffect(() => {
    if (!animate) return
    let frame, start
    const tick = time => {
      start ??= time
      const progress = Math.min(1, (time - start) / 650)
      setNumber(value * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [animate, value])
  return <div className="tile share-stat"><div className="l">{label}</div><div className="v">{fmtNum(animate ? number : value)}{suffix && <small> {suffix}</small>}</div></div>
}

function Exercise({ entry }) {
  const [failedGif, setFailedGif] = useState(false)
  const [failedImage, setFailedImage] = useState(false)
  const image = entry.img && !failedImage ? asset(imageBase, entry.img) : null
  const media = !failedGif && entry.gif ? asset(gifBase, entry.gif) : image
  return <article className="share-exercise share-reveal">
    <div className="share-media" style={image && media !== image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}>
      {media ? <img key={media} src={media} loading="lazy" alt="" onError={() => { if (!failedGif && entry.gif) setFailedGif(true); else setFailedImage(true) }} /> : <Icon name="dumbbell" size={36} />}
    </div>
    <div className="share-exercise-content">
      <div className="share-exercise-head"><div><h3>{entry.name}</h3><p>{(entry.muscles || []).map(m => t(MUSCLE_NAME[m] || m)).join(' · ')}</p></div>{entry.superset && <span className="share-superset">{t('Superset')} {entry.superset}</span>}</div>
      {entry.scheme && <div className="share-scheme">{entry.scheme}{entry.restSec > 0 && <span> · {t('{0}s rest', entry.restSec)}</span>}</div>}
      {entry.sets?.length > 0 && <ol className="share-sets">{entry.sets.map((set, index) => <li key={index}><span className="share-set-index">{String(index + 1).padStart(2, '0')}</span><span>{set.label}</span><span className="share-set-flags">{set.warmup && <span>{t('Warm-up')}</span>}{set.pr && <span>{t('PR')}</span>}</span></li>)}</ol>}
      {entry.note && <p className="share-note">{entry.note}</p>}
    </div>
  </article>
}

function ShareContent({ data }) {
  const ref = useReveal()
  const s = data.snapshot
  const workout = s.kind === 'workout'
  const worked = rankOf(s.load || {}).worked
  const stats = s.stats || {}
  const duration = s.durationMs || stats.durationMs
  return <main className="share-page" ref={ref} style={{ '--acc': s.accent }}>
    <div className="share-wrap">
      <header className="share-top"><a href="/" className="share-brand"><img src="/icon-180.png" alt="" /> <span>openGym</span></a><span>{workout ? t('Workout') : t('Routine')}</span></header>
      <div className="share-intro share-reveal">
        <h1>{s.title}</h1>
        <div className="share-meta"><span>{fmtDate(s.date, false, true)}</span>{duration > 0 && <span>{fmtDur(duration)}</span>}{s.owner && <span>{s.owner}</span>}</div>
        {s.subtitle && <p>{s.subtitle}</p>}
      </div>
      <div className="tiles share-stats share-reveal">
        {workout ? <><Stat label={t('Volume')} value={stats.volume || 0} suffix={s.unit} /><Stat label={t('Sets')} value={stats.sets || 0} /><Stat label={t('PRs')} value={stats.prs || 0} /><Stat label={t('Exercises')} value={s.entries.length} /></> : <><Stat label={t('Exercises')} value={s.entries.length} /></>}
      </div>
      <section className="share-body share-reveal"><div className="share-body-copy"><h2>{t('Muscles worked')}</h2><div className="share-muscles">{worked.map(m => <span key={m}>{t(MUSCLE_NAME[m] || m)}</span>)}</div></div><BodyMap load={s.load} body={s.body} /></section>
      {s.days?.length > 0 && <p className="share-days">{s.days.map(day => t(day)).join(' · ')}</p>}
      <section className="share-work"><div className="share-section-head"><h2>{workout ? t('The work') : t('The plan')}</h2><span>{t(s.entries.length === 1 ? '{0} exercise' : '{0} exercises', s.entries.length)}</span></div>
        {s.entries.map((entry, index) => <Exercise key={`${entry.id}-${index}`} entry={entry} />)}
      </section>
      {s.note && <section className="share-session-note share-reveal"><h2>{workout ? t('Session note') : t('Routine note')}</h2><p>{s.note}</p></section>}
      <section className="share-coach share-reveal"><div><h2>{t('Ask your AI coach')}</h2><p>{t('Take this session further with a coach that knows your numbers.')}</p></div><AiButtons getText={() => s.aiText || s.title} /></section>
      <footer className="share-footer share-reveal"><a href="/" className="share-brand"><img src="/icon-180.png" alt="" /> <span>openGym</span></a><h2>{t('Run your own openGym')}</h2><p>{t('Your training, your data. A free, open-source workout tracker you can run yourself.')}</p><div className="share-footer-links"><a href="https://github.com/derrick-ships/openGym">{t('Explore the project')} ↗</a><a href="https://github.com/derrick-ships/openGym/blob/main/docs/DEPLOY_LOW_COST.md">{t('Low-cost deploy guide')} ↗</a><a href="/">{t('Get the app')} ↗</a></div></footer>
    </div>
  </main>
}

export default function SharePage() {
  useLang()
  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const language = navigator.language || 'en'
    setLang(/^pt-BR/i.test(language) ? 'pt-BR' : language.split('-')[0]).then(() => { document.documentElement.lang = getLang() })
    const theme = window.matchMedia?.('(prefers-color-scheme: light)')
    const apply = () => { document.documentElement.dataset.theme = theme?.matches ? 'light' : 'dark' }
    apply(); theme?.addEventListener?.('change', apply)
    let robots = document.querySelector('meta[name="robots"]')
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots) }
    robots.content = 'noindex'
    return () => theme?.removeEventListener?.('change', apply)
  }, [])
  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    const id = location.pathname.slice(3).split('/')[0]
    api('/api/shares/' + encodeURIComponent(id)).then(data => {
      if (!live) return
      document.title = `${data.snapshot.title} · openGym`
      const description = document.querySelector('meta[name="description"]')
      if (description) description.content = `${data.snapshot.title} · openGym`
      setState({ status: 'ready', data })
    }).catch(error => { if (live) setState({ status: error.status === 404 ? 'missing' : 'error' }) })
    return () => { live = false }
  }, [attempt])
  if (state.status === 'ready') return <ShareContent data={state.data} />
  return <main className="share-page"><div className="share-wrap"><header className="share-top"><a href="/" className="share-brand"><img src="/icon-180.png" alt="" /> openGym</a></header>
    {state.status === 'loading' ? <div className="share-skeleton" aria-label={t('Loading…')}><div /><div /><div /></div> : <section className="share-error"><h1>{state.status === 'missing' ? t('This share was removed or never existed') : t('Could not load this share.')}</h1>{state.status === 'error' && <button className="btn primary" onClick={() => setAttempt(n => n + 1)}>{t('Try again')}</button>}<a href="/">{t('Get the app')} ↗</a></section>}
  </div></main>
}
