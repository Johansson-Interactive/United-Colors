# AGENTS.md

React Native (Expo) remake of a legacy Android tilt game. The original Java app lives on tag `legacy-android-last-working`. When you're unsure how something should behave, check that code before guessing.

## Rules

- Don't add dependencies or bump versions without asking. Versions are pinned on purpose (`package.json`, `.nvmrc`).
- Use Biome for linting and formatting. Never add ESLint or Prettier.
- `src/domain` is pure, deterministic TypeScript: no React, Expo, or device APIs. Game rules belong there, not in components.
- Any behavior change needs a test in the same change (Vitest, `src/__tests__`).
- Before you finish, run `pnpm preflight`. It applies Biome fixes, then runs `pnpm verify`: the read-only check (Biome, typecheck, tests, react-doctor, expo-doctor) that CI should run.
