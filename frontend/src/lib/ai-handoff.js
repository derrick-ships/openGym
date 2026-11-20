import { EXIDX } from './exercises.js'
import { DAYN, fmtDur, isoOf, weekOrder, weekStartOf } from './format.js'
import { isBw, isPerSide, modeOf, sideReps, workoutVolume } from './history.js'
import { estimate1RM } from './onerm.js'
import { routineShareText } from './plan-share.js'
import { sessionShareText } from './session-share.js'
import { isSideSet, isWarmupRow, modeForSet } from './workout-model.js'

export const ATHLETE_DEFAULT = {
  sex: null, birthYear: null, heightCm: null, experience: null, goal: null,
  injuries: '', healthSources: [], notes: '',
}

export const HEALTH_SOURCES = [
  { id: 'apple-health', label: 'Apple Health' },
  { id: 'google-fit', label: 'Google Fit / Health Connect' },
  { id: 'oura', label: 'Oura Ring' },
  { id: 'whoop', label: 'Whoop' },
  { id: 'garmin', label: 'Garmin' },
  { id: 'fitbit', label: 'Fitbit' },
  { id: 'strava', label: 'Strava' },
  { id: 'other', label: 'Other' },
]

export const SESSION_CONTEXT_FLAGS = [
  { id: 'poor-sleep', label: 'Slept badly' },
  { id: 'sick', label: 'Sick' },
  { id: 'pain', label: 'Pain or injury' },
  { id: 'short-time', label: 'Short on time' },
  { id: 'low-energy', label: 'Low energy' },
  { id: 'stressed', label: 'Stressed' },
  { id: 'great', label: 'Felt great' },
]

const WEEK_MS = 7 * 86400_000
const list = value => Array.isArray(value) ? value : []
const cleanText = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit).trimEnd() : ''
const compactLine = (value, limit) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return text.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…'
}
const numberOf = value => typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
const entriesOf = w => list(w?.entries).filter(Boolean)
const numberText = n => String(Math.round(n * 10) / 10)
const labelsFor = (ids, catalog) => ids.map(id => catalog.find(item => item.id === id)?.label).filter(Boolean)
const unitOf = S => S.unit || 'kg'
const startOf = w => w.start || Date.parse(`${w.d}T00:00:00`)
const dateOf = w => w.d || isoOf(new Date(startOf(w)))
const nameOf = (S, entry) =>
  list(S.customEx).find(ex => ex.id === entry.id)?.n || EXIDX[entry.id]?.n || entry.muscleSnapshot?.n || entry.n || entry.name || entry.id

export function athleteOf(S, { now = Date.now() } = {}) {
  const athlete = S?.athlete || {}
  const birthYear = numberOf(athlete.birthYear)
  const heightCm = numberOf(athlete.heightCm)
  const age = new Date(now).getFullYear() - birthYear
  return {
    sex: cleanText(athlete.sex, 100) || null,
    birthYear: Number.isInteger(birthYear) && age >= 5 && age <= 110 ? birthYear : null,
    heightCm: heightCm >= 50 && heightCm <= 272 ? heightCm : null,
    experience: cleanText(athlete.experience, 100) || null,
    goal: cleanText(athlete.goal, 100) || null,
    injuries: cleanText(athlete.injuries, 1000),
    healthSources: list(athlete.healthSources).filter(id => HEALTH_SOURCES.some(item => item.id === id)),
    notes: cleanText(athlete.notes, 1000),
  }
}

function compareSets(a, b) {
  if ('sec' in a.set) return a.set.sec - b.set.sec || (a.set.w || 0) - (b.set.w || 0)
  if (a.est !== null && b.est !== null) return a.est - b.est
  // The estimator deliberately refuses high reps and unloaded sets. Compare the logged
  // load and reps instead of inventing an estimate or calling every such set a tie.
  return a.set.w - b.set.w || a.set.r - b.set.r
}

// A set outside the estimate range can still be shown, but shouldn't hide a usable 1RM.
const ranksHigher = (a, b) => (a.est !== null) === (b.est !== null)
  ? compareSets(a, b) > 0 : a.est !== null

function topSets(w) {
  const result = new Map()
  for (const entry of entriesOf(w)) {
    const target = entry.target || entry
    const bodyweight = isBw({ ...target, id: entry.id })
    for (const row of entry.sets || []) {
      if (isWarmupRow(row)) continue
      const mode = modeForSet(row, target)
      if (mode === 'cardio') continue
      const timed = mode === 'time'
      // A side row's total reps and max load may come from different lifts.
      for (const rowSet of isSideSet(row) ? [row.sides.L, row.sides.R] : [row]) {
        const count = Number(timed ? rowSet.sec : rowSet.r)
        if (!rowSet.done || !(count > 0)) continue
        const load = Number(rowSet.w) || 0
        const set = timed ? { sec: count, ...(load > 0 ? { w: load } : {}) } : { w: load, r: count }
        const top = { entry, set, bodyweight, est: timed || bodyweight ? null : estimate1RM(load, count) }
        const best = result.get(entry.id)
        // Prefer reps if a session mixes modes; seconds and reps can't be ranked together.
        if (!best || (timed === ('sec' in best.set) ? ranksHigher(top, best) : !timed)) result.set(entry.id, top)
      }
    }
  }
  return result
}

export function progressSnapshot(S = {}, { now = Date.now(), weeks = 8 } = {}) {
  const start = now - weeks * WEEK_MS
  const workouts = list(S.workouts).filter(Boolean).filter(w =>
    w.kind !== 'stretching' && startOf(w) >= start && startOf(w) <= now)
    .sort((a, b) => startOf(b) - startOf(a))
  const byExercise = new Map()
  for (const workout of workouts) {
    const date = dateOf(workout)
    for (const [id, top] of topSets(workout)) {
      const recent = byExercise.get(id)
      if (!recent) {
        byExercise.set(id, { latest: top, best: top, sessions: 1, lastDate: date, bestDate: date })
        continue
      }
      recent.sessions++
      // Keep the latest mode when an exercise was logged both ways in the window.
      if (('sec' in top.set) === ('sec' in recent.best.set) && ranksHigher(top, recent.best)) {
        recent.best = top
        recent.bestDate = date
      }
    }
  }
  const today = isoOf(new Date(now))
  const weighIn = list(S.bodyweight).filter(Boolean).reduce((latest, next) =>
    next.d <= today && (!latest || next.d >= latest.d) ? next : latest, null)
  return {
    workouts: workouts.length,
    sessionsPerWeek: weeks > 0 ? workouts.length / weeks : 0,
    bodyWeight: weighIn?.w ?? null,
    exercises: [...byExercise.entries()]
      .sort(([, a], [, b]) => b.sessions - a.sessions)
      .slice(0, 12)
      .map(([id, { best, latest, sessions, lastDate, bestDate }]) => ({
        id, name: nameOf(S, latest.entry), sessions, lastDate, bestDate,
        lastSet: latest.set, lastBodyweight: latest.bodyweight, bestSet: best.set, bestBodyweight: best.bodyweight, est1RM: best.est,
      })),
  }
}

function profileFields(athlete, now, sources) {
  const year = new Date(now).getFullYear()
  return [
    athlete.sex && `Sex: ${athlete.sex}`,
    athlete.birthYear && `Age: about ${year - athlete.birthYear}`,
    athlete.heightCm && `Height: ${athlete.heightCm} cm`,
    athlete.experience && `Experience: ${athlete.experience}`,
    athlete.goal && `Goal: ${athlete.goal}`,
    athlete.injuries && `Injuries: ${athlete.injuries}`,
    sources && `Health sources: ${sources}`,
    athlete.notes && `Notes: ${athlete.notes}`,
  ].filter(Boolean)
}

function setText(set, unit, bodyweight) {
  const load = set.w > 0 ? `${bodyweight ? '+' : ''}${numberText(set.w)} ${unit}` : ''
  if ('sec' in set) return `${numberText(set.sec)} s${load ? ` · ${load}` : ''}`
  if (load || bodyweight) return `${load || 'bodyweight'} × ${set.r}`
  return `${set.r} reps`
}

export function coachSkillText(S = {}, { now = Date.now(), compact = false } = {}) {
  const athlete = athleteOf(S, { now })
  const sources = labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', ')
  const fields = profileFields(athlete, now, sources)
  const profile = compact ? fields.map(field => compactLine(field, 100)) : fields
  const snapshot = progressSnapshot(S, { now })
  const unit = unitOf(S)
  const numbers = [
    'This is a snapshot of my top exercises from the last 8 weeks; ask me about anything not listed instead of treating it as new.',
    `Last 8 weeks: ${snapshot.workouts} ${snapshot.workouts === 1 ? 'session' : 'sessions'} (${numberText(snapshot.sessionsPerWeek)} per week on average).`,
    ...(snapshot.bodyWeight != null ? [`Body weight: ${numberText(snapshot.bodyWeight)} ${unit}`] : []),
    ...snapshot.exercises.map(ex => {
      const latest = setText(ex.lastSet, unit, ex.lastBodyweight)
      const best = setText(ex.bestSet, unit, ex.bestBodyweight)
      const est = ex.est1RM != null ? ` · ${numberText(ex.est1RM)} ${unit} estimated 1RM` : ''
      const sets = latest === best ? `${latest} (${ex.lastDate})` : `${latest} (latest, ${ex.lastDate}); ${best} (8-week best, ${ex.bestDate})`
      return `- ${ex.name}: ${sets}${est} · ${ex.sessions} ${ex.sessions === 1 ? 'session' : 'sessions'}`
    }),
  ]
  return [
    '## Role\nBe my strength coach. Use my openGym data as the source of truth for my training.',
    '## Memory rules\nKeep a running progress log in your memory or project. After every session I share, update it with what I actually did and any context I give you. Never overwrite logged facts with guesses. If you cannot save memory, give me an updated log I can bring back next time.',
    '## Before recommending\nAsk me at most 3 short questions about missing details that matter: age, sex, height, experience, goal, injuries, equipment, and schedule.',
    "## Load rules\nBase prescribed weights and reps on my logged history and estimated 1RM. Never invent numbers. For an exercise with no history, ask me for a starting weight; if I don't know, give a conservative range clearly labelled as a guess and aim for about RPE 7. Progress in small steps, never jumping more than about 5–10% at once unless my history supports it. Keep targets realistic for my experience and body weight.",
    '## When a session is off\nIf performance drops below my usual and I have not given context, ask what happened before changing loads: sleep, sickness, pain, or time. If I already shared how it went, use that context instead of asking again. For illness or poor sleep, keep the plan and resume normal loads when I have recovered. For pain, adjust the exercise or load and suggest seeing a qualified health professional.',
    `## Health data\nIf I connected ${sources ? `${sources} or another health or wearable source` : 'a health or wearable source'} to you, use available recovery, sleep, and HRV data. If you do not have access, ask me instead.`,
    '## openGym MCP note\nIf the openGym MCP is connected, read my profile (get_athlete_profile), workouts, estimated 1RM and muscle balance from it instead of asking me. Suggest routine changes as proposals for me to approve when your connection allows it.',
    `## My profile\n${profile.length ? profile.map(field => `- ${field}`).join('\n') : 'No profile details logged.'}`,
    `## My current numbers\n${numbers.join('\n')}`,
  ].join('\n\n')
}

const routineIdsOf = w => w.routineIds ?? (w.routineId ? [w.routineId] : [])

export function previousComparable(S = {}, w) {
  if (!w) return null
  const ids = routineIdsOf(w)
  const start = startOf(w)
  let prev = null
  let prevStart = -Infinity
  for (const candidate of list(S.workouts).filter(Boolean)) {
    if ((candidate.kind === 'stretching') !== (w.kind === 'stretching')) continue
    const time = startOf(candidate)
    if ((w.id != null && candidate.id === w.id) || !(time < start && time >= prevStart)) continue
    const otherIds = routineIdsOf(candidate)
    const same = ids.length ? ids.some(id => otherIds.includes(id)) : !otherIds.length && w.name && candidate.name === w.name
    if (!same) continue
    prev = candidate
    prevStart = time
  }
  return prev
}

export function sessionComparison(S = {}, w) {
  const prev = previousComparable(S, w)
  return compareSession(S, w, prev, topSets(w), topSets(prev))
}

function compareSession(S, w, prev, current, before) {
  const prevVolume = prev ? (prev.vol ?? workoutVolume({ entries: entriesOf(prev) })) : null
  const volumeDelta = prev ? (w.vol ?? workoutVolume({ entries: entriesOf(w) })) - prevVolume : null
  const exercises = [...current.entries()].map(([id, top]) => {
    const old = before.get(id)
    const comparable = old && ('sec' in old.set) === ('sec' in top.set)
    const delta = comparable ? compareSets(top, old) : 0
    return {
      id, name: nameOf(S, top.entry), now: top.set, before: comparable ? old.set : null,
      change: !comparable ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
    }
  })
  return { prev, volumeDelta, volumePct: prevVolume > 0 ? volumeDelta / prevVolume * 100 : null, exercises }
}

const SESSION_INTRO = 'Here is my latest openGym session. Compare it with my previous sessions and update my progress log.'
const ROUTINE_INTRO = 'Please review and adjust this openGym routine for me. Use my goals, training history, equipment, and schedule; ask about anything important that is missing before suggesting changes.'
const SHARED_SESSION_INTRO = 'Review this shared openGym workout and give practical feedback.'
const SHARED_ROUTINE_INTRO = 'Review this shared openGym routine and suggest practical improvements.'

function sessionContext(context, compact) {
  const flags = SESSION_CONTEXT_FLAGS.filter(flag => list(context?.flags).includes(flag.id))
  const note = compact ? compactLine(context?.note, 200) : cleanText(context?.note)
  return { notes: [...flags.map(flag => flag.label), note].filter(Boolean), offDay: flags.some(flag => flag.id !== 'great') }
}

function sessionFollowup(S, w, { notes, offDay }, compact) {
  const unit = unitOf(S)
  const lines = []
  const prev = previousComparable(S, w)
  const current = topSets(w)
  const before = topSets(prev)
  const { volumeDelta, volumePct, exercises } = compareSession(S, w, prev, current, before)
  if (prev) {
    const signed = n => `${n > 0 ? '+' : ''}${numberText(n)}`
    const name = prev.name || w.name || 'workout'
    lines.push('', `Compared with my last ${compact ? compactLine(name, 120) : name} session (${dateOf(prev)}):`)
    lines.push(`- Volume change: ${signed(volumeDelta)} ${unit}${volumePct == null ? '' : ` (${signed(volumePct)}%)`}`)
    const changes = compact ? exercises.filter(ex => ex.change !== 'same').slice(0, 8) : exercises
    for (const ex of changes) {
      const past = ex.before ? ` vs ${setText(ex.before, unit, before.get(ex.id).bodyweight)}` : ''
      lines.push(`- ${compact ? compactLine(ex.name, 80) : ex.name}: ${setText(ex.now, unit, current.get(ex.id).bodyweight)}${past} (${ex.change})`)
    }
  }
  lines.push('')
  if (notes.length) {
    if (offDay) lines.push('I reported an off day. Use that context when comparing this session.')
    lines.push('Do not treat lower numbers as lost strength on the basis of this session alone, and do not ask me again what happened. Use the context above to tell me whether and how to adjust next session.')
  } else if (volumeDelta < 0 || exercises.some(ex => ex.change === 'down')) {
    lines.push('My numbers dropped. Please ask me what happened before changing my loads (sleep, sickness, pain, time). Then tell me what to aim for next session.')
  } else {
    lines.push('Tell me what to aim for next session.')
  }
  return lines
}

export function sessionHandoffText(S = {}, w, { prs = [], e1prs = [], context = w?.context } = {}) {
  const session = sessionContext(context, false)
  return [
    SESSION_INTRO,
    ...(session.notes.length ? [`How it went: ${session.notes.join('; ')}`] : []),
    '', sessionShareText({ ...S, unit: unitOf(S), customEx: list(S.customEx) }, { ...w, entries: entriesOf(w) }, prs, e1prs),
    ...sessionFollowup(S, w, session, false),
  ].join('\n')
}

const completed = set => set?.done || set?.sides?.L?.done || set?.sides?.R?.done

function compactSet(row, target, unit, count) {
  const repeat = count > 1 ? `${count}×` : ''
  const bw = isBw(target)
  const mode = modeForSet(row, target)
  const one = set => {
    const w = numberText(set.w || 0)
    const r = numberText(set.r || 0)
    const load = set.w > 0 ? ` @ ${bw ? '+' : ''}${w} ${unit}` : ''
    if (mode === 'cardio') return `${repeat}${numberText(set.min || 0)}min @ ${numberText(set.speed || 0)}km/h`
    if (mode === 'time') return `${repeat}${numberText(set.sec || 0)}s${load}`
    if (bw) return `${repeat}bw×${r}${load}`
    return repeat ? `${repeat}${r} @ ${w} ${unit}` : `${w}×${r} ${unit}`
  }
  const text = isSideSet(row)
    ? ['L', 'R'].filter(side => row.sides[side].done).map(side => `${side} ${one(row.sides[side])}`).join(' / ')
    : one(row)
  return `${text}${isWarmupRow(row) ? ' wu' : ''}`
}

function compactExercise(S, entry, rows, hasPR) {
  const target = { ...(entry.target || entry), id: entry.id }
  const unit = unitOf(S)
  const groups = []
  for (const row of rows) {
    const label = compactSet(row, target, unit, 1)
    const last = groups.at(-1)
    if (last?.label === label) last.count++
    else groups.push({ row, label, count: 1 })
  }
  const sets = groups.map(({ row, count }) => compactSet(row, target, unit, count)).join(', ')
  const note = compactLine(entry.note, 42)
  return `- ${compactLine(nameOf(S, entry), 100)} — ${sets}${hasPR || rows.some(row => row.pr) ? ' (PR)' : ''}${note ? `; note: ${note}` : ''}`
}

// Check the budget on the final text, including the omission notice and the closing instructions.
function exerciseText(header, rows, footer, fits, omitted = 0) {
  for (let n = rows.length; n >= 0; n--) {
    const remaining = rows.length - n + omitted
    const text = [...header, ...rows.slice(0, n), ...(remaining ? [`…and ${remaining} more exercises`] : []), ...footer].join('\n')
    if (fits(text)) return text
  }
  return ''
}

export function sessionCompactHandoffText(S = {}, w = {}, { prs = [], e1prs = [], context = w.context, shared = false, maxChars = Infinity } = {}) {
  const session = sessionContext(shared ? null : context, true)
  const unit = unitOf(S)
  const note = compactLine(w.note, 160)
  const header = [shared ? SHARED_SESSION_INTRO : SESSION_INTRO,
    ...(session.notes.length ? [`How it went: ${session.notes.join('; ')}`] : []),
    '', compactLine(w.name || 'Workout', 120), dateOf(w),
    ...(w.start && w.end >= w.start ? [`Duration: ${fmtDur(w.end - w.start)}`] : []),
    `Volume: ${numberText(w.vol ?? workoutVolume({ entries: entriesOf(w) }))} ${unit}`,
    ...(!shared && w.bw != null ? [`Bodyweight: ${numberText(w.bw)} ${unit}`] : []),
    ...(note ? [`Note: ${note}`] : []), '', 'Exercises:',
  ]
  const prIds = new Set([...prs, ...e1prs.map(pr => pr.id)])
  const rows = entriesOf(w).flatMap(entry => {
    const sets = list(entry.sets).filter(completed)
    return sets.length ? [compactExercise(S, entry, sets, prIds.has(entry.id))] : []
  })
  const footer = shared ? [] : sessionFollowup(S, w, session, true)
  return exerciseText(header, rows, footer, text => text.length <= maxChars)
}

export const AI_PROVIDERS = {
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', base: 'https://chatgpt.com/', query: 'https://chatgpt.com/?q=' },
  claude: { id: 'claude', name: 'Claude', base: 'https://claude.ai/new', query: 'https://claude.ai/new?q=' },
}

export function providerPrompt(providerId, baseText) {
  const instruction = providerId === 'claude'
    ? 'Keep this log in a Project if available. Give me a short coach debrief with one adjustment.'
    : 'Update your saved memory and my progress log if available, and say what to aim for next session.'
  return `${instruction}\n\n${baseText || ''}`
}

const providerOf = id => Object.hasOwn(AI_PROVIDERS, id) ? AI_PROVIDERS[id] : AI_PROVIDERS.chatgpt

function queryUrl(provider, text) {
  const input = String(text)
  // Match toWellFormed on older WebViews; the Unicode class skips valid surrogate pairs.
  const wellFormed = input.toWellFormed?.() ?? input.replace(/\p{Surrogate}/gu, '\uFFFD')
  return provider.query + encodeURIComponent(wellFormed)
}

const SHORT_HANDOFF = {
  session: "I just copied my latest openGym session to my clipboard. I'll paste it in my next message — wait for it, then compare it with my previous sessions and update my progress log.",
  routine: "I just copied my openGym routine to my clipboard. I'll paste it in my next message — wait for it, then help me review and adjust the routine.",
  coach: "I just copied my openGym coach instructions to my clipboard. I'll paste them in my next message — wait for them before coaching me.",
  share: 'Help me review a shared openGym workout or routine. Ask me about the details before giving advice.',
}

export function deepLinkFits(providerId, text, { maxUrl = 7000 } = {}) {
  const input = String(text ?? '')
  return !!input.trim() && queryUrl(providerOf(providerId), input).length <= maxUrl
}

export function aiDeepLink(providerId, text, { maxUrl = 7000, kind = 'session' } = {}) {
  const provider = providerOf(providerId)
  const input = String(text ?? '')
  const url = queryUrl(provider, input)
  if (input.trim() && url.length <= maxUrl) return url
  const short = Object.hasOwn(SHORT_HANDOFF, kind) ? SHORT_HANDOFF[kind] : SHORT_HANDOFF.session
  // An artificially tiny maxUrl may not fit even the fallback; a prompt takes precedence.
  return queryUrl(provider, providerPrompt(provider.id, short))
}

// Recover the exercise section of a compact snapshot. Older snapshots used verbose numbered
// blocks, and may already have been cut mid-line by the server; rebuild those from public data.
export function fitSharedHandoffText(text, providerId, snapshot, wrap = prompt => providerPrompt(providerId, prompt)) {
  const fits = prompt => deepLinkFits(providerId, wrap(prompt))
  if (fits(text) && text.trim()) return text
  const heading = '\nExercises:\n'
  const start = text.indexOf(heading)
  if (start >= 0) {
    const head = text.slice(0, start)
    const [section, ...rest] = text.slice(start + heading.length).split('\n\n')
    const rows = section.split('\n')
    const notice = rows.at(-1).match(/^…and (\d+) more exercises$/)
    if (notice) rows.pop()
    if (rows.every(row => row.startsWith('- '))) {
      const compact = exerciseText([head, 'Exercises:'], rows, rest.length ? ['', rest.join('\n\n')] : [], fits, Number(notice?.[1] || 0))
      if (compact) return compact
    }
  }
  if (!snapshot) return ''
  const workout = snapshot.kind === 'workout'
  const header = [workout ? SHARED_SESSION_INTRO : SHARED_ROUTINE_INTRO, '', compactLine(snapshot.title, 120), snapshot.date || '',
    ...(workout && snapshot.durationMs > 0 ? [`Duration: ${fmtDur(snapshot.durationMs)}`] : []),
    ...(workout && snapshot.stats ? [`Volume: ${snapshot.stats.volume} ${snapshot.unit}`] : []), '', 'Exercises:']
  const rows = snapshot.entries.map(entry => {
    const work = workout ? entry.sets.map(set => `${set.label}${set.warmup ? ' wu' : ''}${set.pr ? ' (PR)' : ''}`).join(', ') : entry.scheme
    return `- ${compactLine(entry.name, 100)} — ${compactLine(work, 200)}`
  })
  return exerciseText(header, rows, [], fits)
}

export function routineHandoffText(S = {}, routine, { now = Date.now() } = {}) {
  const athlete = athleteOf(S, { now })
  const profile = profileFields(athlete, now, labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', '))
  return [
    ROUTINE_INTRO,
    '', routineShareText(S, routine),
    `My profile: ${profile.join('; ') || 'No profile details logged.'}`,
  ].join('\n')
}

export function routineCompactHandoffText(S = {}, routine = {}, { now = Date.now(), shared = false, maxChars = Infinity } = {}) {
  const unit = unitOf(S)
  const entries = list(routine.ex).filter(Boolean)
  const groups = new Map()
  entries.forEach(entry => { if (entry.sg && !groups.has(entry.sg)) groups.set(entry.sg, groups.size + 1) })
  const days = routine.id == null ? [] : weekOrder(weekStartOf(S)).filter(day => [].concat(S.week?.[day] || []).includes(routine.id)).map(day => DAYN[day])
  const note = compactLine(routine.note, 160)
  const header = [shared ? SHARED_ROUTINE_INTRO : ROUTINE_INTRO, '', `Routine: ${compactLine(routine.name || 'Routine', 120)}`,
    ...(days.length ? [`Schedule: ${days.join(', ')}`] : []), ...(note ? [`Note: ${note}`] : []), '', 'Exercises:',
  ]
  const rows = entries.map(entry => {
    const mode = modeOf(entry)
    const bw = isBw(entry)
    const from = entry.repsMin ?? entry.reps ?? entry.repsMax ?? 10
    const to = entry.repsMax ?? from
    const reps = from === to ? from : `${from}–${to}`
    const weight = entry.weight > 0 ? ` @ ${bw ? '+' : ''}${numberText(entry.weight)} ${unit}` : ''
    const work = mode === 'cardio' ? `${entry.min || 20}min @ ${entry.speed || 8}km/h`
      : mode === 'time' ? `${entry.sec || 45}s${weight}` : `${reps}${bw ? ' bw' : ''}${weight}`
    const rest = entry.restSec > 0 ? entry.restSec : S.restSec
    const details = [
      ...(mode === 'reps' && isPerSide(entry) ? [`${sideReps(from)}${from === to ? '' : `–${sideReps(to)}`}/side`] : []),
      ...(entry.warmupSets > 0 ? [`${entry.warmupSets} wu`] : []),
      ...(rest > 0 ? [`${rest}s rest`] : []), ...(entry.sg ? [`superset ${groups.get(entry.sg)}`] : []),
    ]
    const entryNote = compactLine(entry.note, 42)
    return `- ${compactLine(nameOf(S, entry), 100)} — ${[`${entry.sets || 1}×${work}`, ...details].join(', ')}${entryNote ? `; note: ${entryNote}` : ''}`
  })
  const athlete = shared ? null : athleteOf(S, { now })
  const profile = athlete ? profileFields(athlete, now, labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', ')) : []
  const footer = profile.length ? ['', `My profile: ${profile.map(field => compactLine(field, 100)).join('; ')}`] : []
  return exerciseText(header, rows, footer, text => text.length <= maxChars)
}
