# Implementation plan: breathing guide during rest

## Context and decisions

- Stack: React 19 + Vite frontend, Zustand user state, Capacitor 7 native shell, existing `t()` i18n, CSS in `frontend/src/index.css`.
- Rest timer is rendered by `frontend/src/components/RestTimer.jsx`; its wall-clock countdown and stop/adjust actions live in `frontend/src/store/useUI.js`.
- User settings live in `frontend/src/store/useStore.js` (`DEF`) and are edited in `frontend/src/views/Settings.jsx`.
- The repo already has a browser `vibrate()` helper in `frontend/src/lib/sound.js`, and `@capacitor/core` is installed. `@capacitor/haptics` is not currently installed; use the official Capacitor plugin for native feedback and retain the browser helper as fallback.
- Keep the work frontend-only. Do not add server/API persistence or breathing history; existing settings persistence/sync is sufficient.
- Use CSS transitions/animations and existing reduced-motion CSS support; do not add a motion library for a single paced shape.
- Store only the selected exercise (`breathingExercise`, default `coherent`) and haptics toggle (`breathingHaptics`, default `true`) with the existing persisted `S` settings. Keep the classic 4-7-8 variant choice, active guide, and its start timestamp ephemeral in the rest UI.
- Compute guide phase from a monotonic/wall-clock start timestamp and the phase cycle definition, rather than incrementing a phase counter once per timer tick. Visibility handling must suppress hidden-page haptics and let the existing rest timer remain authoritative.

## Likely files

- Add `frontend/src/lib/breathing.js` for the five guided patterns and pure elapsed-time-to-phase/cycle helpers; add one focused test file beside it.
- Add a small `frontend/src/lib/breathing-haptics.js` adapter if needed to isolate Capacitor and browser feedback; install `@capacitor/haptics` in `frontend/package.json` / lockfile and run Capacitor sync for native integration.
- Update `frontend/src/store/useStore.js` with defaults for selected breathing exercise and haptics.
- Update `frontend/src/views/Settings.jsx` and every existing `frontend/src/locales/*.js` pack for pattern choice, haptic toggle, descriptions, and cues. The locale checker requires identical keys across all packs; provide real translations rather than relying on English fallback.
- Update `frontend/src/components/RestTimer.jsx` and `frontend/src/index.css` for the Breathe action and compact guide panel.
- Add focused tests for timing, preference persistence/defaults, and rest timer guide lifecycle using current Vitest conventions.

## Integration contract

- Exercise preference IDs: `physiological-sigh`, `coherent`, `extended-exhale`, `bhramari`, `alternate-nostril`; the alternate-nostril guide offers `alternate-nostril` and `box` modes while open.
- A phase definition exposes its visible label, duration, optional side/second-inhale cue, and next phase. The pure helper returns the current phase and completed round for `elapsedMs`; it does not own timers, DOM, or haptics. It supports both 4/6 and classic 4-7-8 extended-exhale timing.
- Classic 4-7-8 is an opt-in, session-only variant shown only with at least 80 seconds remaining. Never start an incomplete round; switch the cue to a normal breath/next-set prompt in the final five seconds, and show “Guide complete — rest continues” after a capped guide ends.
- `RestTimer` owns whether the guide is open and its start timestamp. `timer.left`/`timer.endsAt` remain the source of truth for rest ending. When rest is stopped or expires, the guide closes and all UI effects are cleaned up.
- Haptic calls happen only on a newly observed visible phase boundary and are skipped when disabled, hidden, reduced-motion policy elects no haptic, or unavailable.
- Reuse the English i18n keys in `frontend/src/lib/breathing.js` exactly for helper-provided descriptors, variant labels, phase labels, cues, and completion copy; UI controls additionally use `Breathe`, `Close breathing guide`, `Breathing mode`, `Round {0} of {1}`, and `Breathe comfortably. Stop if uncomfortable or dizzy.`. Settings copy uses `Breathing guide`, `Choose a breathing exercise for your rest period.`, `Haptics on breathing cues`, and `A brief vibration marks each breathing phase.`. Translate each new key in every locale pack and report unrelated locale/source-string baseline gaps separately.

## Verification

- Run focused frontend tests for the timing helper (including 4-7-8/cycle-boundary behavior), settings default/persistence, and rest-guide lifecycle.
- Run the frontend test suite and production build after integration.
- Inspect a narrow phone layout and verify reduced-motion behavior. Exercise native Capacitor haptics on iOS and Android where device/simulator access is available; report platform checks separately from browser tests.
- Confirm locale key-set and source-string checks pass across every pack and no generated native/build output or unrelated files enter the diff.
