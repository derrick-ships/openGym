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
