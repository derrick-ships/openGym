// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { todayAction } from './Home.jsx'

describe('Home today action', () => {
  it('resumes an active workout before considering the saved day', () => {
    const onResume = vi.fn()
    const onDetail = vi.fn()
    const onStart = vi.fn()
    const onRest = vi.fn()
    todayAction({ active: { name: 'Legs' }, doneToday: { id: 'saved' }, routineIds: ['r1'], onResume, onDetail, onStart, onRest })
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(onDetail).not.toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
    expect(onRest).not.toHaveBeenCalled()
  })

  it('opens the latest saved workout and never starts a new session or check-in', () => {
    const saved = { id: 'saved-2', d: '2026-09-18', name: 'Leg Day' }
    const onResume = vi.fn()
    const onDetail = vi.fn()
    const onStart = vi.fn()
    const onRest = vi.fn()
    todayAction({ active: null, doneToday: saved, routineIds: ['r1'], onResume, onDetail, onStart, onRest })
    expect(onDetail).toHaveBeenCalledWith(saved)
    expect(onResume).not.toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
    expect(onRest).not.toHaveBeenCalled()
  })

  it('starts a plan only when the day has no completed session', () => {
    const onStart = vi.fn()
    todayAction({ active: null, doneToday: null, routineIds: ['r1', 'r2'], onResume: vi.fn(), onDetail: vi.fn(), onStart, onRest: vi.fn() })
    expect(onStart).toHaveBeenCalledWith(['r1', 'r2'])
  })
})
