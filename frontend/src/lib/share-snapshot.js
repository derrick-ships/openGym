import { api } from './api.js'
import { CATALOGUE, EXIDX } from './exercises.js'
import { ACCENTS, DAYN, fmtNum, todayISO, weekOrder, weekStartOf } from './format.js'
import { exLine, setsDone, workSetsDone } from './history.js'
import { loadOfRoutine, loadOfWorkouts, muscleGroupsOf } from './muscles.js'
import { sessionShareText, setText } from './session-share.js'
import { isWarmupRow } from './workout-model.js'

const list = value => Array.isArray(value) ? value : []
const clean = (value, max, multiline = false) => String(value ?? '')
  .replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g : /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
  .trim().slice(0, max).trimEnd()
const bounded = (value, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(0, Number(value))) : 0
const nonnegative = value => bounded(value, Number.MAX_SAFE_INTEGER)
const completed = row => !!(row?.done || row?.sides?.L?.done || row?.sides?.R?.done)
const validMedia = (name, pattern) => typeof name === 'string' && name.length <= 120 && pattern.test(name) ? name : undefined
const catalogById = new Map(CATALOGUE.map(ex => [ex.id, ex]))
const exerciseOf = (S, entry) => list(S.customEx).find(ex => ex.id === entry.id) || EXIDX[entry.id] || entry.muscleSnapshot || {}
const nameOf = (S, entry) => clean(exerciseOf(S, entry).n || entry.n || entry.name || entry.id || 'Exercise', 120) || 'Exercise'
const boundedLoad = load => Object.fromEntries(Object.entries(load).filter(([key, value]) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && Number.isFinite(value) && value >= 0).slice(0, 40).map(([key, value]) => [key, bounded(value, 1000)]))
const groupsOf = entries => {
  const groups = new Map()
  entries.forEach(entry => { if (entry.sg && !groups.has(entry.sg)) groups.set(entry.sg, String(groups.size + 1)) })
  return groups
}
const mediaOf = (S, entry) => {
  if (list(S.customEx).some(ex => ex.id === entry.id)) return {}
  const ex = catalogById.get(entry.id)
  const img = validMedia(ex?.img, /^[\w.-]{1,120}\.(jpg|jpeg|png|webp)$/)
  const gif = validMedia(ex?.gif, /^[\w.-]{1,120}\.gif$/)
  return { ...(img && { img }), ...(gif && { gif }) }
}
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const base = (S, kind, title, date, options) => ({
  v: 1, kind, title: clean(title, 120) || (kind === 'workout' ? 'Workout' : 'Routine'),
  date: validDate(date) ? date : todayISO(),
  unit: S.unit === 'lb' ? 'lb' : 'kg', accent: ACCENTS[S.accent] || ACCENTS.lime,
  body: S.body === 'female' ? 'female' : 'male',
  ...(clean(options.owner, 60) && { owner: clean(options.owner, 60) }),
  ...(clean(options.aiText, 6000, true) && { aiText: clean(options.aiText, 6000, true) }),
})
const commonEntry = (S, entry, groups) => ({
  id: clean(entry.id, 120) || 'unknown', name: nameOf(S, entry), ...mediaOf(S, entry),
  muscles: muscleGroupsOf(exerciseOf(S, entry)).map(m => clean(m, 40)).filter(Boolean).slice(0, 12),
  ...(groups.has(entry.sg) && { superset: groups.get(entry.sg) }),
  ...(clean(entry.note, 300, true) && { note: clean(entry.note, 300, true) }),
})

export function workoutSnapshot(S = {}, workout = {}, options = {}) {
  const entries = list(workout.entries).filter(Boolean).slice(0, 60).map(entry => ({ ...entry, sets: list(entry.sets).filter(Boolean).slice(0, 40) }))
  const limited = { ...workout, entries }
  const groups = groupsOf(entries)
  const prs = list(options.prs).slice(0, 30)
  const e1prs = list(options.e1prs).filter(Boolean).slice(0, 30)
  const prIds = new Set([...prs, ...e1prs.map(pr => pr.id)])
  const start = Number(workout.start), end = Number(workout.end)
  const durationMs = Math.round(bounded(end - start, 604800000))
  const records = [
    ...prs.map(id => ({ name: nameOf(S, { id }), detail: 'New PR' })),
    ...e1prs.map(pr => ({ name: nameOf(S, pr), detail: clean(`${fmtNum(nonnegative(pr.est))} ${S.unit === 'lb' ? 'lb' : 'kg'} estimated 1RM`, 80) })),
  ].slice(0, 30)
  const safeWorkout = { ...limited, bw: undefined }
  const aiText = options.aiText ?? sessionShareText({ ...S, unit: S.unit === 'lb' ? 'lb' : 'kg', customEx: list(S.customEx) }, safeWorkout, prs, e1prs.filter(pr => Number.isFinite(Number(pr.est))))
  return {
    ...base(S, 'workout', workout.name, workout.d, { ...options, aiText }),
    ...(start > 0 && Number.isFinite(start) && { startedAt: Math.round(bounded(start, 8640000000000000)) }),
    ...(durationMs > 0 && { durationMs }),
    stats: { volume: bounded(workout.vol, 10000000), sets: Math.min(10000, setsDone(limited)), workSets: Math.min(10000, workSetsDone(limited)), prs: records.length, durationMs },
    load: boundedLoad(loadOfWorkouts([limited])),
    entries: entries.filter(entry => entry.sets.some(completed)).map(entry => ({
      ...commonEntry(S, entry, groups),
      sets: entry.sets.filter(completed).map((row, index, rows) => ({
        label: clean(setText(row, entry.target ? { ...entry.target, id: entry.id } : null, S.unit === 'lb' ? 'lb' : 'kg', entry.id), 80) || '—',
        ...(isWarmupRow(row) && { warmup: true }),
        ...((row.pr || (prIds.has(entry.id) && index === rows.length - 1 && !isWarmupRow(row))) && { pr: true }),
      })),
    })),
    ...(records.length && { prs: records }),
    ...(clean(workout.note, 500, true) && { note: clean(workout.note, 500, true) }),
  }
}

export function routineSnapshot(S = {}, routine = {}, options = {}) {
  const entries = list(routine.ex).filter(Boolean).slice(0, 60)
  const groups = groupsOf(entries)
  const days = weekOrder(weekStartOf(S)).filter(day => [].concat(S.week?.[day] || []).includes(routine.id)).map(day => DAYN[day])
  const aiText = options.aiText ?? [routine.name || 'Routine', ...entries.map(entry => `${nameOf(S, entry)}: ${exLine(entry, S.unit === 'lb' ? 'lb' : 'kg')}`), routine.note || ''].join('\n')
  return {
    ...base(S, 'routine', routine.name, todayISO(), { ...options, aiText }),
    load: boundedLoad(loadOfRoutine({ ...routine, ex: entries })),
    entries: entries.map(entry => ({
      ...commonEntry(S, entry, groups),
      scheme: clean(exLine(entry, S.unit === 'lb' ? 'lb' : 'kg'), 80),
      ...((entry.restSec > 0 || S.restSec > 0) && { restSec: Math.round(bounded(entry.restSec > 0 ? entry.restSec : S.restSec, 3600)) }),
      sets: [],
    })),
    ...(days.length && { days }),
    ...(clean(routine.note, 500, true) && { note: clean(routine.note, 500, true) }),
  }
}

export const createShare = (kind, snapshot) => api('/api/shares', { method: 'POST', body: JSON.stringify({ kind, snapshot }) })
export const listShares = () => api('/api/shares')
export const revokeShare = id => api('/api/shares/revoke', { method: 'POST', body: JSON.stringify({ id }) })
