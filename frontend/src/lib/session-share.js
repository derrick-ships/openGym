import { EXIDX } from './exercises.js'
import { fmtDate, fmtDur, fmtNum } from './format.js'
import { dateLocale } from './i18n-core.js'
import { doneUnits, modeOf, setLabel, setsDone, workSetsDone } from './history.js'
import { clustersOf, dropsOf, hasCompletedWork, isSideSet, isWarmupRow } from './workout-model.js'
import { loadOfWorkouts, MUSCLE_NAME } from './muscles.js'

const exerciseFor = (S, entry) =>
  (S.customEx || []).find(ex => ex.id === entry.id) || EXIDX[entry.id] || entry.muscleSnapshot || {}

// The share is deliberately English and portable: use the catalogue's canonical name rather
// than the current UI locale, which may be Spanish/French on the device receiving the text.
const nameFor = (entry, exercise) => exercise?.n || entry.muscleSnapshot?.n || entry.n || entry.id

const dateTime = (w) => {
  if (!w?.start) return w?.d ? fmtDate(w.d, false, true) : ''
  return new Date(w.start).toLocaleString(dateLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

const nestedText = (set, unit, prefix = '', bodyweight = false) => {
  const parts = []
  const drops = dropsOf(set)
  const dropText = drop => bodyweight
    ? (drop.w > 0 ? `+${fmtNum(drop.w)} × ${fmtNum(drop.r || 0)}${unit ? ` ${unit}` : ''}` : `${fmtNum(drop.r || 0)} reps`)
    : `${fmtNum(drop.w || 0)}×${fmtNum(drop.r || 0)}${unit ? ` ${unit}` : ''}`
  if (drops.length) parts.push(`${prefix}drops: ${drops.map(dropText).join(', ')}`)
  const clusters = clustersOf(set)
  if (clusters.length) parts.push(`${prefix}rest-pause: ${clusters.map(cluster => `${fmtNum(cluster.r || 0)} reps (${fmtNum(cluster.restSec || 0)}s rest)`).join(', ')}`)
  return parts
}

const setText = (set, target, unit, entryId = target?.id || '') => {
  const id = target?.id || entryId
  const label = target ? setLabel(id, set, target) : setLabel(id, set)
  const mode = target
    ? modeOf(target)
    : set.min != null || set.speed != null ? 'cardio' : set.sec != null ? 'time' : 'reps'
  const needsUnit = mode === 'cardio' || mode === 'time'
    ? set.w > 0
    : set.w > 0 || (!target?.bodyweight && EXIDX[id]?.eq !== 'body weight')
  const bodyweight = !!(target?.bodyweight || EXIDX[id]?.eq === 'body weight')
  const nestedFor = isSideSet(set)
    ? ['L', 'R'].flatMap(side => hasCompletedWork(set.sides[side]) ? nestedText(set.sides[side], unit, `${side} `, bodyweight) : [])
    : nestedText(set, unit, '', bodyweight)
  const addUnit = part => {
    const effort = part.match(/^(.*?)(\s\((?:RIR|RPE)\s[^)]+\))$/)
    return effort ? `${effort[1]} ${unit}${effort[2]}` : `${part} ${unit}`
  }
  const base = !needsUnit || !unit ? label
    : isSideSet(set)
      ? label.split(' · ').map(part => part.trim().endsWith('—') ? part : addUnit(part)).join(' · ')
      : addUnit(label)
  return [base, ...nestedFor].join(' · ')
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
    ...(w?.note ? [`Note: ${w.note}`] : []),
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
    lines.push(`   Sets: ${rows.reduce((count, set) => count + doneUnits(set), 0)}`)
    rows.forEach((set, rowIndex) => lines.push(`   ${isWarmupRow(set) ? 'Warm-up' : `Set ${rowIndex + 1}`}: ${setText(set, target, S.unit || '', entry.id)}`))
    if (entry.note) lines.push(`   Note: ${entry.note}`)
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
