// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/api.js', () => ({ api: apiMock, setRemoteAuth: vi.fn() }))
vi.mock('../lib/exercises.js', () => ({ registerCustom: vi.fn() }))

const storageData = new Map()
const storage = {
  getItem: key => storageData.has(key) ? storageData.get(key) : null,
  setItem: (key, value) => storageData.set(key, String(value)),
  removeItem: key => storageData.delete(key),
  clear: () => storageData.clear(),
}

describe('breathing preferences', () => {
  beforeEach(() => {
    vi.resetModules()
    apiMock.mockReset()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
    localStorage.clear()
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('supplies defaults when loading a profile saved before breathing preferences existed', async () => {
    localStorage.setItem('gym_state_v1', JSON.stringify({ restSec: 120, unit: 'lb' }))
    const { useStore, DEF } = await import('./useStore.js')

    expect(DEF.breathingExercise).toBe('coherent')
    expect(DEF.breathingHaptics).toBe(true)
    expect(useStore.getState().S).toMatchObject({
      restSec: 120,
      unit: 'lb',
      breathingExercise: 'coherent',
      breathingHaptics: true,
    })
  })

  it('persists the selected exercise and haptics preference through the existing update path', async () => {
    const { useStore } = await import('./useStore.js')
    apiMock.mockResolvedValue({ revision: '"rev-1"', rev: 1 })
    useStore.setState({ user: { id: 'user-1' }, ready: true })
    useStore.getState().update(s => {
      s.breathingExercise = 'bhramari'
      s.breathingHaptics = false
    })

    expect(JSON.parse(localStorage.getItem('gym_state_v1'))).toMatchObject({
      breathingExercise: 'bhramari',
      breathingHaptics: false,
    })
    await useStore.getState().pushState()
    expect(apiMock).toHaveBeenCalledWith('/api/data', expect.objectContaining({ method: 'PUT' }))
    expect(JSON.parse(apiMock.mock.calls[0][1].body).state).toMatchObject({
      breathingExercise: 'bhramari',
      breathingHaptics: false,
    })
  })
})
