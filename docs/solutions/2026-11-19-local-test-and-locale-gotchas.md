# Local test runs and locale merges: three gotchas

## 1. Run the suites on Node 22, not the machine default
What broke: on Node 26 the frontend suite reported 30 failing files (localStorage `getItem`/`clear` undefined).
Why: CI and the Docker images pin Node 22; newer Node ships an experimental global `localStorage`
that shadows happy-dom's.
Fix: `npx -y node@22 node_modules/vitest/vitest.mjs run` (frontend, mcp) and
`npx -y node@22 --test *.test.js test/*.test.js` (api).
Spot it: many store/sheets test files fail at import with localStorage errors while lib tests pass.

## 2. The API suite has 9 pre-existing coach-job failures on main (as of 0f1d3c1)
Tests 33, 38, 75, 78, 84, 87, 103, 124, 132 fail before any change. Diff the `not ok` list
against that baseline instead of expecting zero failures.

## 3. Parallel branches that add locale keys conflict in every locale file
What broke: two branches each added keys at the top of all 14 `src/locales/*.js`; merging gave 13
conflicts, and a naive union resurrected a key (`Stop`) one branch had deliberately removed.
Fix: union the added lines, then delete keys no longer referenced by any `t('...')` call, then run
`node scripts/check-locales.mjs` and `node scripts/pt-br-inheritance-fingerprint.mjs` and update
`pt-br-locale.test.js` counts only with the reviewed values.
Also: `check-locales` only compares key sets. English placeholders pass it, and a pt-BR key set
to English shadows a real pt translation. Review values, not just counts.
