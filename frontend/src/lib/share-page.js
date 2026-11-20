import { EXIDX } from './exercises.js'
import { DAYN, fmtDate, fmtDur, fmtNum, weekOrder, weekStartOf } from './format.js'
import { fmtSec, isBw, isPerSide, modeOf, setsDone, sideReps, workSetsDone } from './history.js'
import { loadOfWorkouts, MUSCLE_NAME } from './muscles.js'
import { setText } from './session-share.js'
import { aiDeepLink, fitSharedHandoffText, routineCompactHandoffText, sessionCompactHandoffText } from './ai-handoff.js'
import { isWarmupRow } from './workout-model.js'

export const DEPLOY_AI_PROMPT = 'Help me deploy openGym using the cheapest suitable option. First ask whether I have a GitHub account, a domain, a VPS, and a payment card. Then explain the costs and guide me one step at a time, waiting for my confirmation after each step. Use the openGym deployment guide at https://github.com/derrick-ships/openGym/blob/main/docs/DEPLOY_LOW_COST.md and explain how to back up my data.'

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char])
const accentColor = value => typeof value === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value) ? value : '#a3e635'
const exerciseFor = (S, entry) => (S.customEx || []).find(ex => ex.id === entry.id) || EXIDX[entry.id] || entry.muscleSnapshot || {}
const exerciseName = (S, entry) => exerciseFor(S, entry).n || entry.n || entry.name || entry.id || 'Unnamed exercise'
const completed = set => !!(set?.done || set?.sides?.L?.done || set?.sides?.R?.done)
const number = value => fmtNum(Number(value) || 0)

const chatGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4c2.7-1.1 5.4.5 5.5 3.1 2.9.3 4.1 3.2 2.4 5.2 1.5 2.4.1 5.1-2.6 5.2-.6 2.8-3.6 3.7-5.3 1.8-2.4 1.5-5.2.3-5.3-2.5-2.8-.7-3.7-3.5-1.8-5.3-1.4-2.5 0-5.2 2.7-5.2.7-2.6 3.3-3.6 5.4-2.3Z"/><path d="m8 9 4-2.3L16 9v5l-4 2.3L8 14Z"/></svg>'
const claudeGlyph = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1M8.2 2.8l7.6 18.4M21.2 8.2 2.8 15.8M15.8 2.8 8.2 21.2M2.8 8.2l18.4 7.6"/></svg>'

function closingSections(prompt, fallback) {
  const link = id => aiDeepLink(id, fitSharedHandoffText(prompt, id, null, text => text) ||
    fitSharedHandoffText(fallback, id, null, text => text), { kind: 'share' })
  return `<section class="ai-panel">
  <div class="eyebrow">A LITTLE PERSPECTIVE</div>
  <h2>Ask an AI about this<span class="accent-dot">.</span></h2>
  <p>Get a second opinion, explore your progress, or ask what to do next. Your training details are sent when you open a link.</p>
  <div class="ai-actions"><a class="ai-button chat" href="${escapeHtml(link('chatgpt'))}">${chatGlyph}<span>Open in ChatGPT</span><span class="arrow" aria-hidden="true">↗</span></a>
  <a class="ai-button claude" href="${escapeHtml(link('claude'))}">${claudeGlyph}<span>Open in Claude</span><span class="arrow" aria-hidden="true">↗</span></a></div>
  <p class="ai-hint">For long workouts and routines, the link includes a shorter summary.</p>
</section>
<section class="own-panel"><div class="eyebrow">YOUR TRAINING. YOUR DATA.</div><h2>Run your own openGym<span class="accent-dot">.</span></h2>
  <p>openGym is a free, open-source workout tracker you can run yourself. Use the Android app without a server or host your own instance to sync across devices.</p>
  <div class="text-links"><a href="https://github.com/derrick-ships/openGym">Explore the project ↗</a><a href="https://github.com/derrick-ships/openGym/blob/main/docs/DEPLOY_LOW_COST.md">Low-cost deploy guide ↗</a></div>
  <details><summary>Deploy it with your AI <span aria-hidden="true">+</span></summary><p>Copy this prompt into your AI assistant:</p><pre>${escapeHtml(DEPLOY_AI_PROMPT)}</pre></details>
</section><footer>Made with openGym · AGPL-3.0</footer>`
}

function documentHTML(title, accent, body, prompt, fallback) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escapeHtml(title)} · openGym</title><style>
:root{color-scheme:dark;--accent:${accentColor(accent)};--bg:#101210;--surface:#191c19;--raised:#20241f;--ink:#f3f5ec;--muted:#a4aca0;--faint:#767f73;--line:rgba(230,244,220,.11)}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;color:var(--ink);background:radial-gradient(ellipse 65% 400px at 95% -30px,color-mix(in srgb,var(--accent) 18%,transparent),transparent 75%),var(--bg);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
a{color:inherit}
a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.page{width:min(100% - 40px,1000px);margin:auto}
.top{display:flex;justify-content:space-between;align-items:center;padding:27px 0 0;gap:16px}
.brand{font-weight:800;letter-spacing:-.045em;font-size:20px}
.brand-mark{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-right:8px}
.top-note,.eyebrow,.section-index{text-transform:uppercase;letter-spacing:.14em;font-size:10px;font-weight:750;color:var(--muted)}
.hero{padding:76px 0 36px}
.eyebrow{letter-spacing:.17em;color:var(--muted)}
.hero .eyebrow{display:flex;align-items:center;gap:10px}
.hero .eyebrow:before{content:"";display:block;width:25px;height:2px;background:var(--accent)}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(44px,8vw,82px);letter-spacing:-.065em;line-height:1.03;font-weight:720;max-width:880px;margin:20px 0}
.hero-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:14px}
.hero-meta span+span:before{content:"/";color:var(--faint);margin-right:10px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:16px;min-width:0;padding:19px 19px 21px}
.stat-label{color:var(--muted);font-size:11px;font-weight:650}
.stat-value{font-size:clamp(23px,3vw,31px);letter-spacing:-.045em;line-height:1.2;margin-top:15px;font-weight:680}
.stat-value small{font-size:13px;color:var(--muted);font-weight:500;letter-spacing:0}
.stat-sub{color:var(--faint);font-size:11px;margin-top:4px}
.section{margin-top:78px}
.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line)}
h2{font-size:clamp(25px,3.5vw,34px);letter-spacing:-.045em;line-height:1.15;font-weight:680}
.section-index{white-space:nowrap}
.exercise{padding:26px 0;border-bottom:1px solid var(--line);break-inside:avoid}
.exercise-head{display:flex;align-items:baseline;gap:18px}
.ex-number{font-size:12px;font-weight:700;color:var(--faint)}
h3{font-size:18px;line-height:1.3;letter-spacing:-.025em;font-weight:650}
.exercise-name{flex:1;min-width:0}
.exercise-name h3,h3.exercise-name,.pr-name{text-transform:capitalize}
.exercise-meta{font-size:12px;color:var(--muted);margin-top:5px}
.set-table{border-collapse:collapse;width:calc(100% - 38px);margin:17px 0 0 38px;text-align:left}
.set-table th,.set-table td{padding:9px 12px;border-top:1px solid var(--line);font-size:13px}
.set-table th{width:25%;color:var(--muted);font-weight:500}
.set-table td{color:var(--ink)}
.ex-note,.note{white-space:pre-wrap}
.ex-note{color:var(--muted);font-size:13px;margin:12px 0 0 38px}
.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:5px 11px;background:var(--raised);color:var(--ink);font-size:12px}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.superset{font-size:11px;color:var(--accent);font-weight:700;letter-spacing:.04em}
.prescription{color:var(--ink);font-weight:600;margin-top:7px}
.pr-list{display:grid;gap:8px;margin-top:18px}
.pr{padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.pr strong{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block}
.note{font-size:16px;line-height:1.7;margin-top:18px;color:var(--muted)}
.ai-panel,.own-panel{margin-top:90px;border:1px solid var(--line);border-radius:22px;padding:clamp(24px,5vw,48px)}
.ai-panel{background:linear-gradient(125deg,color-mix(in srgb,var(--accent) 13%,var(--surface)),var(--surface) 68%)}
.own-panel{margin-top:14px;background:var(--surface)}
.ai-panel h2,.own-panel h2{margin:13px 0}
.ai-panel p,.own-panel p{max-width:650px;color:var(--muted)}
.accent-dot{color:var(--accent)}
.ai-actions,.text-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:25px}
.ai-button{display:inline-flex;align-items:center;gap:10px;border-radius:99px;padding:12px 16px;font-size:13px;font-weight:700;text-decoration:none;min-height:48px}
.ai-button svg{height:21px;width:21px;flex:none;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round}
.chat{background:#090a09;color:white;border:1px solid #464b44}
.claude{background:#d97757;color:#1f1714}
.arrow{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:rgba(255,255,255,.15);margin-left:4px}
.ai-hint{font-size:11px;margin-top:16px}
.text-links a{font-size:13px;font-weight:700;text-decoration-thickness:1px;text-underline-offset:4px}
details{border-top:1px solid var(--line);margin-top:26px;padding-top:18px}
summary{cursor:pointer;font-weight:650;font-size:13px;list-style:none;display:flex;justify-content:space-between;gap:10px}
summary::-webkit-details-marker{display:none}
summary span{font-size:18px;color:var(--muted)}
details p{font-size:12px;margin-top:13px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 system-ui,sans-serif;color:var(--ink);background:var(--raised);padding:16px;border-radius:12px}
footer{color:var(--faint);font-size:11px;padding:30px 0 36px}

@media(max-width:560px){.page{width:calc(100% - 32px)}
.top{padding-top:22px}
.top-note{font-size:9px}
.hero{padding:62px 0 28px}
.stats{grid-template-columns:repeat(2,minmax(0,1fr))}
.stat{padding:16px;min-height:108px}
.section{margin-top:62px}
.exercise-head{gap:12px;flex-wrap:wrap}
.exercise-name{flex-basis:calc(100% - 35px)}
.exercise-head>.superset{margin-left:30px}
.set-table{width:calc(100% - 30px);margin-left:30px}
.set-table,.set-table tbody,.set-table tr,.set-table th,.set-table td{display:block}
.set-table tr{padding:9px 0;border-top:1px solid var(--line)}
.set-table th,.set-table td{border:0;padding:0;width:auto}
.set-table th{font-size:11px}
.ex-note{margin-left:30px}
.ai-panel,.own-panel{padding:24px}
.ai-panel{margin-top:72px}
.ai-actions{display:grid}
.ai-button{justify-content:flex-start}
.ai-button .arrow{margin-left:auto}
}

@media(prefers-color-scheme:light){:root{color-scheme:light;--bg:#f5f6ef;--surface:#fff;--raised:#f1f3ea;--ink:#1e251c;--muted:#5e6a5b;--faint:#798477;--line:rgba(43,60,36,.14)}
body{background:radial-gradient(ellipse 65% 400px at 95% -30px,color-mix(in srgb,var(--accent) 18%,transparent),transparent 75%),var(--bg)}
.superset{color:#4d681a}
}

@media print{:root{color-scheme:light;--bg:#fff;--surface:#fff;--raised:#f5f5f5;--ink:#111;--muted:#444;--faint:#555;--line:#ccc}
body{background:#fff;font-size:11pt}
.page{width:100%;max-width:none}
.top{padding-top:0}
.hero{padding:24px 0}
.hero h1{font-size:32pt}
.stat,.ai-panel,.own-panel{background:#fff}
.section,.ai-panel{margin-top:28px}
.exercise,.stat,.ai-panel,.own-panel{break-inside:avoid}
.ai-actions{display:none}
details{display:none}
footer{padding-bottom:0}
}

</style></head><body><div class="page"><div class="top"><div class="brand"><span class="brand-mark"></span>openGym</div><div class="top-note">A record worth keeping</div></div>${body}${closingSections(prompt, fallback)}</div></body></html>`
}

const stat = (label, value, unit = '', sub = '') => `<div class="stat"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}${unit ? ` <small>${escapeHtml(unit)}</small>` : ''}</div>${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ''}</div>`
const heading = (title, count = '') => `<div class="section-heading"><h2>${escapeHtml(title)}</h2>${count ? `<span class="section-index">${escapeHtml(count)}</span>` : ''}</div>`

export function workoutPageHTML(S = {}, w = {}, { prs = [], e1prs = [], accent = '#a3e635', aiText } = {}) {
  const entries = (w.entries || []).map(entry => ({ ...entry, sets: entry.sets || [] }))
  const workout = { ...w, entries }
  const doneEntries = entries.filter(entry => entry.sets.some(completed))
  const unit = S.unit || 'kg'
  const total = setsDone(workout)
  const work = workSetsDone(workout)
  const date = w.d ? fmtDate(w.d, false, true) : w.start ? new Date(w.start).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''
  const duration = w.start && w.end && w.end >= w.start ? fmtDur(w.end - w.start) : ''
  const prsCount = prs.length + e1prs.length
  const cards = stat('Volume', number(w.vol), unit) + stat('Sets completed', number(total), '', `${number(work)} work sets`) + stat('Personal records', number(prsCount)) + (w.bw != null ? stat('Body weight', number(w.bw), unit) : '')
  const exercises = doneEntries.map((entry, index) => {
    const rows = entry.sets.filter(completed).map((set, rowIndex) => `<tr><th scope="row">${isWarmupRow(set) ? 'Warm-up' : `Set ${rowIndex + 1}`}</th><td>${escapeHtml(setText(set, entry.target ? { ...entry.target, id: entry.id } : null, unit, entry.id))}</td></tr>`).join('')
    return `<article class="exercise"><div class="exercise-head"><span class="ex-number">${String(index + 1).padStart(2, '0')}</span><h3 class="exercise-name">${escapeHtml(exerciseName(S, entry))}</h3></div><table class="set-table"><tbody>${rows}</tbody></table>${entry.note ? `<p class="ex-note">${escapeHtml(entry.note)}</p>` : ''}</article>`
  }).join('')
  const enriched = { ...workout, entries: entries.map(entry => ({ ...entry, exercise: entry.muscleSnapshot || exerciseFor(S, entry) })) }
  const muscles = Object.entries(loadOfWorkouts([enriched])).sort((a, b) => b[1] - a[1]).map(([slug]) => MUSCLE_NAME[slug] || slug)
  const records = [
    ...prs.map(id => `<div class="pr"><strong>New PR</strong><span class="pr-name">${escapeHtml(exerciseName(S, { id }))}</span></div>`),
    ...e1prs.map(pr => `<div class="pr"><strong>Best estimated 1RM</strong><span class="pr-name">${escapeHtml(exerciseName(S, pr))}</span> · ${escapeHtml(number(pr.est))} ${escapeHtml(unit)}</div>`),
  ].join('')
  const body = `<header class="hero"><div class="eyebrow">WORKOUT JOURNAL</div><h1>${escapeHtml(w.name || 'Workout')}</h1><div class="hero-meta">${[date, duration].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></header>
<div class="stats">${cards}</div><section class="section">${heading('The work', `${doneEntries.length} ${doneEntries.length === 1 ? 'exercise' : 'exercises'}`)}${exercises || '<p class="note">No completed sets recorded.</p>'}</section>
${muscles.length ? `<section class="section">${heading('Muscles worked')}<div class="pills">${muscles.map(muscle => `<span class="pill">${escapeHtml(muscle)}</span>`).join('')}</div></section>` : ''}
${records ? `<section class="section">${heading('Personal records')}<div class="pr-list">${records}</div></section>` : ''}
${w.note ? `<section class="section">${heading('Session note')}<p class="note">${escapeHtml(w.note)}</p></section>` : ''}`
  const fallback = sessionCompactHandoffText({ ...S, unit }, workout, { prs, e1prs, shared: true })
  return documentHTML(w.name || 'Workout', accent, body, aiText ?? fallback, fallback)
}

function prescription(entry, S) {
  const sets = entry.sets ?? 1
  const mode = modeOf(entry)
  let target
  if (mode === 'cardio') target = `${number(entry.min ?? 20)} min @ ${number(entry.speed ?? 8)} km/h`
  else if (mode === 'time') target = fmtSec(entry.sec ?? 45)
  else if (entry.repsMin != null || entry.repsMax != null) target = `${entry.repsMin ?? entry.reps ?? 10}–${entry.repsMax ?? entry.reps ?? 10}`
  else target = entry.reps ?? 10
  let result = `${number(sets)} × ${target}`
  if (entry.weight > 0) result += ` · ${isBw(entry) ? '+' : ''}${number(entry.weight)} ${S.unit || 'kg'}`
  if (mode === 'reps' && isPerSide(entry)) result += ` · ${number(sideReps(entry.reps ?? 10))}/side`
  return result
}

export function routinePageHTML(S = {}, routine = {}, { accent = '#a3e635', aiText } = {}) {
  const entries = routine.ex || []
  const groups = new Map()
  entries.forEach(entry => { if (entry.sg && !groups.has(entry.sg)) groups.set(entry.sg, groups.size + 1) })
  const days = weekOrder(weekStartOf(S)).filter(day => [].concat(S.week?.[day] || []).includes(routine.id)).map(day => DAYN[day])
  const details = entries.map((entry, index) => {
    const rest = entry.restSec > 0 ? entry.restSec : S.restSec > 0 ? S.restSec : null
    return { entry, name: exerciseName(S, entry), scheme: prescription(entry, S), rest, group: groups.get(entry.sg), index }
  })
  const exercises = details.map(({ entry, name, scheme, rest, group, index }) => `<article class="exercise"><div class="exercise-head"><span class="ex-number">${String(index + 1).padStart(2, '0')}</span><div class="exercise-name"><h3>${escapeHtml(name)}</h3><div class="prescription">${escapeHtml(scheme)}</div>${rest != null ? `<div class="exercise-meta">${escapeHtml(number(rest))}s rest</div>` : ''}</div>${group ? `<span class="superset">Superset ${group}</span>` : ''}</div>${entry.note ? `<p class="ex-note">${escapeHtml(entry.note)}</p>` : ''}</article>`).join('')
  const body = `<header class="hero"><div class="eyebrow">TRAINING ROUTINE</div><h1>${routine.emoji ? `${escapeHtml(routine.emoji)} ` : ''}${escapeHtml(routine.name || 'Routine')}</h1><div class="hero-meta"><span>${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'}</span>${days.length ? `<span>${escapeHtml(days.join(' · '))}</span>` : ''}</div></header>
<section class="section">${heading('The plan', `${entries.length} ${entries.length === 1 ? 'exercise' : 'exercises'}`)}${exercises || '<p class="note">No exercises in this routine yet.</p>'}</section>
${days.length ? `<section class="section">${heading('Scheduled days')}<div class="pills">${days.map(day => `<span class="pill">${escapeHtml(day)}</span>`).join('')}</div></section>` : ''}
${routine.note ? `<section class="section">${heading('Routine note')}<p class="note">${escapeHtml(routine.note)}</p></section>` : ''}`
  const fallback = routineCompactHandoffText(S, routine, { shared: true })
  return documentHTML(routine.name || 'Routine', accent, body, aiText ?? fallback, fallback)
}

export function pageFileName(kind, name, date) {
  const slug = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return ['opengym', slug(kind), slug(name), slug(date)].filter(Boolean).join('-') + '.html'
}
