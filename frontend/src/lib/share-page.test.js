import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEPLOY_AI_PROMPT, pageFileName, routinePageHTML, workoutPageHTML } from './share-page.js'

const state = {
  unit: 'kg', restSec: 90, week: { 1: ['push', 'other'], 3: 'push' },
  customEx: [
    { id: 'custom', n: 'Cable <script>alert(1)</script>', bp: 'chest' },
    { id: 'skip', n: 'Unfinished movement', bp: 'legs' },
  ],
}
const workout = {
  name: 'Push <script>alert(2)</script>', d: '2026-11-19',
  start: Date.parse('2026-11-19T10:00:00Z'), end: Date.parse('2026-11-19T11:05:00Z'),
  vol: 800, bw: 82, note: 'Good <script>alert(3)</script> & done',
  entries: [
    { id: 'custom', target: { mode: 'reps' }, sets: [{ w: 80, r: 8, done: true }, { w: 90, r: 5, done: false }] },
    { id: 'skip', sets: [{ w: 99, r: 7, done: false }] },
    { id: '0025', sets: [{ w: 40, r: 10, done: true, phase: 'warmup' }] },
  ],
}
const routine = {
  id: 'push', name: 'Push <script>alert(4)</script>', emoji: '💪', note: 'Keep <script>safe</script>',
  ex: [
    { id: 'custom', sets: 3, reps: 8, restSec: 120, sg: 'a' },
    { id: '0025', sets: 2, mode: 'time', sec: 45, sg: 'a' },
    { id: 'skip', sets: 2, reps: 10 },
  ],
}

const hrefs = html => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])

describe('standalone share pages', () => {
  it('creates complete offline documents and escapes user-controlled content and CSS accent', () => {
    for (const html of [workoutPageHTML(state, workout, { accent: '</style><script>evil()</script>' }), routinePageHTML(state, routine)]) {
      expect(html).toMatch(/^<!doctype html>/i)
      expect(html).toContain('<html')
      expect(html).toContain('<meta charset="utf-8">')
      expect(html).toContain('<style>')
      expect(html).toContain('</html>')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('https://github.com/derrick-ships/openGym')
      expect(html).toContain('https://github.com/derrick-ships/openGym/blob/main/docs/DEPLOY_LOW_COST.md')
      expect(html).toContain('Made with openGym · AGPL-3.0')
      expect(html).not.toMatch(/<(?:script|img|iframe|link)\b/i)
    }
  })

  it('shows completed exercise rows, including warm-ups, but no undone work', () => {
    const html = workoutPageHTML(state, workout, { prs: ['0025'], e1prs: [{ id: '0025', est: 105 }] })
    expect(html).toContain('Cable &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('barbell bench press')
    expect(html).toContain('80×8 kg')
    expect(html).toContain('40×10 kg')
    expect(html).toContain('Warm-up')
    expect(html).not.toContain('90×5')
    expect(html).not.toContain('Unfinished movement')
    expect(html).toContain('800')
    expect(html).toContain('82')
    expect(html).toContain('Good &lt;script&gt;alert(3)&lt;/script&gt; &amp; done')
    expect(html).toContain('105 kg')
  })

  it('retains partial-side and intensifier set formatting from session sharing', () => {
    const w = { entries: [{ id: '0025', sets: [
      { w: 60, r: 8, done: true, type: 'dropset', drops: [{ w: 50, r: 6 }], rir: 2 },
      { done: false, sides: { L: { w: 20, r: 8, done: true }, R: { w: 20, r: 8, done: false } } },
    ] }] }
    const html = workoutPageHTML(state, w)
    expect(html).toContain('60×8 kg (RIR 2) · drops: 50×6 kg')
    expect(html).toContain('L 20×8 kg · R —')
  })

  it('renders routine prescriptions, inherited rest, schedule and matching superset groups', () => {
    const html = routinePageHTML(state, routine)
    expect(html).toContain('💪')
    expect(html).toContain('3 × 8')
    expect(html).toContain('2 × 0:45')
    expect(html).toContain('120s rest')
    expect(html).toContain('90s rest')
    expect(html).toContain('Monday')
    expect(html).toContain('Wednesday')
    expect(html.match(/Superset 1/g)).toHaveLength(2)
    expect(html).toContain('Keep &lt;script&gt;safe&lt;/script&gt;')
  })

  it('includes encoded prompts for both providers, defaulting to page data', () => {
    const prompt = 'Hello & train <strong> today?'
    for (const html of [workoutPageHTML(state, workout, { aiText: prompt }), routinePageHTML(state, routine, { aiText: prompt })]) {
      expect(hrefs(html)).toContain(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`)
      expect(hrefs(html)).toContain(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`)
      expect(html).toContain('Open in ChatGPT')
      expect(html).toContain('Open in Claude')
    }
    expect(decodeURIComponent(hrefs(workoutPageHTML(state, workout)).find(href => href.startsWith('https://chatgpt.com/?q=')))).toContain('80×8 kg')
    expect(decodeURIComponent(hrefs(routinePageHTML(state, routine)).find(href => href.startsWith('https://claude.ai/new?q=')))).toContain('Push')
  })

  it('uses a prefilled summary of the page when an explicit prompt exceeds the URL budget', () => {
    const html = workoutPageHTML(state, workout, { aiText: '🏋️'.repeat(4000) })
    const providers = hrefs(html).filter(href => href.startsWith('https://chatgpt.com/') || href.startsWith('https://claude.ai/new'))
    expect(providers).toHaveLength(2)
    for (const href of providers) {
      expect(href.length).toBeLessThanOrEqual(7000)
      expect(new URL(href).searchParams.get('q')).toContain('80×8 kg')
      expect(new URL(href).searchParams.get('q')).not.toContain('clipboard')
    }
  })

  it('replaces lone surrogates in explicit and default AI prompts without losing valid pairs', () => {
    const malformed = 'High \uD83D low \uDC00 valid 🏋️'
    const repaired = 'High � low � valid 🏋️'
    const inputs = [
      [workoutPageHTML, { ...workout, name: malformed, note: malformed }],
      [routinePageHTML, { ...routine, name: malformed, note: malformed }],
    ]
    for (const [render, item] of inputs) {
      for (const options of [{}, { aiText: malformed }]) {
        const html = render(state, item, options)
        for (const href of hrefs(html).filter(link => link.includes('?q='))) {
          expect(decodeURIComponent(href)).toContain(repaired)
        }
        expect(hrefs(html).filter(link => link.includes('?q='))).toHaveLength(2)
      }
    }
  })

  it('repairs malformed surrogate text on older runtimes without toWellFormed', () => {
    const original = String.prototype.toWellFormed
    try {
      String.prototype.toWellFormed = undefined
      const prompt = '😀 \uD83D \uDC00 \uD83D\uD83D\uDC00'
      for (const html of [workoutPageHTML(state, workout, { aiText: prompt }), routinePageHTML(state, routine, { aiText: prompt })]) {
        const decoded = decodeURIComponent(hrefs(html).find(href => href.startsWith('https://chatgpt.com/?q=')))
        expect(decoded).toContain('😀 � � �🐀')
      }
    } finally {
      String.prototype.toWellFormed = original
    }
  })

  it('uses kg as the default for workout and routine page weights', () => {
    const noUnit = { ...state, unit: undefined }
    const html = workoutPageHTML(noUnit, workout, { e1prs: [{ id: '0025', est: 105 }] })
    expect(html).toContain('80×8 kg')
    expect(html).toContain('105 kg')
    expect(html).toContain('<small>kg</small>')
    expect(decodeURIComponent(hrefs(html).find(href => href.startsWith('https://chatgpt.com/?q=')))).toContain('80×8 kg')
    const routineHtml = routinePageHTML(noUnit, { ...routine, ex: [{ id: '0025', sets: 3, reps: 8, weight: 80 }] })
    expect(routineHtml).toContain('3 × 8 · 80 kg')
  })

  it('capitalizes only rendered exercise-name elements while preserving entered case', () => {
    const w = workoutPageHTML(state, workout, { prs: ['0025'], e1prs: [{ id: '0025', est: 105 }] })
    const r = routinePageHTML(state, routine)
    for (const html of [w, r]) expect(html).toMatch(/\.exercise-name h3,\s*h3\.exercise-name,\s*\.pr-name\s*\{[^}]*text-transform:\s*capitalize/)
    expect(w).toContain('<span class="pr-name">barbell bench press</span>')
    expect(r).toContain('Cable &lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('uses a safe filename and preserves the supplied date', () => {
    expect(pageFileName('workout', 'Push Day!', '2026-11-19')).toBe('opengym-workout-push-day-2026-11-19.html')
    expect(pageFileName('routine', '../Upper & Lower /💪', '')).toBe('opengym-routine-upper-lower.html')
  })

  it('keeps the deploy prompt identical in the guide and both pages', () => {
    const guide = readFileSync(new URL('../../../docs/DEPLOY_LOW_COST.md', import.meta.url), 'utf8')
    expect(guide).toContain(`\n${DEPLOY_AI_PROMPT}\n`)
    expect(workoutPageHTML(state, workout)).toContain(DEPLOY_AI_PROMPT)
    expect(routinePageHTML(state, routine)).toContain(DEPLOY_AI_PROMPT)
  })
})
