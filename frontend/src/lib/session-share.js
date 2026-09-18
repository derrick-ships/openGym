import { EXIDX } from './exercises.js'
import { fmtDate, fmtDur, fmtNum } from './format.js'
import { dateLocale, exerciseNameFor } from './i18n-core.js'
import { modeOf, setLabel, setsDone, workSetsDone } from './history.js'
import { isWarmupRow } from './workout-model.js'
import { loadOfWorkouts, MUSCLE_NAME } from './muscles.js'

const exerciseFor = (S, entry) =>
  (S.customEx || []).find(ex => ex.id === entry.id) || EXIDX[entry.id] || entry.muscleSnapshot || {}

const nameFor = (entry, exercise) => exerciseNameFor(exercise) || entry.muscleSnapshot?.n || entry.id

const dateTime = (w) => {
  if (!w?.start) return w?.d ? fmtDate(w.d, false, true) : ''
  return new Date(w.start).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

const setText = (set, target, unit, entryId = target?.id || '') => {
  const id = target?.id || entryId
  const label = target ? setLabel(id, set, target) : setLabel(id, set)
  const mode = target
    ? modeOf(target)
    : set.min != null || set.speed != null ? 'cardio' : set.sec != null ? 'time' : 'reps'
  if (mode === 'cardio' || mode === 'time') return label + (set.w > 0 ? ` ${unit}` : '')
  if (target?.bodyweight || EXIDX[id]?.eq === 'body weight') return label + (set.w > 0 ? ` ${unit}` : '')
  return label + ` ${unit}`
}

const musclesFor = (entry, exercise) => {
  const weights = exercise.muscleWeights || entry.muscleSnapshot?.muscleWeights
  const source = weights ? [{ id: entry.id, ex: { muscleWeights: weights }, sets: 1 }] : [{ id: entry.id, ex: exercise, sets: 1 }]
  const names = Object.entries(loadOfWorkouts([{ entries: [{ ...entry, exercise: source[0].ex, sets: entry.sets }] }]))
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => MUSCLE_NAME[slug] || slug)
  return names.length ? names.join(', ') : ''
}

// Plain text for the completed workout only. The positional arguments are kept small so the
// caller can pass the already-finalized workout and the transient PR list without persistence.
export function sessionShareText(S, w, prs = [], e1prs = []) {
  if (prs && !Array.isArray(prs)) ({ prs = [], e1prs = [] } = prs)
  const entries = (w?.entries || []).filter(entry => (entry.sets || []).some(set => set.done || set.sides?.L?.done || set.sides?.R?.done))
  const lines = [
    w?.name || 'Workout',
    dateTime(w),
    ...(w?.start && w?.end ? [`Duration: ${fmtDur(w.end - w.start)}`] : []),
    ...(w?.bw != null ? [`Bodyweight: ${fmtNum(w.bw)} ${S.unit || ''}`.trim()] : []),
    `Volume: ${fmtNum(w?.vol || 0)} ${S.unit || ''}`.trim(),
    `Sets: ${setsDone(w)} (${workSetsDone(w)} work)`,
    '',
    'Exercises:',
  ]

  entries.forEach((entry, index) => {
    const exercise = exerciseFor(S, entry)
    const target = entry.target ? { ...entry.target, id: entry.id } : null
    const rows = (entry.sets || []).filter(set => set.done || set.sides?.L?.done || set.sides?.R?.done)
    lines.push(`${index + 1}. ${nameFor(entry, exercise)}`)
    const muscles = musclesFor(entry, exercise)
    if (muscles) lines.push(`   Muscles: ${muscles}`)
    lines.push(`   Sets: ${rows.length}`)
    rows.forEach((set, rowIndex) => lines.push(`   ${isWarmupRow(set) ? 'Warm-up' : `Set ${rowIndex + 1}`}: ${setText(set, target, S.unit || '', entry.id)}`))
  })

  const muscleLoad = loadOfWorkouts([w])
  const ranked = Object.entries(muscleLoad).sort((a, b) => b[1] - a[1]).map(([slug]) => MUSCLE_NAME[slug] || slug)
  if (ranked.length) lines.push('', `Muscles worked: ${ranked.join(', ')}`)
  if (prs.length || e1prs.length) {
    lines.push('', 'PRs:')
    prs.forEach(id => lines.push(`- New PR: ${nameFor({ id }, exerciseFor(S, { id }))}`))
    e1prs.forEach(pr => lines.push(`- Best estimated 1RM: ${nameFor({ id: pr.id }, exerciseFor(S, { id: pr.id }))} · ${fmtNum(pr.est)} ${S.unit || ''}`.trim()))
  }
  return lines.join('\n')
}
