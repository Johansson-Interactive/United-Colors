# AGENTS.md

React Native (Expo) remake of a legacy Android tilt game. The original Java app lives on tag `legacy-android-last-working`. When you're unsure how something should behave, check that code before guessing.

## Rules

- Don't add dependencies or bump versions without asking. Versions are pinned on purpose (`package.json`, `.nvmrc`).
- Use Biome for linting and formatting. Never add ESLint or Prettier.
- `src/domain` is pure, deterministic TypeScript: no React, Expo, or device APIs. Game rules belong there, not in components.
- `src/presentation` drives the game through `src/application` (`GameSession`, use cases, `ports.ts`); it never imports `domain/engine`, `domain/entities` or `infrastructure`. `src/__tests__/architecture/Layers.test.ts` enforces the import directions; keep it green rather than loosening it.
- Screen logic goes in pure steppers with tests (`presentation/flow/screenFlow.ts`, `presentation/tilt/*.ts`), with thin React shells around them. Hooks are not unit-tested here.
- Any behavior change needs a test in the same change (Vitest, `src/__tests__`).
- To bench Android performance, build with `scripts/android-bench-build.sh` and compare with `scripts/android-ab-bench.sh`; their headers carry the bench practice.
- Before you finish, run `pnpm preflight`. It applies Biome fixes, then runs `pnpm verify`: the read-only check (Biome, typecheck, tests, Knip, react-doctor, expo-doctor) that CI runs (`.github/workflows/verify.yml`). Expo SDK version drift (`expo install --check`) is printed as a warning and doesn't fail it.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Johansson-Interactive/United-Colors`, used through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created as needed. See `docs/agents/domain.md`.
