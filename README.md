# Tiltling

A top-down gyroscope game for Android and iOS, built with Expo and React Native. Tilt the device to steer your dot, collect points, and avoid the others.

- Portrait only, gyro-only controls, kiosk mode supported.
- Persists high score and settings on device.
- No online leaderboard.

## Interface

The interface is built from the game's own vocabulary: every control is a dot, all type is
set in a 5x7 dot matrix drawn with Skia, and the device tilt drives the UI as well as the
game.

- **Title**: the name is set in living dots whose colour layers drift apart with the tilt.
  The play dot rolls inside a bowl exactly the way the player dot will move, so the
  controls are learned before the first game.
- **Play**: dots are lit glass beads whose glare follows the tilt. The score wears the
  player's current colour and the screen edges are washed in it, so a colour switch is
  felt immediately. Collecting pops a `+1` / `+5` at the dot.
- **Pause**: the scene frosts over and a spirit level appears. Hold the phone level to
  resume (so play restarts from rest), or tap the ring. The corners hold the settings: the
  level pose, the tilt speed and the sounds. The speed button is a comet whose tail shows
  the current speed; it opens a view where the player's dot rolls in a bowl at the chosen
  speed, with slow, normal and fast beneath it, so a tilt shows the difference at once.
- **Game over**: the last hit sends a shockwave and a shake, the result zooms in, and a new
  best gets a shower of dots.
- Transitions are a dot growing from under the finger until it covers the screen.

On devices without motion sensors (simulators) every gyro-driven control falls back to tap.

The icons and the splash mark are derived from the artwork in `assets/icon-source.png` by
`scripts/derive-icons.py` (Python 3 + Pillow). Replace the artwork and rerun it to change them.
The music in `assets/music/` (menu loop, game loop, game-over stinger) is synthesised by
`scripts/generate-music.py`, the catch sounds and the spawn cue in `assets/sounds/` by
`scripts/generate-sounds.py` (Python 3 plus `afconvert` or `ffmpeg`; the spawn cue needs
`ffmpeg`). Both share `scripts/mastering.py`: the loops are mastered to -16 LUFS and the
effects to a -1 dBFS peak, so the mix lives in code (`MUSIC_CUES` in `BindMusic.ts`, `VOLUME`
in `AudioService.ts`). In play the game loop sits near -17 LUFS, a few dB under what Spotify
and YouTube play at. The menu loop plays in the kiosk, the game loop during play and ducked
while paused, and each follows its toggle.

The game mixes with the player's own audio instead of stopping it. When something else is
already playing (their music, a video), the game's music stays silent and the effects play
over it; the music fades in once the other audio stops. On iOS the game follows the
Ring/Silent switch. The check comes from the local native module in `modules/other-audio`,
so it needs a native rebuild; without it the music simply always plays.

On Android the game is immersive on every screen: the navigation bar, gesture handle and
taskbar are hidden, and a swipe from the edge shows them briefly over the game. That lives
in the local native module `modules/system-bars`, which has no JS API, so it needs a native
rebuild.

For the stack, architecture, and quality gates, see [AGENTS.md](./AGENTS.md).

## Requirements

- Node `24.21.0` (see `.nvmrc`; `nvm use`)
- Corepack, with pnpm `10.34.6`
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
| `pnpm lint:unused` | Find unused files, exports and dependencies (Knip) |
| `pnpm preflight` | Typecheck, tests, Biome format (writes fixes), Knip, React Doctor and Expo Doctor. Run before opening a PR |
| `pnpm prebuild` | Regenerate the `ios/` and `android/` native projects |

Biome is the only linter and formatter. Do not add ESLint or Prettier.

Android development uses Expo's `debugOptimized` variant, both through `pnpm android` and
the EAS `development` profile. It keeps Metro, Fast Refresh and the debugger while enabling
native C++ optimizations. The ordinary `debug` variant can make the Skia/Reanimated game
unplayably slow even on a recent phone. See [Expo's build-variant guide](https://github.com/expo/fyi/blob/main/use-debug-optimized-variant.md).

If an existing Android development build is slow, rebuild and reinstall it with
`pnpm android --device`, or rebuild the EAS `development` profile. Restarting Metro or Fast
Refresh cannot change the native build variant. For native C++ debugging without
optimizations, run `pnpm exec expo run:android --variant debug` explicitly.

Android tilt also needs `android.permission.HIGH_SAMPLING_RATE_SENSORS`, declared in
`app.json`. In the pinned Expo Sensors version, Android 12+ uses `SENSOR_DELAY_NORMAL`
without it, even with `DeviceMotion.setUpdateInterval(0)`. That requests sensor readings
only about every 200 ms, so tilt can trail the phone while rendering stays smooth.
The permission enables fast native sampling; iOS uses Core Motion independently.

After changing this permission, regenerate an existing Android project with
`pnpm exec expo prebuild --platform android --no-install`, then rebuild and reinstall with
`pnpm android --device` (or rebuild the relevant EAS profile). Fast Refresh and JavaScript
updates cannot apply a manifest permission. Check quick tilt reversals on a physical
Android device after reinstalling.

## Project structure

```
src/
  domain/          Pure TypeScript: entities, engine (which reports what happened as events), collision, spawning, state machine
  application/     GameSession (engine + clock + store + scene), ports, use cases, event bindings
  infrastructure/  Device motion, frame clock, audio, haptics, AsyncStorage persistence
  presentation/    Screens and the screen flow, Skia canvas, HUD, overlays, dot-matrix type, tilt-driven UI, effects
  __tests__/       Unit tests mirroring the layers above, plus the layer rule itself
```

The composition root is `App.tsx`. `domain` must not import React, Expo, or any platform API.
`presentation` drives the game through `application` (the `GameSession`, the use cases, the
ports) and never reaches into `domain/engine`, `domain/entities` or `infrastructure`.
`src/__tests__/architecture/Layers.test.ts` reads every import and fails on a breach.

`ios/` and `android/` are generated and git-ignored. Run `pnpm prebuild` to recreate them.
`modules/` holds local native modules, which Expo autolinks into those projects.

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

The new app uses new identifiers (`com.johanssoninteractive.tiltling`) with no release continuity.

Related projects:

- [UnitedColorsJS](https://github.com/FrimJo/UnitedColorsJS)
- [UnitedColorsNative](https://github.com/FrimJo/UnitedColorsNative/tree/master)
