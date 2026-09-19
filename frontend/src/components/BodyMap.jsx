import { useEffect, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME, levelsOf } from '../lib/muscles.js'
import { t } from '../lib/i18n.js'

// Front and back views of a body, each muscle shaded by how hard it was worked.
//
// The five shade steps are the same ones the activity heatmap uses (.hm-c.l0…l4), so
// "more accent = more training" means one thing everywhere in the app rather than two.
//
// The geometry is ~90 KB and only some screens show a map, so it is fetched on first
// render instead of riding along in the main bundle. Until it lands the component
// renders nothing but keeps its height, so nothing below it jumps on arrival.

let CACHE = null                                  // shared across every mounted map
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('../lib/body-paths.js').then(m => (CACHE = m.default))
    PENDING.then(p => { if (alive) setPaths(p) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return paths
}

function View({ view, levels, onMuscle, selected }) {
  const activate = (event, slug) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.key === ' ') event.preventDefault()
    onMuscle(slug)
  }
  return (
    <svg className="bm-v" viewBox={view.vb} role={onMuscle ? 'group' : 'img'}>
      {INERT.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className="bm-sil" d={d} />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) =>
        <path
          key={slug + i}
          className={'bm-m l' + (levels[slug] || 0) + (selected === slug ? ' sel' : '')}
          d={d}
          onClick={onMuscle ? () => onMuscle(slug) : undefined}
          onKeyDown={onMuscle ? event => activate(event, slug) : undefined}
          role={onMuscle ? 'button' : undefined}
          tabIndex={onMuscle ? 0 : undefined}
          aria-label={onMuscle ? t(MUSCLE_NAME[slug]) : undefined}
          aria-pressed={onMuscle ? selected === slug : undefined}
        >
          <title>{t(MUSCLE_NAME[slug])}</title>
        </path>))}
    </svg>
  )
}

const escapeXml = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const FALLBACK_COLORS = {
  surface: '#1b1c20', label: '#f4f5f7', accent: '#35d35b', base: '#33363b',
}

function cssVar(style, name, fallback) {
  return style?.getPropertyValue(name)?.trim() || fallback
}

function wrapDisplayText(value, maxLength) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return ['']
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  words.forEach(word => {
    // A pasted routine name can be one long token. Split that token rather than letting it
    // run beyond the fixed canvas; title display is the only place where this is appropriate.
    if (word.length > maxLength) {
      if (line) { lines.push(line); line = '' }
      for (let i = 0; i < word.length; i += maxLength) lines.push(word.slice(i, i + maxLength))
      return
    }
    const next = line ? `${line} ${word}` : word
    if (line && next.length > maxLength) { lines.push(line); line = word } else line = next
  })
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function inlinePathStyles(svg, container) {
  const rootStyle = typeof getComputedStyle === 'function' ? getComputedStyle(container) : null
  const surface = cssVar(rootStyle, '--surface', FALLBACK_COLORS.surface)
  const label = cssVar(rootStyle, '--label', FALLBACK_COLORS.label)
  const accent = cssVar(rootStyle, '--acc', FALLBACK_COLORS.accent)
  const base = cssVar(rootStyle, '--bm-base', FALLBACK_COLORS.base)
  const clone = svg.cloneNode(true)
  // CSS is resolved against the mounted tree.  A detached clone has no inherited
  // variables or stylesheet context, so pairing paths by index is intentional: read
  // computed values from the original node, then write them onto its export clone.
  const originals = [...svg.querySelectorAll('path')]
  const paths = [...clone.querySelectorAll('path')]
  clone.removeAttribute('role')
  clone.removeAttribute('aria-label')
  clone.removeAttribute('aria-labelledby')
  clone.querySelectorAll('[role], [tabindex], [aria-pressed], [aria-label]').forEach(node => {
    node.removeAttribute('role')
    node.removeAttribute('tabindex')
    node.removeAttribute('aria-pressed')
    node.removeAttribute('aria-label')
  })
  paths.forEach((path, index) => {
    const original = originals[index]
    const computed = typeof getComputedStyle === 'function' && original ? getComputedStyle(original) : null
    const classes = new Set((original?.getAttribute('class') || path.getAttribute('class') || '').split(/\s+/).filter(Boolean))
    const fallback = classes.has('bm-sil') ? surface
      : classes.has('l4') ? accent
        : classes.has('l3') ? '#26a24a'
          : classes.has('l2') ? '#3b8e53'
            : classes.has('l1') ? '#416c4e' : base
    path.setAttribute('fill', computed?.fill || fallback)
    path.setAttribute('stroke', computed?.stroke || surface)
    path.setAttribute('stroke-width', computed?.strokeWidth || '2.5')
    path.setAttribute('stroke-linejoin', computed?.strokeLinejoin || 'round')
    path.removeAttribute('style')
    path.removeAttribute('onclick')
    path.removeAttribute('onkeydown')
  })
  return clone
}

/**
 * Serialize the two already-rendered BodyMap views into one self-contained SVG.
 * Keeping this tied to mounted SVGs means the export has the exact body variant and
 * highlight levels the user is looking at; an unloaded map fails closed instead.
 */
export function bodyMapSvg(container, { title = 'Workout', labels = [] } = {}) {
  const views = [...(container?.querySelectorAll?.('svg.bm-v') || [])]
  if (views.length < 2) throw new Error('two body views are required before exporting')
  const rootStyle = typeof getComputedStyle === 'function' ? getComputedStyle(container) : null
  const surface = cssVar(rootStyle, '--surface', FALLBACK_COLORS.surface)
  const label = cssVar(rootStyle, '--label', FALLBACK_COLORS.label)
  const titleLines = wrapDisplayText(title, 46)
  const titleOffset = Math.max(0, titleLines.length - 1) * 34
  const cleanLabels = [...new Set((labels || []).map(value => String(value || '').trim()).filter(Boolean))]
  const labelLines = []
  let line = ''
  cleanLabels.forEach(value => {
    const next = line ? `${line} · ${value}` : value
    if (line && next.length > 78) { labelLines.push(line); line = value } else line = next
  })
  if (line) labelLines.push(line)
  const viewMarkup = views.slice(0, 2).map((view, index) => {
    const clone = inlinePathStyles(view, container)
    clone.setAttribute('x', index ? '660' : '70')
    clone.setAttribute('y', String(104 + titleOffset))
    clone.setAttribute('width', '470')
    clone.setAttribute('height', '660')
    clone.setAttribute('preserveAspectRatio', 'xMidYMin meet')
    return `${clone.outerHTML}<text x="${index ? 895 : 305}" y="${790 + titleOffset}" fill="${escapeXml(label)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" font-weight="600">${index ? 'Back' : 'Front'}</text>`
  }).join('')
  const labelsTop = 825 + titleOffset
  const labelsMarkup = labelLines.map((value, index) => `<text x="600" y="${labelsTop + index * 26}" fill="${escapeXml(label)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18">${escapeXml(value)}</text>`).join('')
  const height = 850 + titleOffset + Math.max(0, labelLines.length - 1) * 26
  const titleMarkup = titleLines.map((value, index) => `<text x="600" y="${58 + index * 34}" fill="${escapeXml(label)}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="34" font-weight="700">${escapeXml(value)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><title>${escapeXml(title)}</title><rect width="100%" height="100%" fill="${escapeXml(surface)}"/>${titleMarkup}${viewMarkup}${labelsMarkup}</svg>`
}

/** Rasterize a mounted body-map export at a modest, readable size. */
export async function bodyMapPngBlob(container, options = {}) {
  const markup = bodyMapSvg(container, options)
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG export is unavailable')
  const image = new Image()
  const loaded = new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('Could not render the body map'))
  })
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = Math.max(850, image.height || 850)
  const context = canvas.getContext?.('2d')
  if (!context) throw new Error('PNG export is unavailable')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the body map image')), 'image/png')
  })
}

/**
 * <BodyMap load={{ chest: 12, … }} body="male" />
 * `load` is effective sets per muscle (see lib/muscles.js); shading is relative to
 * the hardest-worked muscle in that same load, so it always reads as a balance. Pass ordered
 * `{ at, level, exclusive? }` `thresholds` for a fixed absolute scale (recovery views use this
 * to keep their semantic bands stable); omitting it preserves the balance behavior.
 */
export default function BodyMap({ load = {}, thresholds, body = 'male', onMuscle, selected, className = '', onReady }) {
  const paths = useBodyPaths()
  const levels = levelsOf(load, thresholds)
  const g = paths && (paths[body] || paths.male)
  useEffect(() => { if (g && onReady) onReady() }, [g, onReady])
  return (
    <div className={'bodymap ' + className}>
      {g ? <>
        <View view={g.front} levels={levels} onMuscle={onMuscle} selected={selected} />
        <View view={g.back} levels={levels} onMuscle={onMuscle} selected={selected} />
      </> : <div className="bm-ph" aria-hidden="true" />}
    </div>
  )
}

export function BodyMapLegend() {
  return <div className="hm-legend" aria-label={`${t('Less')} ${t('More')}`}>
    {t('Less')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" />
    <div className="hm-c l3" /><div className="hm-c l4" /> {t('More')}
  </div>
}
