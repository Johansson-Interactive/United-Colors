# United Colors

A top-down gyroscope game for Android and iOS, built with Expo and React Native. Tilt the device to steer your dot, collect points, and avoid the others.

- Portrait only, gyro-only controls, kiosk mode supported.
- Persists high score and settings on device.
- No online leaderboard.

For the stack, architecture, and quality gates, see [AGENTS.md](./AGENTS.md).

## Requirements

- Node `24.13.1` (see `.nvmrc`; `nvm use`)
- Corepack, with pnpm `10.29.3`
- Xcode for iOS builds, Android Studio for Android builds

## Setup

```bash
corepack enable
nvm use
pnpm install
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm start` | Start the Expo / Metro dev server |
| `pnpm ios` / `pnpm android` | Build and run a native app (`expo run:*`) |
| `pnpm web` | Run in the browser (not a target platform) |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` / `pnpm lint:fix` | Biome lint |
| `pnpm format` / `pnpm format:fix` | Biome format |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm preflight` | Typecheck, tests, Biome format (writes fixes), React Doctor and Expo Doctor. Run before opening a PR |
| `pnpm prebuild` | Regenerate the `ios/` and `android/` native projects |

Biome is the only linter and formatter. Do not add ESLint or Prettier.

## Project structure

```
src/
  domain/          Pure TypeScript: entities, engine, collision, spawning, state machine
  application/     Game flow use cases, store wiring, scene rendering
  infrastructure/  Device motion, frame clock, audio, AsyncStorage persistence
  presentation/    Screens, Skia canvas, HUD, overlays
  app/             Composition root (currently empty; bootstrap lives in index.ts and App.tsx)
  __tests__/       Unit tests mirroring the layers above
```

`domain` must not import React, Expo, or any platform API. `presentation` depends on `application`, not on `domain` internals.

`ios/` and `android/` are generated and git-ignored. Run `pnpm prebuild` to recreate them.

## Running on a physical device

The app loads its JavaScript bundle from the Metro bundler on your machine. If you see **"No script URL provided"** on a physical device:

1. **Start Metro in one terminal** and leave it running:
   ```bash
   pnpm start
   ```
2. **In a second terminal**, build and run on the device:
   ```bash
   pnpm ios --device
   ```
3. Make sure the phone and the Mac are on the **same Wi‑Fi** network.
4. When iOS asks, allow **Local Network** access for the app so it can reach Metro.

If the device still can't reach Metro, set your Mac's IP explicitly before starting Metro:

```bash
export REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0)
pnpm start
```

## Legacy Android app

The original Android app (Java / OpenGL, package `com.fredrikux.unitedcolors`, last version 2.3, minSdk 19) was rewritten in Expo. It is no longer listed on Google Play.

The legacy source lives on `master`. The last working version is tagged:

```bash
git checkout legacy-android-last-working
```

The `master` branch is kept as the legacy reference. New work happens on feature branches, and the new app uses new identifiers (`com.unitedcolors.app`) with no release continuity.

Related projects:

- [UnitedColorsJS](https://github.com/FrimJo/UnitedColorsJS)
- [UnitedColorsNative](https://github.com/FrimJo/UnitedColorsNative/tree/master)
