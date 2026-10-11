# Code review: performance and code quality

Reviewed at commit `d0c511c` on 2026-10-11. All 177 Vitest tests pass at that commit.

The architecture is sound: the domain is pure, and the canvas draws from a Reanimated shared value with no React render per frame. The findings below are about how that shared value is built, how Skia pictures are recorded, and leftover code. None are correctness bugs.

## How to use this file

Each task is self-contained and can be handed to Claude as-is. Paste the task block plus the rules block below into the prompt. Suggested batching is at the end.

Rules every task must follow, from `AGENTS.md`:

- Do not add dependencies or bump versions.
- Biome only for lint and format. No ESLint or Prettier.
- `src/domain` stays pure TypeScript: no React, Expo or device APIs.
- Any behaviour change ships with a test in `src/__tests__` in the same change.
- Run `pnpm preflight` before finishing. It must pass.
- When unsure how something should behave, read the Java on tag `legacy-android-last-working` first.

### Model guide

| Model | Use for |
|---|---|
| Fable 5.1 | Changes that cross the JS thread / UI thread boundary or touch several layers at once, where a subtle mistake breaks rendering or timing. |
| Opus 5.5 | Contained refactors that still need judgement: engine internals, Reanimated or Skia specifics, new tests for timing code. |
| Haiku 5.5 | Mechanical edits with a precise spec: deletions, one-line fixes, duplicated code, small tests. |

---

## Performance

### P1. Pass the scene to the UI thread as a flat typed array

**Model:** Fable 5.1. Spans the domain types, the scene builder, the game loop hook and the canvas worklet, and changes what crosses the JS/UI boundary every frame. The serialization behaviour of worklets must be right or nothing draws.

**Files:** `src/application/renderScene.ts`, `src/presentation/hooks/useGameLoop.ts`, `src/presentation/GameCanvas.tsx`, `src/domain/types.ts`

**Problem:** `useGameLoop.ts:46` builds a new array of up to 200 `SceneDot` objects every rendered frame and calls `scene.set()` with it. `react-native-worklets` 0.10.1 clones each object property by property, colour string included, into the UI runtime at 60 Hz. It also allocates 200 objects per frame on the JS heap.

**Fix:**
- Make `buildScene` write into a `Float32Array` with a fixed stride per dot, for example `x, y, radius, colourIndex, kind`, plus a dot count. Worklets serializes typed-array views natively, see `VALID_ARRAY_VIEWS_NAMES` in `node_modules/react-native-worklets/lib/module/memory/serializable.native.js`.
- Colour becomes an index into `GAME_COLORS`, with a reserved index for white if ever needed. The canvas looks colours up from a pre-parsed table, see P2.
- Reuse one buffer per frame if the dot count fits, otherwise grow it. Shared value `set` still clones, but one buffer copy is far cheaper than 200 object clones.
- Keep `SceneDot` as the test-facing shape if that keeps the existing `RenderScene.test.ts` readable, or update the tests to decode the buffer. Either way the test must still cover extrapolation, size interpolation, frozen phases and player-last ordering.

**Done when:** `RenderScene.test.ts` passes against the new encoding, the game draws identically on device, and no per-dot object is allocated in `buildScene`.

### P2. Stop rebuilding Skia paints and parsing colours every frame in the canvas

**Model:** Opus 5.5. One file, but it needs correct handling of Skia host objects captured by a UI-thread worklet. Do it with P1 if the same person does both; then it is part of the Fable task.

**Files:** `src/presentation/GameCanvas.tsx`

**Problem:** Lines 112 to 167 create three `Skia.Paint` objects, one glare shader and up to three halo shaders inside `createPicture` every frame. Line 182 calls `Skia.Color(dot.color)` per dot per frame, about 12,000 string parses a second at the dot cap.

**Fix:**
- Build the fill paint, ring paint, three halo paints and three pre-parsed colours once, outside the worklet, and capture them. Worklets serializes host objects, see `cloneHostObject` in the same serializable module. If capture proves unreliable, keep them in a module-level cache created lazily on the UI thread.
- The glare gradient is already in unit space. Build it once centred at the origin and shift the canvas instead of the shader: translate to the dot centre plus `(gx, gy) * radius`, scale by the radius, draw the circle at `(-gx, -gy)` with radius 1.
- Look up the fill colour by index from P1's table instead of parsing a string.

**Done when:** the only per-frame Skia calls in the worklet are `save`, `translate`, `scale`, `drawCircle`, `restore` and `setColor` with a pre-parsed colour.

### P3. Cut per-tick allocations in the engine

**Model:** Opus 5.5. Domain change with behaviour-preserving intent; needs tests that prove `prevRadius` and removal semantics are unchanged.

**Files:** `src/domain/engine/GameEngine.ts`, `src/domain/entities/Dot.ts`

**Problem:**
- Line 149 rebuilds a `Map` of previous radii for every dot each tick. Only point dots change size.
- `removeFlaggedDots` at lines 148 and 191 allocates a new array twice per tick even when nothing was flagged.
- `getFrame()` at line 197 does a filter then a map, two arrays, and runs three `instanceof` checks per dot.

**Fix:**
- Store `prevSize` on `Dot`, written once at the start of `tick()` for each dot. Drop the `Map`.
- Only filter in `removeFlaggedDots` when at least one dot is flagged. A cheap flag set during `checkCollisions` and `PointDot.update` is enough.
- In `getFrame()`, compute `kind` once per dot and build the array in a single pass.

**Done when:** `GameEngine.test.ts` still passes, a new test asserts `prevRadius` for a pulsing point dot equals its radius at the previous tick, and a new test asserts the dot array identity is unchanged across a tick with no removals.

### P4. Share one device-motion subscription between the interface and the game

**Model:** Opus 5.5. Touches the `SensorPort` contract, the adapter, `App.tsx`, `GameScreen` and `TiltProvider`. Needs judgement about start/stop ownership when two consumers share one source.

**Files:** `src/domain/types.ts`, `src/infrastructure/DeviceMotionAdapter.ts`, `App.tsx`, `src/presentation/GameScreen.tsx`, `src/presentation/tilt/TiltProvider.tsx`

**Problem:** `App.tsx:9` and `GameScreen.tsx:43` each own a `DeviceMotionAdapter`, so every sensor event runs the trig in `tiltFromRotation` twice and dispatches two JS callbacks. `onSample` at `DeviceMotionAdapter.ts:50` holds a single callback, last one wins, which is what forces the duplication. Each sample also calls `Date.now()` for a `timestampMs` nobody reads, see D1.

**Fix:**
- Let `onSample` return an unsubscribe and support several listeners.
- Create one adapter in `App.tsx`, pass it to `TiltProvider` and to `GameScreen`.
- Decide who starts and stops it. The interface needs tilt on every screen, so the provider owns start/stop; the game only subscribes and unsubscribes. Remove the game's own `sensor.start()` / `sensor.stop()` calls in `GameScreen` unless the adapter reference-counts them.

**Done when:** one native listener exists at runtime, the title screen still tilts, the game still steers, and a test covers multiple listeners plus unsubscribe on the adapter or on a small fan-out helper.

### P5. Stop re-recording the ambient background on every tilt change

**Model:** Opus 5.5. Skia picture structure plus a small Reanimated smoothing change.

**Files:** `src/presentation/components/AmbientBackground.tsx`, `src/presentation/tilt/TiltProvider.tsx`

**Problem:** Lines 62 to 87 rebuild two paints and two radial gradients with nine stops each, every frame the light moves. The light gradient only translates with tilt; the wash only changes with the accent. Separately, the exponential smoothing in `TiltProvider.tsx:56-62` never reaches its target, so every tilt-driven derived value keeps re-running even with the phone at rest.

**Fix:**
- Split into two pictures: a wash picture that depends only on `accent`, and a light picture that depends on `lightX` / `lightY`. Build the light gradient once and translate the canvas.
- In `TiltProvider`, snap `x` and `y` to the raw target once the remaining distance is below a small epsilon, about `1e-4` rad, so the shared values stop changing when the device is still. Keep the smoothing otherwise.

**Done when:** with the device at rest on the pause screen, the ambient picture is not re-recorded, and a unit test for the smoothing step shows it reaches the target exactly within a bounded number of frames.

### P6. Skip identical colours on the title screen play dot

**Model:** Haiku 5.5. Small, precise change.

**Files:** `src/presentation/overlays/KioskOverlay.tsx`

**Problem:** Line 71 recomputes `interpolateColor` every frame and the result feeds a blurred circle in `DotButton`, so the blur re-rasterizes at 60 Hz even during the 88 percent of each cycle where the colour is held.

**Fix:** In the derived value, snap to the exact `TRIO` colour while in a hold segment, and only run `interpolateColor` during the blend. The hold boundaries are already in the input range array.

**Done when:** the derived value returns the same string for the whole hold, and the blend still looks the same.

### P7. Pre-parse confetti colours

**Model:** Haiku 5.5.

**Files:** `src/presentation/effects/Confetti.tsx`

**Problem:** Line 71 parses a colour string per particle per frame, 70 particles at 60 Hz.

**Fix:** Store the parsed `Skia.Color` on each particle in the `useMemo`, and call `paint.setColor` with it.

**Done when:** no `Skia.Color(string)` call remains inside the picture worklet.

---

## Code quality

### Q1. Define default settings once

**Model:** Haiku 5.5.

**Files:** `src/application/GameStore.ts:14`, `src/infrastructure/AsyncStorageRepository.ts:9`, `src/domain/types.ts`

**Fix:** Move `DEFAULT_SETTINGS` next to `GameSettings` in the domain and import it from both places. Keep the export name on `GameStore` if tests import it from there, or update the tests.

### Q2. Test point-dot placement with numbers, not a throwaway entity

**Model:** Haiku 5.5. Note that dot ids will shift because throwaway dots no longer consume the global counter; adjust any test that pins an id.

**Files:** `src/domain/engine/SpawnSystem.ts:195-213`

**Problem:** `createPointDot` constructs a `Dot` only to call `didCollide`, burning a global id on every retry, and recurses without a bound.

**Fix:** Call `circlesOverlap(player.x, player.y, player.size, x, y, size * 2)` directly, and replace the recursion with a loop capped at a small number of attempts that falls back to the last candidate.

**Done when:** `SpawnSystem.test.ts` passes, and a test seeds the random so the first candidate overlaps the player and asserts the next one is used.

### Q3. Inject the store, storage and sensor like the audio

**Model:** Opus 5.5. Mechanical in shape, but it changes component ownership and interacts with P4.

**Files:** `src/presentation/GameScreen.tsx:41-43`, `App.tsx`

**Problem:** `GameScreen` holds module-level singletons for the store, storage and sensor while `audio` arrives through props. The screen cannot be tested with fakes and cannot be mounted twice.

**Fix:** Create all four in `App.tsx` and pass them as props, or bundle them in one `services` prop. Do this after P4 so the sensor wiring is only changed once.

### Q4. Drop the redundant cast

**Model:** Haiku 5.5.

**Files:** `src/domain/engine/GameEngine.ts:270`

**Fix:** `instanceof PointDot` already narrows; call `dot.forceRemove()` directly.

### Q5. Pass a vector to the level-gate bubble

**Model:** Haiku 5.5.

**Files:** `src/presentation/components/LevelGate.tsx:67-78`

**Fix:** Return `vec(...)` from `bubblePos`, pass `c={bubblePos}` to both bubble circles, and delete `bubbleX` and `bubbleY`. `SettleBowl.tsx` already does this.

### Q6. Clear burst timers on unmount

**Model:** Haiku 5.5.

**Files:** `src/presentation/hooks/useStageEffects.ts:49-53`

**Fix:** Track pending timeouts in a ref set and clear them in an unmount effect.

### Q7. Document the per-tick random re-roll in point-dot spawning

**Model:** Haiku 5.5.

**Files:** `src/domain/engine/SpawnSystem.ts:96-98`

**Problem:** `trySpawnPointDot` draws a fresh random wait every tick while a point dot is alive, so the effective respawn delay is not uniform on the stated range. This matches `spawnBigPoint` in the legacy `GameManager.java` and must stay. It reads like a bug.

**Fix:** Add a short comment saying the per-tick re-roll is legacy behaviour and intentional. No code change.

### Q8. Validate persisted settings before trusting them

**Model:** Haiku 5.5 with the spec below.

**Files:** `src/infrastructure/AsyncStorageRepository.ts:41-52`

**Problem:** The `JSON.parse` result is cast to `Partial<GameSettings>` unchecked. A corrupt `tiltZero` reaches the engine.

**Fix:** Add a small `sanitizeSettings(unknown): GameSettings` that keeps only booleans for the two switches, a finite number for sensitivity if the field survives D1, and `{ x: number, y: number }` with finite values or `null` for each tilt zero. Fall back to defaults per field. Keep the existing `musicEnabled` migration.

**Done when:** `Persistence.test.ts` covers a string `tiltZero`, a `NaN` coordinate and an unknown extra key.

### Q9a. Test the frame clock

**Model:** Opus 5.5. Fixed-step timing with fake timers is easy to get subtly wrong.

**Files:** `src/infrastructure/FrameClock.ts`, new `src/__tests__/infrastructure/FrameClock.test.ts`

**Cover:** one tick per 33.3 ms of elapsed time, the five-update cap and accumulator clamp on a long stall, `alpha` in `[0, 1)` after ticks, `dtMs` clamp, and that `stop()` cancels the pending frame. Stub `performance.now` and `requestAnimationFrame`.

### Q9b. Test the untested use cases and the store

**Model:** Haiku 5.5.

**Files:** new tests for `BindTiltZero`, `CalibrateTilt`, `GameOver`, `LoadHighScore` and `GameStore`

**Cover:** `bindTiltZero` applies on subscribe and only when a zero changes; `calibrateTilt` writes the up or down pose by `facingDown` and keeps the other; `handleGameOver` saves only when the score beats storage and always sets the store; `loadHighScore` sets the store; `updateSettings` on the store merges a patch.

---

## Dead code and leftovers

### D1. Remove unused symbols

**Model:** Haiku 5.5. Pure deletion. Tests that only exist to cover the removed symbols go too; keep `resetDotIdCounter`, it is a test helper.

Verified at `d0c511c` to be referenced only by their own definition or by tests:

| Symbol | Location |
|---|---|
| `setPhase` | `src/application/GameStore.ts` |
| `onPhaseChange` and the `listeners` array | `src/domain/engine/StateMachine.ts`. `reset()` skips listeners anyway. |
| `StateTransition` type | `src/domain/engine/StateMachine.ts` |
| `gyroSensitivity` | `src/domain/types.ts`, both default objects. Persisted but never read. Loading still works because unknown keys are spread and then ignored, but Q8 should drop them explicitly. |
| `timestampMs` | `src/domain/types.ts`, `src/infrastructure/DeviceMotionAdapter.ts`. Also removes a `Date.now()` per sample. |
| `TARGET_FPS`, `TIME_BETWEEN_UPDATES_NS` | `src/domain/constants.ts` |
| `PLAYER_DOT_SIZE_INCREMENT_SMALL`, `PLAYER_DOT_SIZE_INCREMENT_POINT` | `src/domain/constants.ts`. The legacy player never grows either; `setSize` is only called at reset. |
| `getPointDot` | `src/domain/engine/SpawnSystem.ts` |
| `withAlpha`, `PINK`, `BLUE`, `GREEN`, `FAINT` | `src/presentation/theme/theme.ts` |

### D2. Remove stale tooling and docs

**Model:** Haiku 5.5.

- `jest.config.js` references `ts-jest`, which is not installed. The project runs Vitest. Delete it.
- `biome.json` enables the `playwright` domain. There is no Playwright. Remove the entry.
- `docs/plan-refactor-ract-native.md` is a stale plan with a misspelled name. Confirm with the owner before deleting.

---

## Suggested batching

| Batch | Tasks | Model | Why together |
|---|---|---|---|
| 1 | P1 + P2 | Fable 5.1 | Same two files, same per-frame path. This is where the measurable win is. |
| 2 | P3 | Opus 5.5 | Engine-only, independent of batch 1. |
| 3 | P4 then Q3 | Opus 5.5 | Both rewire how `GameScreen` gets its sensor; doing them in sequence touches `App.tsx` once. |
| 4 | P5 | Opus 5.5 | Independent. |
| 5 | D1, D2, Q1, Q2, Q4, Q5, Q6, Q7, P6, P7 | Haiku 5.5 | One cleanup PR of small, precisely specified edits. |
| 6 | Q8, Q9a, Q9b | Opus 5.5 for Q9a, Haiku 5.5 for the rest | Test and validation work, independent of the rest. |

Each batch should end with a green `pnpm preflight` and a commit per logical change.
