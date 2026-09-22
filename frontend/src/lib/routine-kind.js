export const ROUTINE_KINDS = ['workout', 'stretching']

export const routineKind = routine => routine?.kind === 'stretching' ? 'stretching' : 'workout'
export const isStretching = value => value === 'stretching' || value?.kind === 'stretching'

export function routineKindsOf(routines = []) {
  return Object.fromEntries(routines.map(r => [r.id, routineKind(r)]))
}

export function snapshotRoutineKinds(ids = [], kinds = {}) {
  return Object.fromEntries([].concat(ids).map(id => [id, kinds[id] ?? 'workout']))
}

export function sessionKind(routines = []) {
  return routines.length && routines.every(r => routineKind(r) === 'stretching') ? 'stretching' : 'workout'
}
