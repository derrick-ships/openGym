import { MOBILE } from './mobile.js'

// A round boundary takes precedence over its new inhale so it is only felt once.
export function hapticForTransition(previous, next) {
  if (!previous || !next || !next.id) return null
  if (next.roundsCompleted > previous.roundsCompleted && (!next.completed || next.roundsCompleted === next.rounds)) return 'success'
  if (next.completed || (next.cycle === previous.cycle && next.phaseIndex === previous.phaseIndex)) return null
  return next.motion === 'exhale' ? 'release' : 'light'
}

// Recheck after a lazy native import: hidden/unmounted guides must not produce delayed cues.
export async function phaseBoundaryHaptic(enabled = true, stillActive = () => true, kind = 'light') {
  if (!enabled || !stillActive()) return
  if (MOBILE) {
    try {
      const plugin = await import('@capacitor/haptics')
      const { Haptics, ImpactStyle } = plugin
      if (!stillActive()) return
      if (kind === 'success') await Haptics.notification({ type: plugin.NotificationType.Success })
      else await Haptics.impact({ style: kind === 'release' ? ImpactStyle.Medium : ImpactStyle.Light })
      return
    } catch { /* web vibration remains a best-effort fallback */ }
  }
  if (!stillActive()) return
  try { globalThis.navigator?.vibrate?.(kind === 'release' ? [18, 60, 18] : kind === 'success' ? [12, 45, 24] : 12) } catch { /* unsupported or unavailable */ }
}
