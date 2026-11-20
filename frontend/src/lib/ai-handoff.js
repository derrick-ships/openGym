import { EXIDX } from './exercises.js'
import { isoOf } from './format.js'
import { isBw, workoutVolume } from './history.js'
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
const numberOf = value => typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
const entriesOf = w => list(w?.entries).filter(Boolean)
const numberText = n => String(Math.round(n * 10) / 10)
const labelsFor = (ids, catalog) => ids.map(id => catalog.find(item => item.id === id)?.label).filter(Boolean)
const unitOf = S => S.unit || 'kg'
const startOf = w => w.start || Date.parse(`${w.d}T00:00:00`)
const dateOf = w => w.d || isoOf(new Date(startOf(w)))
const nameOf = (S, entry) =>
  list(S.customEx).find(ex => ex.id === entry.id)?.n || EXIDX[entry.id]?.n || entry.muscleSnapshot?.n || entry.n || entry.id

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

export function coachSkillText(S = {}, { now = Date.now() } = {}) {
  const athlete = athleteOf(S, { now })
  const sources = labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', ')
  const profile = profileFields(athlete, now, sources)
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

export function sessionHandoffText(S = {}, w, { prs = [], e1prs = [], context = w?.context } = {}) {
  const flags = SESSION_CONTEXT_FLAGS.filter(flag => list(context?.flags).includes(flag.id))
  const notes = [...flags.map(flag => flag.label), cleanText(context?.note)].filter(Boolean)
  const offDay = flags.some(flag => flag.id !== 'great')
  const unit = unitOf(S)
  const lines = ['Here is my latest openGym session. Compare it with my previous sessions and update my progress log.']
  if (notes.length) lines.push(`How it went: ${notes.join('; ')}`)
  lines.push('', sessionShareText({ ...S, unit, customEx: list(S.customEx) }, { ...w, entries: entriesOf(w) }, prs, e1prs))
  const prev = previousComparable(S, w)
  const current = topSets(w)
  const before = topSets(prev)
  const { volumeDelta, volumePct, exercises } = compareSession(S, w, prev, current, before)
  if (prev) {
    const signed = n => `${n > 0 ? '+' : ''}${numberText(n)}`
    lines.push('', `Compared with my last ${prev.name || w.name || 'workout'} session (${dateOf(prev)}):`)
    lines.push(`- Volume change: ${signed(volumeDelta)} ${unit}${volumePct == null ? '' : ` (${signed(volumePct)}%)`}`)
    for (const ex of exercises) {
      const past = ex.before ? ` vs ${setText(ex.before, unit, before.get(ex.id).bodyweight)}` : ''
      lines.push(`- ${ex.name}: ${setText(ex.now, unit, current.get(ex.id).bodyweight)}${past} (${ex.change})`)
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
  return lines.join('\n')
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

export function deepLinkFits(providerId, text, { maxUrl = 7000 } = {}) {
  return queryUrl(providerOf(providerId), text).length <= maxUrl
}

export function aiDeepLink(providerId, text, { maxUrl = 7000 } = {}) {
  const provider = providerOf(providerId)
  const url = queryUrl(provider, text)
  return url.length <= maxUrl ? url : provider.base
}

export function routineHandoffText(S = {}, routine, { now = Date.now() } = {}) {
  const athlete = athleteOf(S, { now })
  const profile = profileFields(athlete, now, labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', '))
  return [
    'Please review and adjust this openGym routine for me. Use my goals, training history, equipment, and schedule; ask about anything important that is missing before suggesting changes.',
    '', routineShareText(S, routine),
    `My profile: ${profile.join('; ') || 'No profile details logged.'}`,
  ].join('\n')
}
