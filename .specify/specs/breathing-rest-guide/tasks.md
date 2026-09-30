# Implementation tasks: breathing guide during rest

## Setup and core

- [X] T001 [P] Add focused tests and pure breathing phase definitions for the five exercise families in `frontend/src/lib/breathing.test.js` and `frontend/src/lib/breathing.js`. Tests cover ordered phases, durations, capped rounds, elapsed-time lookup, alternate-nostril side changes, box stand-in, optional classic 4-7-8 timing, no incomplete round, and the final-five-second normal-breath cue.
- [X] T002 [P] Add default `breathingExercise: 'coherent'` and `breathingHaptics: true` to `frontend/src/store/useStore.js`; add a focused default/hydration/persistence test proving older profiles receive these defaults and selected values use existing persistence/sync behavior.

## Independent integrations

- [X] T003 [P] Add Capacitor native haptics integration: install `@capacitor/haptics`, add a small feedback adapter (or extend the existing shared helper), use browser `vibrate()` as supported fallback, and ensure unavailable/rejected feedback is a harmless no-op. Keep haptics limited to short phase-boundary events.
- [X] T004 [P] Add the Settings → During a workout selector for the five exercise families and the haptics toggle in `frontend/src/views/Settings.jsx`; add properly translated keys for all helper descriptors, variant labels, phase labels/cues, completion prompts, controls, accessibility labels, and settings copy to every existing `frontend/src/locales/*.js` pack. The classic 4-7-8 variant remains a session-only guide choice. Verify breathing-key parity and source-string coverage; record the three unrelated Spanish-only baseline keys separately.

## Timer integration

- [X] T005 Add the blue Breathe action and compact guide panel in `frontend/src/components/RestTimer.jsx`, styled in `frontend/src/index.css`. Keep the rest clock visible and preserve existing ±15 and Skip controls.
- [X] T006 Connect guide phases to the helper and haptics adapter. Start only on tap; derive phase from elapsed time; offer classic 4-7-8 only when at least 80 seconds remain; do not start incomplete rounds; switch to the normal-breath/next-set prompt in the final five seconds; show “Guide complete — rest continues” at round cap. Close and clean up on rest stop/completion or a new work timer; closing guide must not stop rest. Hidden tabs suppress cues and resume at the current phase without replay.
- [X] T007 Add reduced-motion, keyboard/screen-reader cues, 320–360 px layout, comfortable-breathing/stop guidance, and exercise-completion states. Keep text/count cues available without color, animation, vibration, or sound.

## Verification and closeout

- [X] T008 Run focused tests, full frontend tests, production build, locale string checks, and the relevant Capacitor sync/build check if supported. Verify short/extended/skipped/expired rest and hidden-page recovery; record device haptics coverage separately when native devices are unavailable.
- [X] T009 Review the final diff against acceptance criteria; confirm no backend/API/workout-history changes and mark completed tasks `[X]`.

## Verification record

- Focused breathing, settings, haptics, and RestTimer tests pass (24 tests). The full frontend run passed 1,535 tests across 121 files; two unrelated Brazilian Portuguese curated-data suites could not load because `scripts/exercise-name-sources/pt-BR.json` and `scripts/instruction-sources/pt-BR.json` are absent from the checkout and `HEAD`.
- The production Vite build completed with the existing public assets copied through a temporary APFS clone. `npx cap sync android` completed and registered `@capacitor/haptics`; native-device haptic behavior was not exercised. iOS sync was unavailable because CocoaPods is not installed.
- Locale parity reports only the three pre-existing Spanish-only keys (`New stretching`, `New stretching routine`, and `Routine type`); all breathing keys are present across locale packs. The source-string report has the same 98 undefined strings as baseline. Browser/device visual QA was unavailable in this environment.
- Final diff review found no backend, API, workout-history, or exercise-schema changes. `git diff --check` passed.
