# Android performance review

Reviewed on 2026-10-15 at `d190cce`, plus the uncommitted display-corners work (`StageFrame`, `FrameCorners`). The findings come from reading this repo and the installed Skia, Reanimated and worklets sources, plus frame counters read from the connected OnePlus 9. No release build has been measured yet, so nothing here is a measured improvement.

## Summary

The game never re-renders React per frame. Dots cross to the UI thread as one typed array, and paints are built once. These are the usual suspects, and they are already handled. What makes Android slower sits beneath that:

1. **Every Skia `<Canvas>` on Android is a transparent TextureView, rendered on the main thread.** Two full-screen ones redraw every frame during play: the room (`AmbientBackground`) and the dots (`GameCanvas`). Each redraw does a GL flush and buffer swap on the Android main thread. The window's RenderThread then composites the texture again. iOS draws into Metal layers that the system composites, so it pays none of this.
2. **The Android main thread is the bottleneck in the frames observed so far.** 1,797 of 1,807 janky frames were "slow UI thread", against 11 "slow issue draw commands". HWUI GPU time stays under 4 ms at p99. Median main-thread worklet work was about 9 ms per frame at 60 Hz. This was a development build, so the size of the numbers is not trustworthy, but where the time goes is.
3. **The phone runs a development build.** The installed app is the expo-dev-client build, with JavaScript from Metro in `__DEV__` mode on both runtimes. Compare release builds on both platforms before drawing any conclusion about iOS vs Android.

The highest-value change is one opaque canvas that draws the room and the dots together. On Android it becomes a SurfaceView. The next two are Reanimated's synchronous UI-props flag and drawing the catch bursts inside that canvas instead of mounting a new Skia view per catch.

## 1. How a frame is made today

### Stack

| | Version / setting | Where |
|---|---|---|
| React Native | 0.86.3, New Architecture (Fabric), Hermes | `package.json`, `android/gradle.properties` |
| Skia | `@shopify/react-native-skia` 2.6.2, Ganesh on OpenGL ES on Android (no Dawn/Graphite libraries shipped), Metal on iOS | `node_modules/@shopify/react-native-skia/libs` |
| Reanimated | 4.5.1 with worklets 0.10.1, default static flags (`ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: false`) | `react-native-reanimated/src/featureFlags/staticFlags.json` |
| React | 19.2 with the React Compiler | `app.json` `experiments.reactCompiler` |
| Display | iOS: `CADisableMinimumFrameDurationOnPhone` allows 120 Hz. Android: system default (the OnePlus 9 peaks at 120 Hz) | `app.json` |

### Per-frame pipeline during play

1. **JS thread, `requestAnimationFrame`.** `FrameClock` (`src/infrastructure/FrameClock.ts`) runs fixed 30 Hz ticks (`GameEngine.tick`), then `onFrame` once per display frame.
2. **JS thread, per display frame.** `GameSession.run` (`src/application/GameSession.ts:94`) moves the player and checks collisions with `engine.advancePlayer`. It publishes to the zustand store only when the score or phase changed. `draw` then builds the scene with `buildScene` (`src/application/renderScene.ts`) into a reused `Float32Array`, 20 floats per dot (`src/application/sceneRecord.ts`).
3. **JS to UI.** `scene.set(next)` (`src/presentation/hooks/useSessionScene.ts:12`) copies the typed array to the UI runtime asynchronously. Nothing locks the JS and UI frames together: the scene is sampled at JS `rAF` time and drawn on the next UI frame.
4. **UI runtime, the Android main thread.** Reanimated mappers run in the Choreographer animation phase:
   - `TiltProvider` smooths the tilt (`src/presentation/tilt/TiltProvider.tsx:61`).
   - `GameCanvas` re-records the whole scene as an `SkPicture` with `drawScene` (`src/presentation/GameCanvas.tsx:84`, `src/presentation/sceneDrawer.ts`). These are immediate-mode JSI calls per dot.
   - `AmbientBackground` re-records the light picture whenever the tilt moves, which is every frame of play (`src/presentation/components/AmbientBackground.tsx:82`).
   - Skia's own container mapper re-records each canvas's tree and hands over the picture (`@shopify/react-native-skia/src/sksg/Container.native.ts`).
   - Animated styles (bursts, HUD bump, flood, frost dim) are committed through Fabric's shadow tree. With the flag above off, Android has no synchronous fast path.
5. **Main thread, Skia render (Android).** `RNSkView::requestRedraw` posts `renderImmediate` to the main thread (`cpp/rnskia/RNSkView.h:151`). For a TextureView, that calls `SurfaceTexture.updateTexImage` over JNI, plays the picture, then `flushAndSubmit()` and `eglSwapBuffers` (`android/cpp/rnskia-android/RNSkOpenGLCanvasProvider.cpp`, `OpenGLWindowContext.cpp:54`). This happens once per canvas that changed.
6. **RenderThread (HWUI).** A new TextureView frame invalidates the view, so HWUI redraws the window. That composites both full-screen Skia textures with alpha blending (`SkiaTextureView` calls `setOpaque(false)`), plus the React Native views.
7. **SurfaceFlinger** composites the app window.

On iOS, steps 1 to 4 are the same, but on a faster CPU. Step 5 is Metal into a `CAMetalLayer`, and step 6 does not exist.

### What draws during play

| Canvas | Size | Redraws |
|---|---|---|
| `AmbientBackground`: two full-screen dithered radial gradients, 9 to 10 stops each | full stage | every frame the tilt moves (all of play) |
| `GameCanvas`: the scene | full stage | every frame |
| HUD score (`DotMatrixText`) | small | on score change |
| Pause button (`IconDot` / `DotButton`) | small | rarely, but its glare and drop mappers run every tilt frame (`DotButton.tsx:103-128`) |
| `FrameCorners` (uncommitted) | 4 small | static |
| One per score pop (`Bursts.tsx`, `Pop` → `DotMatrixText`) | small | mounted on each catch, unmounted after ~950 ms |

Each free small dot costs about 12 Skia JSI calls and 3 GPU draws per frame: a halo, a body and a glare. The two gradient draws each have their own matrix, so Ganesh cannot batch them. The player body and wall drips are runtime shaders over small rects. Small dots stay until caught (`Dot.ts:92`; only point dots fade out, `PointDot.ts:72`). By 3:00 about 90 have spawned (15 a minute, plus 10 a minute every minute), so a late run draws tens of dots. The cap is `DOT_LIMIT = 200`.

### Already done well

- No React render per frame. Positions travel as one `Float32Array` (`sceneRecord.ts`).
- Paints, shaders and colours are built once and captured. Unit-space gradients are placed with canvas transforms (`sceneDrawer.ts:30-94`).
- 30 Hz fixed-step simulation with interpolation and extrapolation, and the player moved per frame.
- The frost blur layer exists only while frosted (`GameCanvas.tsx:96`).
- The room's light re-records only on tilt change and its wash only on accent change. The tilt snaps when still, so a resting phone records nothing.
- Collision checks and the merge cap allocate nothing in normal play.
- `debugOptimized` development variant and `HIGH_SAMPLING_RATE_SENSORS` (README).
- Not problems: the `colorSpace="p3"` default doesn't touch Android window surfaces, which are RGBA8888 without a colour space (`OpenGLWindowContext.cpp:45`). Skia pictures report their size to Hermes (`JsiSkPicture.h:99`), so the per-frame pictures don't hide memory from the GC.

## 2. Evidence so far

**Device:** OnePlus 9 (LE2123), Snapdragon 888 / Adreno 660, Android 12, 1080×2412 at 480 dpi. `peak_refresh_rate` is 120, and the display drops to 60 Hz when idle.

**Installed build:** `expo-dev-client`, `DEBUGGABLE`, loading JS from Metro (port 8081 was listening). Every number below comes from that development build.

**`dumpsys gfxinfo` for the session (all screens, since the app started):**

| Metric | Value |
|---|---|
| Frames | 14,706 |
| Janky | 12.3 % |
| Frame time p50 / p90 / p95 / p99 | 13 / 32 / 42 / 69 ms |
| Slow UI thread | 1,797 (of 1,807 janky) |
| Slow issue draw commands | 11 |
| HWUI GPU p50 / p99 | 2 / 4 ms |

**Last 120 frames (`framestats`, screen unknown, all at a 16.7 ms interval):**

| Metric | Value |
|---|---|
| Missed vsync | 11 frames |
| Choreographer animation phase (Reanimated worklets plus Fabric mounting) | p50 9.1 ms, p90 17.9 ms, max 45.7 ms |
| Vsync to frame start (main thread busy with posted work, such as Skia renders) | p90 6.3 ms, max 35 ms |

**What this does and doesn't show.** Frames are lost on the Android main thread, not on HWUI's GPU side. The Skia GL renders run outside the measured frame, as posted tasks, so they show only as late frame starts. These counters cannot split the time between `drawScene` recording, Skia's flush and swap, and Fabric commits; that needs a Perfetto trace of a release build. During this probe the activity stayed resumed and kept drawing at about 60 fps behind the lock screen, so the session totals may include locked time. That is a battery observation too.

**Not verified yet:** release-build frame times on either platform, the display rate during tilt-only play (no touches), dot counts in a long run, GPU time for Skia's own GL work, thermal behaviour over a multi-minute run, and any before/after comparison.

## 3. Findings

**Confirmed** = measured. **Likely** = follows from the code or library source. **Hypothesis** = needs a trace.

| P | Finding | Evidence | Status | Impact | Effort | Proposed fix |
|---|---|---|---|---|---|---|
| P0 | Android has been judged on a development build | `dumpsys package`: DEBUGGABLE, dev launcher activity | Confirmed | High, size unknown | S | Baseline release builds on both platforms first (R1) |
| P0 | Main thread saturated | gfxinfo: 1,797 of 1,807 janky frames are slow UI thread; animation phase p50 9.1 ms at 60 Hz | Confirmed, dev build | High | — | R2 to R4 below |
| P0 | Two full-screen transparent TextureViews redraw every frame, each with a main-thread GL flush and swap, then HWUI recomposites the window | `SkiaBaseView.java:21` (TextureView default), `:35` (`opaque` → SurfaceView); `RNSkView.h:151`; `OpenGLWindowContext.cpp:54` | Likely | High, Android only | M | One opaque canvas for room and scene (R2) |
| P1 | Every animated style on Android commits through the shadow tree | `staticFlags.json`: `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: false`; `ReanimatedModuleProxy.cpp:68` | Likely | Medium, worst during combos | S | Turn the flag on (R3) |
| P1 | A new Skia canvas (TextureView plus EGL surface) per catch, plus a full `GameScreen` render to add and remove each burst, on the JS thread that runs the game loop | `Bursts.tsx:35` (`Pop` → `DotMatrixText` `<Canvas>`), `useStageEffects.ts:54` | Likely | Medium to high, hitches exactly during combos | M | Draw bursts in the game canvas (R4) |
| P1 | Burst rings animate `borderWidth`, a layout prop, so every ring frame relays out | `Bursts.tsx:66` | Likely | Low to medium | S | Fixed stroke, or draw rings in Skia (R4) |
| P1 | Display rate: whatever the device runs during play, both threads must finish inside that frame (8.3 ms at 120 Hz) | `peak_refresh_rate` 120; no frame-rate request in the app | Hypothesis: during tilt-only play the OnePlus may already sit at 60 | Medium | S to M | Measure the rate during play; if above 60, try a 60 Hz cap on Android (R5) |
| P1 | Score changes re-render all of `GameScreen`, and `DotMatrixText` relays out and re-creates its picture mapper | `GameScreen.tsx:78` | Likely | Low to medium | S | HUD subscribes to the score itself (R8) |
| P2 | Per-frame drawing grows with the dot count: about 12 JSI calls and 3 draws per small dot, 4 decode passes, host objects allocated per frame (`XYWHRect`, `makeShader` per drip and merge) | `sceneDrawer.ts:141-245`, `mergeShader.ts:92` | Likely, size needs a trace | Grows over a run | M | Two `drawAtlas` calls for free small dots (R6) |
| P2 | Room: two full-screen gradient passes per frame, plus two full-screen texture composites; bandwidth heats the SoC | `AmbientBackground.tsx:82-117` | Hypothesis (thermal) | Medium on sustained play | S, after R2 | One SkSL pass for ink, light and wash (R7) |
| P2 | The scene is built on the JS thread at `rAF` time and drawn at the next UI frame, with nothing locking the two | `useSessionScene.ts:12`, `FrameClock.ts:40` | Hypothesis: judder even when the average fps is fine | Medium | L | Diagnose in a trace, then move interpolation to the UI thread (section 6) |
| P2 | Three async shared-value writes per sensor sample, at display rate | `TiltProvider.tsx:46-50` | Likely, small | Low | S | One shared value for the raw sample (R8) |
| P2 | `DotButton` glare and drop mappers run every tilt frame even for ghost buttons, including a colour-string parse | `DotButton.tsx:103-128` | Likely, small | Low (play), medium (menus) | S | Return early when the variant doesn't use them (R8) |

## 4. Recommendations

### R1. Baseline on release builds first

**Wrong now:** the Android impression comes from the dev client. Worklets and React run development code paths, and Metro-served JS isn't precompiled Hermes bytecode.

**Do:** install the EAS `preview` profile, or a local `pnpm exec expo run:android --variant release --device`, on the OnePlus. Use the matching iOS build. Run the scenarios in section 5 with `scripts/android-perf-trace.sh`.

**Verify:** gfxinfo percentiles, and in Perfetto: main-thread time per frame, JS-thread (`mqt_v_js`) time per frame, the SurfaceFlinger frame timeline, and the display rate during play.

### R2. One opaque canvas for the room and the scene

**Wrong now:** the room and the scene are separate transparent canvases. On Android each is a TextureView. Each Skia frame means one GL flush and swap per canvas on the main thread, then HWUI recomposites the window with both full-screen textures.

**Why Android:** iOS hands Metal layers to Core Animation. Android routes TextureView frames through the app's own RenderThread.

**Change:**
- `GameCanvas` draws, in one picture: the room (the light and wash paints from `AmbientBackground`), then the scene, with the frost blur group only while frosted. The scene is translated by the shake value.
- While the stage fades, draw the room again on top at `1 - stageOpacity`. Over the room, that equals drawing the scene at `stageOpacity` (`bg·(1−o) + o·(scene over bg) = o·scene + (1 − o·αscene)·bg`).
- `<Canvas opaque>`: on Android that is `SkiaSurfaceView`; on iOS an opaque `CAMetalLayer`, which also saves a blend there.
- `GameScreen` drops `<AmbientBackground>`. The fade and shake wrappers keep only `Bursts`.

**Why fade and shake move into the canvas:** a SurfaceView ignores ancestor opacity and clipping, so the canvas must not depend on them. Everything above it (HUD, overlays, flood, frost dim, `FrameCorners`) is a window view drawn over the SurfaceView's hole, so it still sits on top.

**Expected:** half the main-thread flushes and swaps. HWUI no longer redraws the window for every Skia frame; it only redraws when React Native views change. SurfaceFlinger can put the game surface on an overlay plane. Two fewer full-screen passes per frame.

**Risks to check on device:** the settle-bowl fade, the game-over shake, the pause frost, flood transitions, the corner caps, a possible ink flash on mount, and touch pass-through for the dev drag mode.

**Verify:** main-thread time per frame and SurfaceFlinger jank for the game layer, before and after, same scenario. After this change gfxinfo no longer sees Skia frames.

### R3. Reanimated synchronous UI props on Android

**Wrong now:** with `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` off, each frame of each animated style commits through the Fabric shadow tree on the main thread. That covers pops, rings, the HUD bump, the flood, the frost dim and button presses.

**Change:** add this to `package.json`, then rebuild native code:

```json
"reanimated": { "staticFeatureFlags": { "ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS": true } }
```

Gradle reads it in `react-native-reanimated/android/build.gradle.kts:79`. It is not a dependency change. Opacity, transform and colour then skip the commit; layout props still commit.

**Verify:** the animation phase in framestats during a combo and a flood transition. Check that pops, rings, the score bump, the flood and button presses look the same.

### R4. Bursts inside the game canvas

**Wrong now:** each catch calls `setBursts`, which re-renders `GameScreen`. The `Pop` mounts a `DotMatrixText`, which is a new Skia view: a TextureView plus an EGL surface created on the main thread. Rings animate `borderWidth`. About 950 ms later it all unmounts again. This competes with the game loop on the JS thread and with rendering on the main thread, during the busiest moments.

**Change:**
- Catch events still decide the bursts, but bursts go into a shared value: kind, position, colour, start time, and for pops the dot offsets from `layoutDotMatrix`, computed once on the JS thread.
- The game canvas draws them: pops as glow-and-dot circles, rings as stroked circles.
- The opacity, rise and scale curves move into a pure, tested stepper, as `AGENTS.md` asks.

**Expected:** no React render and no native view per catch.

### R5. Display rate experiment (only if the trace shows play above 60 Hz)

**Change:** a small native call in a local Expo module, alongside `modules/display-corners`. It requests a 60 Hz display mode on Android while a run is on, through `WindowManager.LayoutParams.preferredDisplayModeId`, or `Surface.setFrameRate` on API 30+. The simulation is fixed at 30 Hz with interpolation, so gameplay timing doesn't change.

**Trade-off:** a steady 60 against a 120 that drops frames. Decide on measurements per device class; iOS stays as it is.

### R6. Batch free small dots with `drawAtlas`

Only if, after R2 to R4, the trace shows `drawScene` recording or GL submission growing with the dot count.

**Change:**
- Free small dots all share one radius, three colours and one glare offset per frame. When the light changes, render three halo sprites and three body-plus-glare sprites into an offscreen surface at device pixel density.
- Draw every halo in one `drawAtlas` call, then every body in a second, so no halo overlaps a body.
- Keep the current path for drips, launches, point dots, merging and rejected dots.

**Expected:** about 12 JSI calls and 3 draws per dot become about 1 to 2 calls per dot and 2 draws in total.

**Trade-off:** bilinear sprite edges instead of analytic circles. Check the glass look on device.

### R7. One shader pass for the room

Once the room is inside the game canvas (R2), replace the two dithered gradient passes with one SkSL shader. It computes the ink, the smoothstep light pool and the accent wash analytically; the current 9-stop ramps approximate those curves. Add a cheap hash dither so dark gradients don't band. The result is one full-screen pass per frame. Compare screenshots before and after.

### R8. Small, safe clean-ups (do with or after the above)

- `HUD` reads the score from the store itself, so a catch re-renders only the HUD. `GameScreen` still needs the score for `GameOverOverlay`; select it only while that screen shows.
- `DotButton`: `glareCentre` and `dropUniforms` return early for variants that don't draw them. Parse `fill` once per colour change, not per frame.
- `TiltProvider`: one shared value `{x, y, facingDown}` for the raw sample instead of three writes.
- Rings: animate scale and opacity only, with a fixed border; or draw them in Skia with R4.

## 5. Measurement plan

Same phone, same build, same scenario for every A/B. Release builds only. Record 15 s per scenario with `scripts/android-perf-trace.sh <label>`. For thermals, also record one 3-minute run of play.

**Scenarios:**
- Title screen at rest (kiosk, phone flat).
- Title screen while tilting.
- Early play (under 30 s).
- Late play (many dots).
- Pause (frost).

A benchmark start with a fixed number of drifting dots would make "late play" repeatable. The engine already takes an injected `Spawner` (`GameSession` options), so a dev-only bench spawner is cheap to add.

**What to read in Perfetto:**
- The app's main thread: `Choreographer#doFrame`, and the gaps between frames where Skia renders.
- `mqt_v_js`: the game loop and React work.
- `RenderThread`: `DrawFrame` / `queueBuffer`.
- SurfaceFlinger's actual-vs-expected frame timeline per layer.
- CPU and GPU frequency over time, for thermal throttling.

| Experiment | How, in this codebase | Tells you |
|---|---|---|
| Empty Skia canvas | `GameCanvas` picture draws nothing; keep the room | Cost of the room and composition alone |
| Static scene | Halt the session after one frame (`session.halt()`); tilt still moves the light | Recording and render without simulation |
| Simulation off | Keep drawing the last scene; skip `engine.tick` and `advancePlayer` | JS-thread game cost |
| Effects off | No halos and glare; no room gradients | Gradient and fill cost |
| Entity scaling | Bench spawner with 10 / 50 / 100 / 200 dots | Whether cost scales per dot (decides R6) |
| SurfaceView vs TextureView | R2 with and without `opaque` | Composition overhead |
| Display rate | 120 vs a 60 Hz cap (R5) | Headroom per frame |
| Reduced resolution | Developer options → smallest width, or a lower system resolution | Whether fill rate matters at all (low priority: HWUI GPU p99 is 4 ms) |

## 6. Larger options

- **Skia Graphite / Vulkan.** The installed 2.6.2 is Ganesh on GL; Graphite is an opt-in experimental build (API 26+) that needs Dawn binaries. The likely costs here (TextureView composition, main-thread recording and JSI, draw count) would not go away with a different GPU backend. Revisit only if a release trace shows GL submission dominating after R2 and R6. Effort L, not worth it now.
- **Internal resolution scaling.** No evidence of fill-rate limits yet (HWUI GPU p99 4 ms; the OnePlus renders 1080×2412). Skia's views expose no internal-resolution setting: it would need an offscreen pass plus an upscale, or `SurfaceHolder.setFixedSize` inside Skia's Java view. Low priority.
- **Interpolation on the UI thread.** If traces show UI frames with no new scene, or two scenes arriving in one frame, extrapolate on the UI thread from the frame timestamp. Alternatively, run the session in a worklet runtime. The domain is pure TypeScript, but its classes would need workletizing. Effort L, risky; only on evidence.
- **Dedicated render thread.** Not available for this Skia version's views: renders are posted to the main thread (`RNSkView.h:151`). R2 is the practical lever.

## 7. Task list

Rules for every task: those in `AGENTS.md` (no dependency or version changes, Biome, pure domain, tests with behaviour changes, `pnpm preflight`). Fable 5.1 is unavailable for the rest of October 2026, so Fable-grade tasks are marked Opus 5.5.

1. **Release baselines on both platforms (R1).** User runs; no model. Needs the phone and both release builds.
2. **One opaque canvas (R2).** **Model:** Opus 5.5, standing in for Fable: it crosses `GameScreen`, `GameCanvas` and `AmbientBackground`, changes native view semantics, and a mistake breaks layering or fades. Land it after the display-corners work is committed, since it touches the same files.
3. **Reanimated sync UI props (R3).** **Model:** Haiku 5.5: a one-key config change with an exact spec. The device check is the real work.
4. **Bursts in the canvas (R4).** **Model:** Opus 5.5, standing in for Fable: it moves an effect from React into the UI-thread picture and adds a tested animation stepper.
5. **60 Hz experiment (R5).** **Model:** Opus 5.5: native Kotlin in a local Expo module, gated to Android and to runs.
6. **Bench spawner for repeatable late-game scenes.** **Model:** Opus 5.5: needs judgement about the injected `Spawner` and keeping it dev-only.
7. **Atlas batching (R6).** **Model:** Opus 5.5: Skia offscreen surfaces and atlas specifics inside a worklet. Only after the entity-scaling experiment.
8. **Room shader (R7).** **Model:** Opus 5.5: SkSL that must match the current look. Do it after R2.
9. **Small clean-ups (R8).** **Model:** Haiku 5.5: each is a small mechanical edit with a precise spec.
