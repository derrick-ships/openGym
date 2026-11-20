import { EXIDX } from './exercises.js'
import { lastBW, workoutVolume } from './history.js'
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
const cleanText = value => typeof value === 'string' ? value.trim() : ''
const numberText = n => String(Math.round(n * 10) / 10)
const labelsFor = (ids, catalog) => ids.map(id => catalog.find(item => item.id === id)?.label).filter(Boolean)
const unitOf = S => S.unit || 'kg'
const startOf = w => w.start || Date.parse(w.d)
const isoDate = time => new Date(time).toISOString().slice(0, 10)
const dateOf = w => w.d || isoDate(startOf(w))
const nameOf = (S, entry) =>
  list(S.customEx).find(ex => ex.id === entry.id)?.n || EXIDX[entry.id]?.n || entry.muscleSnapshot?.n || entry.n || entry.id

export function athleteOf(S) {
  const athlete = S.athlete || {}
  return {
    sex: cleanText(athlete.sex) || null,
    birthYear: Number.isInteger(athlete.birthYear) && athlete.birthYear >= 1900 ? athlete.birthYear : null,
    heightCm: Number.isFinite(athlete.heightCm) && athlete.heightCm > 0 ? athlete.heightCm : null,
    experience: cleanText(athlete.experience) || null,
    goal: cleanText(athlete.goal) || null,
    injuries: cleanText(athlete.injuries),
    healthSources: list(athlete.healthSources).filter(id => HEALTH_SOURCES.some(item => item.id === id)),
    notes: cleanText(athlete.notes),
  }
}

function compareSets(a, b) {
  if ('sec' in a.set) return a.set.sec - b.set.sec
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
  for (const entry of w?.entries || []) {
    const target = entry.target || entry
    for (const row of entry.sets || []) {
      if (isWarmupRow(row)) continue
      const mode = modeForSet(row, target)
      if (mode === 'cardio') continue
      const timed = mode === 'time'
      // A side row's total reps and max load may come from different lifts.
      for (const rowSet of isSideSet(row) ? [row.sides.L, row.sides.R] : [row]) {
        const count = Number(timed ? rowSet.sec : rowSet.r)
        if (!rowSet.done || !(count > 0)) continue
        const set = timed ? { sec: count } : { w: Number(rowSet.w) || 0, r: count }
        const top = { entry, set, est: timed ? null : estimate1RM(set.w, set.r) }
        const best = result.get(entry.id)
        // Prefer reps if a session mixes modes; seconds and reps can't be ranked together.
        if (!best || (timed === ('sec' in best.set) ? ranksHigher(top, best) : !timed)) result.set(entry.id, top)
      }
    }
  }
  return result
}

export function progressSnapshot(S, { now = Date.now(), weeks = 8 } = {}) {
  const start = now - weeks * WEEK_MS
  const workouts = list(S.workouts).filter(w => startOf(w) >= start && startOf(w) <= now)
    .sort((a, b) => startOf(b) - startOf(a))
  const byExercise = new Map()
  for (const workout of workouts) {
    for (const [id, top] of topSets(workout)) {
      const recent = byExercise.get(id)
      if (!recent) {
        byExercise.set(id, { top, name: nameOf(S, top.entry), sessions: 1, lastDate: dateOf(workout) })
        continue
      }
      recent.sessions++
      // Keep the latest mode when an exercise was logged both ways in the window.
      if (('sec' in top.set) === ('sec' in recent.top.set) && ranksHigher(top, recent.top)) recent.top = top
    }
  }
  const today = isoDate(now)
  const weighIns = list(S.bodyweight).filter(b => b.d <= today)
  return {
    workouts: workouts.length,
    sessionsPerWeek: weeks > 0 ? workouts.length / weeks : 0,
    bodyWeight: lastBW({ bodyweight: weighIns })?.w ?? null,
    exercises: [...byExercise.entries()]
      .sort(([, a], [, b]) => b.sessions - a.sessions)
      .slice(0, 12)
      .map(([id, { top, name, sessions, lastDate }]) => ({ id, name, sessions, lastDate, bestSet: top.set, est1RM: top.est })),
  }
}

function profileFields(athlete, now, sources) {
  const year = new Date(now).getUTCFullYear()
  return [
    athlete.sex && `Sex: ${athlete.sex}`,
    athlete.birthYear && athlete.birthYear <= year && `Age: about ${year - athlete.birthYear}`,
    athlete.heightCm && `Height: ${athlete.heightCm} cm`,
    athlete.experience && `Experience: ${athlete.experience}`,
    athlete.goal && `Goal: ${athlete.goal}`,
    athlete.injuries && `Injuries: ${athlete.injuries}`,
    sources && `Health sources: ${sources}`,
    athlete.notes && `Notes: ${athlete.notes}`,
  ].filter(Boolean)
}

const setText = (set, unit) => 'sec' in set ? `${numberText(set.sec)} s`
  : set.w ? `${numberText(set.w)} ${unit} × ${set.r}` : `${set.r} reps`

export function coachSkillText(S, { now = Date.now() } = {}) {
  const athlete = athleteOf(S)
  const sources = labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', ')
  const profile = profileFields(athlete, now, sources)
  const snapshot = progressSnapshot(S, { now })
  const unit = unitOf(S)
  const numbers = [
    `Last 8 weeks: ${snapshot.workouts} ${snapshot.workouts === 1 ? 'session' : 'sessions'} (${numberText(snapshot.sessionsPerWeek)} per week on average).`,
    ...(snapshot.bodyWeight != null ? [`Body weight: ${numberText(snapshot.bodyWeight)} ${unit}`] : []),
    ...snapshot.exercises.map(({ name, sessions, lastDate, bestSet, est1RM }) =>
      `- ${name}: ${setText(bestSet, unit)}${est1RM != null ? ` · ${numberText(est1RM)} ${unit} estimated 1RM` : ''} · ${sessions} ${sessions === 1 ? 'session' : 'sessions'}, last ${lastDate}`),
  ]
  return [
    '## Role\nBe my strength coach. Use my openGym data as the source of truth for my training.',
    '## Memory rules\nKeep a running progress log in your memory or project. After every session I share, update it with what I actually did and any context I give you. Never overwrite logged facts with guesses. If you cannot save memory, give me an updated log I can bring back next time.',
    '## Before recommending\nAsk me at most 3 short questions about missing details that matter: age, sex, height, experience, goal, injuries, equipment, and schedule.',
    '## Load rules\nBase prescribed weights and reps on my logged history and estimated 1RM. Never invent numbers. For a new exercise, start conservatively at about RPE 7 rather than guessing a weight. Progress in small steps, never jumping more than about 5–10% at once unless my history supports it. Keep targets realistic for my experience and body weight.',
    '## When a session is off\nIf performance drops below my usual, ask what happened before changing loads: sleep, sickness, pain, or time. For illness or poor sleep, keep the plan and resume normal loads when I have recovered. For pain, adjust the exercise or load and suggest seeing a qualified health professional.',
    `## Health data\nIf I connected ${sources ? `${sources} or another health or wearable source` : 'a health or wearable source'} to you, use available recovery, sleep, and HRV data. If you do not have access, ask me instead.`,
    '## openGym MCP note\nIf you have the openGym MCP connected, read my workouts, estimated 1RM, and muscle balance from it instead of asking me for them. Routine changes go through proposals I approve.',
    `## My profile\n${profile.length ? profile.map(field => `- ${field}`).join('\n') : 'No profile details logged.'}`,
    `## My current numbers\n${numbers.join('\n')}`,
  ].join('\n\n')
}

const routineIdsOf = w => w.routineIds ?? (w.routineId ? [w.routineId] : [])

export function previousComparable(S, w) {
  if (!w) return null
  const ids = routineIdsOf(w)
  const start = startOf(w)
  let prev = null
  let prevStart = -Infinity
  for (const candidate of list(S.workouts)) {
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

export function sessionComparison(S, w) {
  const prev = previousComparable(S, w)
  const before = topSets(prev)
  const prevVolume = prev ? (prev.vol ?? workoutVolume(prev)) : null
  const volumeDelta = prev ? (w.vol ?? workoutVolume(w)) - prevVolume : null
  const exercises = [...topSets(w).entries()].map(([id, top]) => {
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

export function sessionHandoffText(S, w, { prs = [], e1prs = [], context = w?.context } = {}) {
  const flags = list(context?.flags)
  const notes = [...labelsFor(flags, SESSION_CONTEXT_FLAGS), cleanText(context?.note)].filter(Boolean)
  const unit = unitOf(S)
  const lines = ['Here is my latest openGym session. Compare it with my previous sessions and update my progress log.']
  if (notes.length) lines.push(`How it went: ${notes.join('; ')}`)
  lines.push('', sessionShareText({ ...S, unit, customEx: list(S.customEx) }, { entries: [], ...w }, prs, e1prs))
  const { prev, volumeDelta, volumePct, exercises } = sessionComparison(S, w)
  if (prev) {
    const signed = n => `${n > 0 ? '+' : ''}${numberText(n)}`
    lines.push('', `Compared with my last ${prev.name || w.name || 'workout'} session (${dateOf(prev)}):`)
    lines.push(`- Volume change: ${signed(volumeDelta)} ${unit}${volumePct == null ? '' : ` (${signed(volumePct)}%)`}`)
    for (const ex of exercises) {
      const past = ex.before ? ` vs ${setText(ex.before, unit)}` : ''
      lines.push(`- ${ex.name}: ${setText(ex.now, unit)}${past} (${ex.change})`)
    }
  }
  lines.push('')
  if (flags.some(flag => ['sick', 'poor-sleep', 'pain'].includes(flag))) {
    lines.push('Do not treat this session as a strength drop on its own. Take the reported sleep, illness, or pain into account.')
  }
  lines.push('If anything dropped compared with my usual numbers, ask me what happened before changing my loads (sleep, sickness, pain, time). Then tell me what to aim for next session.')
  return lines.join('\n')
}

export const AI_PROVIDERS = {
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', base: 'https://chatgpt.com/', query: 'https://chatgpt.com/?q=' },
  claude: { id: 'claude', name: 'Claude', base: 'https://claude.ai/new', query: 'https://claude.ai/new?q=' },
}

export function aiDeepLink(providerId, text, { maxUrl = 7000 } = {}) {
  const provider = Object.hasOwn(AI_PROVIDERS, providerId) ? AI_PROVIDERS[providerId] : AI_PROVIDERS.chatgpt
  const url = provider.query + encodeURIComponent(text)
  return url.length <= maxUrl ? url : provider.base
}

export function routineHandoffText(S, routine) {
  const athlete = athleteOf(S)
  const profile = profileFields(athlete, Date.now(), labelsFor(athlete.healthSources, HEALTH_SOURCES).join(', '))
  return [
    'Please review and adjust this openGym routine for me. Use my goals, training history, equipment, and schedule; ask about anything important that is missing before suggesting changes.',
    '', routineShareText(S, routine),
    `My profile: ${profile.join('; ') || 'No profile details logged.'}`,
  ].join('\n')
}
