import { MOBILE } from './mobile.js'

// A short phase marker: native Capacitor haptics first, browser vibration where available.
// `stillActive` is rechecked after the lazy native import so a tab hidden during first-load
// cannot produce a delayed cue.
export async function phaseBoundaryHaptic(enabled = true, stillActive = () => true) {
  if (!enabled || !stillActive()) return
  if (MOBILE) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
      if (!stillActive()) return
      await Haptics.impact({ style: ImpactStyle.Light })
      return
    } catch { /* web vibration remains a best-effort fallback */ }
  }
  if (!stillActive()) return
  try { globalThis.navigator?.vibrate?.(12) } catch { /* unsupported or unavailable */ }
}
