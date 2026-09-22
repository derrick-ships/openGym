import { describe, expect, it } from 'vitest'
import { routineKind, routineKindsOf, sessionKind, snapshotRoutineKinds } from './routine-kind.js'

describe('routine kinds', () => {
  it('treats routines without a kind as regular workouts', () => {
    expect(routineKind({ id: 'old' })).toBe('workout')
    expect(sessionKind([{ id: 'old' }])).toBe('workout')
  })

  it('marks only an all-stretching session as stretching and snapshots each routine by id', () => {
    const routines = [{ id: 'a', kind: 'stretching' }, { id: 'b' }]
    expect(sessionKind([{ id: 'a', kind: 'stretching' }])).toBe('stretching')
    expect(sessionKind(routines)).toBe('workout')
    expect(routineKindsOf(routines)).toEqual({ a: 'stretching', b: 'workout' })
  })

  it('defaults pre-upgrade active routine snapshots to workout before appending a new kind', () => {
    expect(snapshotRoutineKinds(['legacy', 'new'], { new: 'stretching' }))
      .toEqual({ legacy: 'workout', new: 'stretching' })
  })
})
