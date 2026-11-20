// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

function setVibrate(fn) {
  Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true })
}

async function loadAdapter(native = false, plugin = {}) {
  vi.resetModules()
  vi.doMock('./mobile.js', () => ({ MOBILE: native }))
  if (native) vi.doMock('@capacitor/haptics', () => plugin)
  return import('./breathing-haptics.js')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.doUnmock('./mobile.js')
  vi.doUnmock('@capacitor/haptics')
})

describe('hapticForTransition', () => {
  it('distinguishes phase impacts and completed rounds', async () => {
    const { hapticForTransition } = await loadAdapter()
    const inhale = { id: 'inhale', motion: 'inhale', cycle: 1, phaseIndex: 0, roundsCompleted: 0 }
    const exhale = { id: 'exhale', motion: 'exhale', cycle: 1, phaseIndex: 1, roundsCompleted: 0 }
    expect(hapticForTransition(null, inhale)).toBe(null)
    expect(hapticForTransition(inhale, { ...inhale })).toBe(null)
    expect(hapticForTransition(inhale, { id: 'hold', motion: 'hold', cycle: 1, phaseIndex: 1, roundsCompleted: 0 })).toBe('light')
    expect(hapticForTransition(inhale, exhale)).toBe('release')
    expect(hapticForTransition(exhale, { ...inhale, cycle: 2, roundsCompleted: 1 })).toBe('success')
    expect(hapticForTransition(exhale, { id: 'ready', label: 'Guide complete — rest continues', completed: true, roundsCompleted: 1, rounds: 1 })).toBe('success')
  })
  it('uses a short double vibration for a release', async () => {
    const vibrate = vi.fn()
    setVibrate(vibrate)
    const { phaseBoundaryHaptic } = await loadAdapter()
    await phaseBoundaryHaptic(true, () => true, 'release')
    expect(vibrate).toHaveBeenCalledWith([18, 60, 18])
  })
})

describe('phaseBoundaryHaptic', () => {
  it('uses the browser vibration fallback when native haptics are unavailable', async () => {
    const vibrate = vi.fn(() => true)
    setVibrate(vibrate)
    const { phaseBoundaryHaptic } = await loadAdapter()

    await phaseBoundaryHaptic()

    expect(vibrate).toHaveBeenCalledWith(12)
  })

  it('does nothing when disabled or the guide is no longer active', async () => {
    const vibrate = vi.fn()
    setVibrate(vibrate)
    const { phaseBoundaryHaptic } = await loadAdapter()

    await phaseBoundaryHaptic(false)
    await phaseBoundaryHaptic(true, () => false)

    expect(vibrate).not.toHaveBeenCalled()
  })

  it('uses a light native impact in the Capacitor build', async () => {
    const vibrate = vi.fn()
    const impact = vi.fn().mockResolvedValue(undefined)
    setVibrate(vibrate)
    const { phaseBoundaryHaptic } = await loadAdapter(true, {
      Haptics: { impact },
      ImpactStyle: { Light: 'LIGHT' },
    })

    await phaseBoundaryHaptic()

    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('falls back safely when the native plugin rejects', async () => {
    const vibrate = vi.fn(() => true)
    const impact = vi.fn().mockRejectedValue(new Error('unavailable'))
    setVibrate(vibrate)
    const { phaseBoundaryHaptic } = await loadAdapter(true, {
      Haptics: { impact },
      ImpactStyle: { Light: 'LIGHT' },
    })

    await expect(phaseBoundaryHaptic()).resolves.toBeUndefined()
    expect(vibrate).toHaveBeenCalledWith(12)
  })
})
