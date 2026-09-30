# Breathing guide during rest

## Goal

Let a lifter optionally follow a short paced-breathing exercise during the existing rest timer, with clear visual cues and optional haptics. The guide supports composed recovery between sets; it does not claim to measure or lower heart rate.

## User stories

1. As a lifter, I can open a breathing guide from the rest timer when I want it, while still seeing the rest countdown.
2. As a lifter, I can choose my preferred exercise in Settings → During a workout.
3. As a lifter, I can follow phase prompts, timing, and motion cues without sound; optional haptics mark phase changes.
4. As a lifter, I can close the guide without changing my rest, or skip/end rest using the existing control.

## Functional requirements

- Breathing is opt-in per rest interval. Add a blue **Breathe** action next to the rest clock/progress bar. Opening it reveals a compact guide and keeps the rest countdown visible.
- Keep existing `−15`, `+15`, and `Skip` behavior. Closing the guide stops its cues only. Extending, shortening, skipping, or completing rest must not accidentally extend rest or create orphaned cues.
- Persist a preferred guide and a breathing-haptics preference in the existing user settings state. Defaults: coherent breathing 5-in/5-out; haptics enabled. Settings changes use existing state update/persistence/sync behavior.
- Offer the five supplied exercise families:
  1. **Physiological sigh:** nose inhale (2 s), short second nose inhale (1 s), slow mouth exhale (6 s); guide three cycles, then show a still “ready for the next set” state.
  2. **Coherent breathing:** smooth 5 s inhale / 5 s exhale, no holds; guide up to ten cycles or until rest ends.
  3. **Extended exhale:** gym-safe 4 s inhale / 6 s exhale, no hold; guide five cycles or until rest ends. Offer the supplied classic 4-7-8 pattern as an optional, session-only variant: 4 s inhale, 7 s full-lung hold, 8 s mouth exhale, up to four complete cycles. Keep 4/6 as the default; show/enable 4-7-8 only when at least 80 seconds remain in rest, and let the lifter switch back at any time.
  4. **Bhramari:** gentle 4 s nose inhale, closed-mouth hum for 7 s; guide five rounds or until rest ends.
  5. **Nadi shodhana / box stand-in:** guide the simple alternate-nostril 4-in/6-out sequence for four rounds; provide a box-breathing 4-4-4-4 mode in the guide as the supplied hands-free Western stand-in. The user can switch modes while the guide is open.
- The selected exercise starts only after the user taps Breathe. It runs only for the current rest interval and stops at rest completion. Do not auto-start it after every set.
- Start a new round only when enough rest remains for the whole round. In the final five seconds of rest, replace exercise cues with **Take a normal breath. Next set soon.** Do not begin a cycle that cannot finish before rest ends.
- After an exercise reaches its round cap before rest ends, show **Guide complete — rest continues** and keep the rest timer running.
- Derive the current phase from elapsed wall-clock time so timer ticks do not accumulate drift. Do not replay missed haptic cues after the app was hidden; resume at the current phase when visible.
- Prompts use text and phase counts as well as color/motion. Add the brief instruction **Breathe comfortably. Stop if uncomfortable or dizzy.** No spoken audio, workout-history record, backend endpoint, or change to rest duration is in scope.

## Motion, haptics, and accessibility

- Use one expanding/contracting shape for inhale/exhale and clear phase labels such as **Inhale**, **Exhale**, **Hum**, **Hold**, and **Switch sides**. A second small expansion marks the physiological sigh's second inhale. Do not use motion as the only cue.
- Respect `prefers-reduced-motion`: keep static shape, text, and count while removing the breath-paced expansion.
- Mark phase transitions with a brief haptic only when enabled. Use Capacitor Haptics in native builds and the existing browser vibration helper where supported; gracefully no-op where neither is available. Do not vibrate continuously or on every displayed second.
- Pause visual animation and suppress phase haptics while `document.hidden`; clean up animation, timers, and visibility listeners when the guide closes or rest ends.
- Keep the countdown and all controls keyboard/touch accessible. Announce phase changes to assistive technology without announcing every second. Maintain usable layout at 320–360 px and sufficient contrast.
- Translate every new UI string in the existing English-key i18n pattern across all 14 existing locale packs under `frontend/src/locales/*.js`, including the exercise descriptors/variants/phases/cues, completion prompts, settings labels, the `Breathing mode` accessibility label, and safety copy. All packs must retain identical key sets per `scripts/check-locales.mjs`; any pre-existing baseline mismatch is recorded without adding unrelated translations.

## Acceptance criteria

- A Breathe action appears only during rest. It opens/closes a guide without altering the rest countdown or existing rest controls.
- All five exercise families, the box stand-in, and optional classic 4-7-8 produce the specified ordered phases, durations, and capped cycle counts; no incomplete round starts, the final-five-second cue is a normal breath/next-set prompt, and no phase cue occurs after rest ends.
- A selected exercise and haptic preference survive app reload through existing state persistence. An old profile missing the fields receives defaults.
- Skipping/rest completion, changing rest by ±15 seconds, starting work, unmounting, or hiding the page never leaves a stale visual animation or haptic. Returning from hidden state shows the correct current phase without replaying old cues.
- The guide remains understandable with reduced motion, without haptics, without browser vibration support, and with a screen reader.
- Every new localized key is translated in each existing locale pack; locale key-set and source-string checks pass.
- No API, workout-log, or exercise-schema change is introduced.

## Out of scope

- Automatic heart-rate sensing or physiological claims, coaching recommendations, spoken narration, breathing history, bedtime sessions, and changing rest duration.
- A full 20-minute practice flow. The guide is bounded by the current between-set rest and the exercise's short dose.
