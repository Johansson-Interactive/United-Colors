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

### Release-build measurements (2026-10-15, OnePlus 9, display at 60 Hz, phone lying still)

Recorded with `scripts/android-perf-trace.sh` and read with Perfetto's trace processor. Main-thread figures are per frame.

| Scenario | Build | `doFrame` avg | Animation phase avg | Window redraw (traversal) | Skia swaps / frame | Janky |
|---|---|---|---|---|---|---|
| Title screen, 15 s | Baseline | 14.8 ms | 13.1 ms | 1.7 ms, every frame | 4.4 | 26 % |
| Title screen, 15 s | R2 (one opaque canvas) | 14.7 ms | 13.1 ms | 1.5 ms | 3.6 | 22 % |
| Early play, 15 s | Baseline | 7.7 ms | 5.8 ms | 1.7 ms, every frame | 1.2 | 2 % |

- **The title screen is the slowest screen, in release too.** Its cost is the menu's own animated canvases (the title, the liquid PLAY button, the bowl), not the room. R2 does not touch those.
- **Skia renders run inside the animation phase.** Each canvas's `eglSwapBuffers` sits under Reanimated's frame callback, so every canvas adds straight to the main thread's frame.
- **R2 removes the per-frame window redraw.** In play, traversal ran in 100 of 471 frames instead of nearly all of them. But each SurfaceView swap took 1.5–1.9 ms against 0.6–0.8 ms for a TextureView. A net gain in play is not shown yet.
- **Play runs could not be compared fairly.** They were driven blind with taps while the phone lay at an angle. Some ended in a game over, and one opened the calibration screen. The same baseline build gave 5.4 ms and 10.2 ms animation phases in back-to-back runs. A repeatable scene (task 6) is needed before any play A/B.
- **New: the main thread runs on the slow cores.** On the Snapdragon 888, CPUs 0–3 are Cortex-A55, 4–6 A78 and 7 X1. In every trace, most of the main thread's time was on CPUs 0–3 at about 1.6 GHz. All cores are allowed (`top-app` cpuset, 0–7), so this is the scheduler's choice. A tilt game sends no touch input, so Android's input boost never fires. iOS runs this work on performance cores. Fixed performance mode (`cmd power set-fixed-performance-mode-enabled`) did not move it. The standard fix is a performance hint session (`PerformanceHintManager`, Android 12+) for the main and JS threads, targeting the frame time. That needs a small native module and is now the most promising lever.

### Performance hint session and garbage collection (2026-10-15, later)

- **Hint sessions do nothing on the OnePlus 9.** `modules/performance-hint` opens a session for the main thread, the JS thread and Hermes's collectors. It reports main-thread CPU time per frame against half the frame interval. But `dumpsys performance_hint` reports `HAL Support: false` with no active sessions, so `createHintSession` returns null on this phone. The module can only help on devices whose power HAL supports hints; that is unverified until it is measured on one (a Pixel 6 or later, for example). The one run where the main thread sat on the big cores after the module landed was noise. The module was removed on 2026-10-15 rather than measured on another phone.
- **What actually stalls the title screen is Hermes's garbage collector.** Inside frames, the main thread sleeps about a third of the time (3.8 s of 12 s). Almost all of those sleeps end when `hades`, the UI runtime's GC thread, wakes it: 255 to 331 waits per 15 s, about 8.3 ms each, 2.1–2.7 s in total. That collector thread runs on the little cores. So the main thread isn't slow so much as waiting for a slow collector, which is why moving it to a big core changed nothing.
- **Disposing per-frame pictures was tried and reverted.** Skia reports each picture's size to Hermes as external memory, so disposing each replaced picture (and the per-frame merge and drip shaders) looked promising. It cut waits from 281 to 255 per 15 s, which is within noise, so it was reverted.
- **Next lever: allocate less on the UI runtime per frame**, starting with the title screen, which allocates the most. Likely sources:
  - `KioskOverlay`'s colour cycle builds a new colour string every frame; `DotButton` then parses it again (`convertToRGBA`).
  - `stepJelly` returns a new object every frame for the liquid PLAY button.
  - `dropUniforms` and `glareCentre` build fresh objects and arrays every frame.
  - The kiosk scene's per-frame decode objects and closures in `drawScene`.

  Measure each with `scripts/android-perf-trace.sh` and the GC-wait query (thread state of the main thread inside `animation`, grouped by waker thread).
- **Play is still unmeasured.** GC waits in play ranged from 2 to 211 per run, depending on what happened in the run. A repeatable play scene (task 6) is still needed.

### Bench run: a repeatable late run (2026-10-15)

A bench build plays a late run by itself, the same way every time (`src/application/bench.ts`).

**What the bench build does differently:**
- It starts the run two seconds after launch.
- Small dots arrive at the rate of a run 20 minutes in, from a fixed seed, and hold at 60 in play.
- Wrong-colour dots pass over the player instead of ending the run (`GameEngine`'s `refusals: false`).
- A scripted tilt path (`ScriptedTiltSensor`) steers the player through the dots and into the walls, and moves the room's light, as real play does.

**Using it:**
- Build: `EXPO_PUBLIC_BENCH=1 pnpm exec expo run:android --variant release --device`. Shipped builds never set the flag.
- Measure: `scripts/android-bench.sh <label>`. It launches the app, lets the screen fill for 35 s, records 15 s, and summarizes with `scripts/perf/frames.sql` and `scripts/perf/gc-waits.sql`.

**Baseline on the OnePlus 9** (release, display at 60 Hz, three runs, at commit `b8a92ac` plus the bench):

| Run | Frames/s | p50 | p95 | p99 | Frames over 16.7 ms | GC waits |
|---|---|---|---|---|---|---|
| A | 58.1 | 12.1 ms | 27.2 ms | 31.2 ms | 32.3 % | 359, 1.9 s |
| B | 56.2 | 12.3 ms | 29.3 ms | 33.6 ms | 32.5 % | 353, 2.1 s |
| C | 55.4 | 12.2 ms | 30.0 ms | 33.9 ms | 33.9 % | 334, 2.1 s |

In a late run, a third of the game's frames are late. The UI runtime's garbage collector accounts for about 2.1 s of main-thread waiting per 15 s (14 %). Next step: cut per-frame allocation on the UI runtime in the game's own pipeline (`drawScene`, the canvas mappers, bursts), measuring every change with this bench.

### Garbage collection on the UI runtime: found and cut (2026-10-15)

**Cause.** Hermes reports showed the UI runtime collecting garbage about once per frame. The collector runs on the little cores, and the main thread waits for it mid-frame. What set the collections off was native memory that Skia's JS objects report to Hermes, not JS allocation:

- Skia reports a fixed **1 MB** for every shader made from JS (`JsiSkShader`) and for every picture recorder (`JsiSkPictureRecorder`), whatever they really hold.
- `createPicture` makes a new recorder every call.
- A full-screen gradient picture reports hundreds of KB.

Per frame, the game made a new recorder for the scene, one for the room picture, and a new shader for the liquid player, so it reported several MB of new native memory to Hermes each frame.

**Fixes, each measured with the bench:**

| Change | Frames over 16.7 ms | GC waits / 15 s | GCs / 300 frames |
|---|---|---|---|
| Baseline | 32–34 % | 2.1 s | ~300 |
| `drawScene` indexes the record directly; no worklet call per dot (each allocated 24–90 B; 88 KB/frame → 7 KB) | 33 % (no change) | 2.1 s | ~300 |
| Room drawn as Skia nodes (`Fill` + `RadialGradient`), not a picture recorded per frame | 18 % | 1.0 s | ~185 |
| Scene recorded into one recorder kept for the canvas's life (`recordPicture.ts`) | 6.6 % | below the binder waits | ~90 |
| Liquid player drawn as a `<Rect>` + `<Shader>` node between two scene layers (`liquidBody`), not a JS shader per frame | 4.0–8.4 % | 46 ms | 6–21 |

**Not yet done:**
- `DotMatrixText` and `Confetti` still use `createPicture`. That's fine during play, but the title text's wave re-records every frame on the title screen.
- iOS has not been checked on a device since these changes. They are platform-neutral, but the room, the liquid body and the layering should get a visual check there.

### Wall drips as shader nodes (2026-10-15)

**Cause.** Each wall drip (forming, or tearing off after launch) made a JS shader every frame, so each one reported 1 MB to Hermes per frame. A real late run nearly always has one or two drips on the walls. The steady bench holds at 60 dots, so it starts a drip only after a catch and has none in about 92 % of its traced frames.

**Bench run with drips.** `EXPO_PUBLIC_BENCH=drips` keeps the dots coming, at the rate of a run 10 minutes in and with no cap below the game's limit, so one or two drips are on the walls in every traced frame. It reaches about 78 dots while traced, against the steady run's 60, so compare it only with itself.

**Fix.** The canvas draws the first four drips as fixed `<Rect>` + `<Shader>` nodes (`wallDropSlots` in `wallDropShader.ts`, `WallDrop` in `GameCanvas.tsx`). Any drips past four still get a shader made per frame. The layer order is: the scene below the drips (halos and free dots), the drip slots, a picture with the drips' glare, the liquid body, then the layer above.

**Measured on the OnePlus 9** (drips bench, release, display at 60 Hz). "Before" is the same build with no slots (`WALL_DROP_SLOTS = 0`):

| Run | Frames over 16.7 ms | p95 | p99 | GCs / 300 frames | GC waits / 15 s |
|---|---|---|---|---|---|
| Before A | 13.9 % | 18.7 ms | 26.8 ms | 92–94 | 8, 82 ms |
| Before B | 11.7 % | 18.1 ms | 27.9 ms | 91–96 | 14, 138 ms |
| After A | 11.6 % | 17.7 ms | 23.6 ms | 6–11 | 9, 76 ms |
| After B | 13.3 % | 17.7 ms | 27.5 ms | 6–10 | 8, 69 ms |

- **Collections:** they fell by about 90 %, to below the steady bench's 12–21.
- **Frames over budget:** these didn't move. Most of those ~94 collections didn't stall the main thread, and the GC waits were already small. Fixing the drips mainly removes a risk; it doesn't make frames faster here.
- **Where the time goes:** what remains at this load is mostly not garbage collection. The main thread spends about 1 s per 15 s waiting on binder calls to `surfaceflinger` (about 900 waits of about 1.1 ms each). That is the SurfaceView handing each finished frame to the compositor (`BLASTBufferQueue`, inside `eglSwapBuffers`): the normal cost of presenting from the main thread, about 1.6 ms a frame, and not a separate problem.

### CPU profile of the main thread (2026-10-15)

Taken with `simpleperf` on the drips bench, after the drip slots. It sampled the main thread at 4 kHz for 10 s, about 595 frames. The build had `<profileable android:shell="true"/>` added to the generated manifest. The native libraries were symbolized from `android/app/build/intermediates/merged_native_libs`.

```
adb shell simpleperf record --app com.johanssoninteractive.tiltling -t <main tid> -e cpu-clock -f 4000 --call-graph fp --duration 10 -o /data/local/tmp/perf.data
```

The main thread was busy 74 % of the time, about 12.4 ms of CPU per frame:

| Where | Share of main thread | Per frame |
|---|---|---|
| **Skia drawing on the GPU** (`RNSkPictureRenderer::performDraw`) | 27 % | 4.6 ms |
| – replaying the pictures into Ganesh, almost all `drawCircle` (each halo and glare gradient is rebuilt as a fragment processor per draw) | 12 % | 2.0 ms |
| – flushing the ops to GL | 12 % | 2.1 ms |
| – `eglSwapBuffers` | 3 % | 0.5 ms |
| **Worklets on the UI runtime** (Hermes, every mapper and recording) | 28 % | 4.7 ms |
| – Skia calls through JSI (host functions, property lookups, and a mutex locked on every call) | 13 % | 2.2 ms |
| – declarative Skia nodes taking new values (`JsiRecorder::applyUpdates`, uniform conversion) | 3 % | 0.5 ms |
| – the JS itself (`drawScene`'s loops, the uniform packing, the mappers) | 12 % | 2 ms |
| **Reanimated committing view props** (`performOperations` → `ShadowTree::commit`) | 6 % | 1.0 ms |
| **`Process.getProcessGroup`**, called by Android itself every frame, not by any code in the APK (likely OnePlus's frame-quality monitor) | 6 % | 1.0 ms |

**What follows from this:**
- **Something commits view props every frame.** Reanimated's commit costs about 1.0 ms. Fabric's mount and the window redraw after it cost about another 1.5 ms (`mountViews` 0.66 ms and `traversal` 0.86 ms per frame in the Perfetto traces). It happens in about 870 of 890 frames, with no gap over about 50 ms. It isn't `DotButton`, whose tilt-driven values go to Skia, not to view props. Finding it is the cheapest win, at up to about 2.5 ms a frame. (It turned out to be the catch effects after all; see the next section.)
- **Drawing the free dots costs about 4 ms on both sides of the JSI bridge.** About 12 Skia calls per dot cost about 2.2 ms through JSI. Skia then spends about 1.6 ms turning those circles into GPU ops. Batching them with `drawAtlas` (R6) would hit both. It is now backed by measurement, not just a guess.
- **`getProcessGroup` is out of our hands.** It comes from the phone's own system code.

### View props committed every frame: the score bump and the pops (2026-10-15)

**Cause.** A temporary probe in Reanimated's `updateProps` (drips bench) named the views:
- **The HUD score bump** (`transform: scale`) updated in nearly every frame. Reanimated's spring only stops when its energy falls to 6e‑9 of its starting energy. With the bump's damping 9 and stiffness 260, that is about 2.1 s per catch, though it looks still after about 0.4 s. A catch every second or two kept it running all the time.
- **The burst pops** (`opacity`, `transform`): one per catch, each animated for its 950 ms.

The earlier conclusion that the catch effects were ruled out was wrong: catches are frequent enough in a late run that their animations overlap.

**Fixes:**
- **The bump is a finite curve** (`effects/scoreBump.ts`): the same swell to 1.22 and the same damped wobble, driven by a 650 ms timing and tapered to land exactly on rest. It now ends when it looks done.
- **Reanimated's synchronous UI props on Android (R3):** `package.json` → `reanimated.staticFeatureFlags.ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: true`. Opacity and transform now go straight to the native view, with no shadow-tree commit and no Fabric mount. Layout props such as the rings' `borderWidth` still commit.

**Measured on the OnePlus 9** (drips bench, release, 60 Hz, per 15 s trace of about 885 frames):

| Build | Frames with a mount | `mountViews` | `traversal` frames / time | Frames over 16.7 ms | p95 | p99 |
|---|---|---|---|---|---|---|
| Before (drip slots, A / B) | 872 / 869 | 508 / 495 ms | 875 / 869, 753 / 727 ms | 11.6 / 13.3 % | 17.7 / 17.7 ms | 23.6 / 27.5 ms |
| Bump curve (A / B) | 304 / 386 | 212 / 275 ms | 310 / 387, 314 / 378 ms | 9.8 / 10.9 % | 17.6 / 18.2 ms | 24.3 / 24.5 ms |
| Bump curve + sync props (A / B) | 22 / 20 | 42 / 42 ms | 384 / 374, 357 / 338 ms | 9.6 / 11.5 % | 17.7 / 18.1 ms | 24.1 / 22.3 ms |

- **Mounts:** from 98 % of frames to 2 %.
- **Window redraws (`traversal`):** halved by the bump curve. The rest come from the pops and the bump really animating, which sync props still invalidate. Drawing the bursts in the game canvas (R4) would remove them.
- **Main-thread time saved:** about 1 ms a frame in mounts and redraws, plus Reanimated's own commits, which were about 1 ms a frame in the CPU profile.
- **Frames over budget:** about 2 points better with the bump curve. Sync props held them within the run-to-run spread. Collections stayed at 4–10 per 300 frames.

### Free small dots drawn with `drawAtlas` (R6, 2026-10-15)

**Change.**
- **A sprite sheet drawn once** (`dotSprites.ts`, `SPRITE_SHEET` in `sceneDrawer.ts`): a white halo, a white body disc and 48 glare cells, each with the glare at a different distance from the centre. It is a raster image made at load.
- **Three `drawAtlas` calls** in the `below` layer replace about 12 Skia calls per dot: every halo, then the plain small dots' bodies, then their glares. Halos and bodies are tinted with `BlendMode.Modulate`.
- **The glare follows the light by rotation:** the light is the same for every dot in a frame, so each glare is the cell at its distance from the centre, turned to face the light. The sheet never has to be redrawn as the phone tilts.
- **No host objects per sprite:** Skia's `drawAtlas` reads plain JS objects shaped as rects and RSXforms, and colours by index. The packing reuses its objects and arrays from frame to frame (a set of arrays per sprite count, since `drawAtlas` takes whole arrays).
- **Unchanged:** point dots, stretched dots, refused dots, wall drops and the liquid body keep their own paths, drawn over the plain dots.
- **A quirk:** React Native Skia 2.6.2 only reads `drawAtlas`'s blend mode when a sixth argument is passed, so the glare batch passes `undefined` colours explicitly.

**Measured on the OnePlus 9** (drips bench, release, 60 Hz; with the bump curve and sync props from the section above):

| Run | Frames over 16.7 ms | p50 | p95 | p99 | UI runtime B/frame | GCs / 300 frames | GC waits / 15 s |
|---|---|---|---|---|---|---|---|
| Before (sync A / B) | 9.6 / 11.5 % | 13.2 / 15.1 ms | 17.7 / 18.1 ms | 24.1 / 22.3 ms | 32–41 K | 5–10 | 0–8, 0–75 ms |
| Atlas A | 3.7 % | 11.9 ms | 16.2 ms | 23.0 ms | 61–72 K | 6–13 | 4, 27 ms |
| Atlas B | 3.4 % | 12.2 ms | 16.3 ms | 21.9 ms | 61–73 K | 6–12 | 11, 82 ms |

- **Frames over budget:** about a third of what they were. p50 and p95 each dropped about 1.5 ms.
- **Allocation:** the UI runtime allocates about 30 KB a frame more. That is most likely Skia's C++ reading each sprite's fields by name from plain objects, which makes property names in Hermes. Collections rose only slightly and their waits stayed small. Mutable `SkRSXform` host objects (`set()`) would avoid it, at the cost of a JSI call per sprite.
- **Visual check:** edge quality, the glare following the tilt, and halo colour still need confirming on the device.

### Title screen: recorders kept, colour parsed once (2026-10-15)

**Cause.** On the title, three things allocated or parsed every frame:
- **`DotMatrixText`** (the TILTLING title, with its wave and parallax) recorded with `createPicture`. That made a new recorder every frame, and Skia reports each one to Hermes as 1 MB.
- **The liquid PLAY dot** (`DotButton`) rebuilt its shader uniforms every frame for the ripple, and re-parsed its colour string each time with `convertToRGBA`.
- **Every `DotButton`, ghost rings included,** re-ran its glare mapper on every tilt frame.

**Fixes:**
- **`DotMatrixText`:** a text with a wave or parallax records into one recorder kept for its life (`recordPicture`). Still texts record once, as before, so labels, the score and the catch pops don't each hold a recorder.
- **`DotButton`:** the liquid dot parses its colour only when the colour changes. A ghost button reads a still value in place of the tilt.
- **`Confetti`** (new best) keeps one recorder and one paint for its life, instead of making both every frame.

**Measured on the OnePlus 9** (title at rest, release, not a bench build, 15 s):

| Run | HWUI janky frames | HWUI p95 / p99 | Main-thread frames over 16.7 ms | Main p95 / p99 | GC waits (`hades`) |
|---|---|---|---|---|---|
| Before A | 5.98 % | 29 / 36 ms | 12.3 % | 24.4 / 34.1 ms | 97, 742 ms |
| Before B | 5.26 % | 24 / 40 ms | 9.0 % | 19.4 / 38.1 ms | 54, 652 ms |
| After A | 0.33 % | 21 / 22 ms | 4.6 % | 16.4 / 19.4 ms | not in the top three |
| After B | 0.57 % | 20 / 23 ms | 5.0 % | 16.6 / 20.2 ms | not in the top three |

The garbage-collection stalls on the title are gone. The frames still over budget are mostly the title's TextureViews: the title text, the PLAY dot and the icons each draw their own canvas every frame.

**A trap when measuring.** `EXPO_PUBLIC_BENCH` is inlined into `App.tsx` when Metro transforms it, and Metro caches that transform. If only the variable changes, even with Gradle's generated assets deleted, the bundle keeps the old value. The first title traces were in fact the drips bench. When switching between a bench build and a normal one, also delete `$TMPDIR/metro-cache` and `node_modules/.cache`.

### Bursts drawn in the game canvas (R4, 2026-10-15)

**Cause.** Each catch rendered `GameScreen` twice (`setBursts` to add the burst, then to remove it), mounted a new `DotMatrixText` (a TextureView plus an EGL surface) for the pop, and animated the ring's `borderWidth`, a layout prop that commits every frame. The pops' opacity and transform skip the commit with sync props, but still invalidate the window, so HWUI redraws it (`traversal`, about 380 per 15 s on the drips bench).

**Change:**
- **A pure stepper** (`effects/burstFrames.ts`): the pop's and ring's curves, written out from the old views' styles and Reanimated's out-cubic and out-quad easings; a pop's dots as offsets from the text's centre, laid out once per catch, so they land where the view's padded `DotMatrixText` put them; the list (at most 8, oldest dropped first, each dropped when its 900 ms are up); and the per-frame packing into sprites and rings, which reuses its objects. Tests check the curves against Reanimated's own easings and the dots against a model of the old view's layout and transform.
- **No React state:** `useStageEffects` appends each burst to a shared value on the UI thread. A frame callback stamps it with the frame time on its first frame, ages the list and drops expired bursts. It runs only while a burst is alive, and stops itself through the JS thread, unless a newer burst arrived in the meantime.
- **Drawn in `GameCanvas`:** one picture, recorded into a recorder kept for the canvas's life, inside the shake group, after the frost-blur group and before the fade cover. Pop dots are two `drawAtlas` calls, every glow and then every dot, from two new cells of the sprite sheet: a dot, and its glow (alpha 0.35 to 0 at 2.6 times the radius). A pop's opacity is its tint's alpha, its scale the RSXform's. Rings are stroked circles with one paint.
- **Removed:** `Bursts.tsx` and `Stage.tsx` with its fade and shake views. `GameScreen` renders `GameCanvas` directly.
- **Small differences:** a fading pop's dots are now each drawn at the pop's opacity, where the view faded them as one layer, so overlapping glows fade a touch differently. With several pops alive, every glow is drawn below every dot.

**Measured on the OnePlus 9** (drips bench, release, 60 Hz, per 15 s trace). The view counts are one query run over all four traces, so they differ a little from the counts quoted in earlier sections: slices named like `mountViews`, slices named `traversal`, and distinct `SurfaceTexture-*` names.

| Run | Frames over 16.7 ms | p50 | p95 | p99 | GCs / 300 frames | `mountViews` | `traversal` | `SurfaceTexture-*` |
|---|---|---|---|---|---|---|---|---|
| Atlas A (before) | 3.7 % | 11.9 ms | 16.2 ms | 23.0 ms | 6–13 | 41 | 329 | 16 |
| Atlas B (before) | 3.4 % | 12.2 ms | 16.3 ms | 21.9 ms | 6–12 | 48 | 383 | 19 |
| Bursts A | 7.9 % | 15.1 ms | 17.3 ms | 22.1 ms | 6–8 | 0 | 217 | 2 |
| Bursts B | 4.3 % | 12.8 ms | 16.5 ms | 21.8 ms | 6–8 | 0 | 188 | 2 |
| Bursts C | 4.4 % | 14.9 ms | 16.5 ms | 22.4 ms | 6–7 | 0 | 148 | 2 |
| Control A (`883476e`, after the bursts runs) | 3.8 % | 12.4 ms | 16.5 ms | 23.2 ms | 6–7 | 21 | 267 | 10 |
| Control B (`883476e`, after the bursts runs) | 4.4 % | 13.7 ms | 16.6 ms | 22.5 ms | 6–7 | 21 | 187 | 10 |

- **Views:** no mounts, and no TextureView per catch; only the two long-lived ones remain.
- **Window redraws (`traversal`):** not clearly down. Against the atlas traces they look about 45 % lower, but the control build, benched afterwards, drew 187–267, which overlaps the bursts runs' 148–217. A pop lasts 900 ms and the HUD score bump 650 ms, and both start on the catch, so the window was already redrawing for the bump through most of each pop. Moving the pops only removes the last 250 ms of each catch's redraws. The bump is what keeps `traversal` up; drawing the HUD score in the canvas is the lever for it.
- **Allocation:** the UI runtime allocates 59–69 KB a frame, as before (61–73 K), and collects 6–8 times per 300 frames. Waits on `hades` stayed at 2–3 per 15 s.
- **Frames over budget:** slightly worse in all three runs (4.3–7.9 % against 3.4–3.7 %, p95 16.5–17.3 ms against 16.2–16.3 ms). The extra time is the main thread waiting on SurfaceFlinger inside `queueBuffer`, after the frame has been recorded. The bursts don't touch that path. Main-thread time inside `animation`:

  | Run | `queueBuffer` | `eglSwapBuffers` | `onFrameAvailable` |
  |---|---|---|---|
  | Atlas A / B | 4,917 / 4,977 ms | 2,982 / 3,020 ms | 2,325 / 2,359 ms |
  | Bursts A | 6,874 ms | 3,946 ms | 3,307 ms |
  | Bursts B | 4,891 ms | 2,963 ms | 2,313 ms |
  | Bursts C | 6,715 ms | 3,871 ms | 3,232 ms |

- **`queueBuffer` has drifted up all evening**, including across changes that never touched the buffer path. Mean per call, in trace order:

  | Traces | Mean `queueBuffer` |
  |---|---|
  | drips-after (second pair) | 1.67 / 1.70 ms |
  | bump | 2.20 / 2.36 ms |
  | sync | 2.12 / 2.70 ms |
  | atlas | 2.65 / 2.66 ms |
  | bursts A / B / C | 3.88 / 2.75 / 3.77 ms |

  The waits are almost all woken by SurfaceFlinger's binder threads. The phone was cool after run C (thermal status 0, CPU 39 °C, GPU 38 °C, battery 32 °C). Two explanations fit:
  - **Drift on the device**, which the earlier traces already show.
  - **Lower clocks:** with less app work per frame (no mounts, fewer window redraws), the governor may lower clocks, and SurfaceFlinger answers more slowly.

  **The control settles it: the phone drifted.** The previous build (`883476e`), benched right after the bursts runs, came out the same: 3.8 / 4.4 % over budget, p95 16.5 / 16.6 ms, `queueBuffer` 2.66 / 3.26 ms per call. Bursts B and C (4.3 / 4.4 %, p95 16.5 ms) match it. Run A (7.9 %, 3.88 ms per `queueBuffer`) is the one outlier among the five. On frame time the change is neutral within the evening's drift; what it removes is the per-catch React renders, mounts and TextureViews.

  **Correction (2026-10-16):** the `queueBuffer` totals above count two nested slices of one handoff, so they are twice the real time. The "drift" is the share of frames stuck in a late mode, not the phone; see "What the buffer handoff waits on".

**Visual check:** pending on the device. Pops in place, rising, swelling and fading; amber from the second step of a combo; staggered on the same tick; the glow as before. Rings for a point catch and game over. Bursts shake with the final hit, stay sharp while the scene frosts, and fade with the stage under the settle bowl.

### What the buffer handoff waits on (2026-10-16)

Read from the existing traces (atlas, bursts and control runs) with `scripts/perf/buffer-queue.sql`, which `scripts/android-bench.sh` now runs too. No new build.

**There is one handoff per frame, not two, and it goes to the game canvas.** A Skia render ends in `eglSwapBuffers`, which wraps `Surface::queueBuffer`, which wraps `BufferQueueProducer::queueBuffer`. The "two `queueBuffer` calls per frame" were these two nested slices, so summing them counted the same time twice. `onFrameAvailable` is not a TextureView either. It is the SurfaceView's BLAST consumer (`SurfaceView[…MainActivity]#1(BLAST Consumer)`), which on Android 12 runs inside the app, nested in that same `queueBuffer`. Its `processNextBufferLocked` sends the buffer to SurfaceFlinger with `setTransactionState`, a blocking binder call.

- **Main-thread time:** the handoff takes 2.8–3.9 ms per frame, or 22–28 % of `animation`, not 35–45 %. Almost all of it is the binder call, which SurfaceFlinger's binder threads answer.
- **TextureViews:** the long-lived ones swap 3–8 times per 15 s (the HUD score, on catches), at about 0.1 ms each.
- **The pause button never redraws during play.** `IconDot` is a `ghost` `DotButton`, which reads a still tilt, so it has no glare to move. The bench feeds its scripted tilt to the whole app (`App.tsx`, `ScriptedTiltSensor`), so this holds while the tilt moves.
- **P0-2 has nothing to remove:** no per-frame TextureView exists.

**SurfaceFlinger holds the handoff until a fixed point in the frame.** On this phone (Android 12, OxygenOS `LE2123_11_C.62`), a buffer queued in the first half of SurfaceFlinger's period comes back from `setTransactionState` about 8.5 ms after the app's vsync alarm. A buffer queued later comes back in about 1 ms. SurfaceFlinger's binder thread sleeps until another of its binder threads wakes it, and that thread is woken by the vsync timer (`TimerDispatch`). The SurfaceFlinger internals behind this are not pinned down; the timing is.

**That splits game frames into two steady modes:**
- **On time:** the frame starts at vsync, swaps about 9 ms in, waits about 1 ms, and ends with time to spare.
- **Late:** the frame starts right after an overrunning one, about 10 ms into the period. Its swap lands early in the next period, waits about 5 ms for the gate, and ends late, so the next frame starts late as well. A late frame escapes only if it swaps within about 6 ms of starting. Frames stay in this mode for long stretches.

| Run | Handoff per call | Late frames | SF wait, on time / late | Frames over 16.7 ms |
|---|---|---|---|---|
| Atlas A | 2.82 ms | 37 % | 1.11 / 5.09 ms | 3.7 % |
| Atlas B | 2.86 ms | 39 % | 0.93 / 5.24 ms | 3.4 % |
| Bursts A | 3.94 ms | 64 % | 1.29 / 5.09 ms | 7.9 % |
| Bursts B | 2.80 ms | 37 % | 1.07 / 5.11 ms | 4.3 % |
| Bursts C | 3.82 ms | 58 % | 1.12 / 5.37 ms | 4.4 % |
| Control A | 2.78 ms | 36 % | 1.16 / 5.01 ms | 3.8 % |
| Control B | 3.39 ms | 50 % | 1.05 / 5.25 ms | 4.4 % |

- **This explains the "drift" in `queueBuffer`.** The wait within each mode is the same in every run. What moves the mean per call is the share of frames stuck in the late mode, from 36 % to 64 %. So a mean `queueBuffer` per call is a poor A/B metric; compare the late share and the wait in each mode instead.
- **Frames over budget:** they wait 5.6–6.7 ms on SurfaceFlinger, against 2.4–3.0 ms for the others (bursts B, control A and B). Without that wait, only 32–46 % of them would still be over 16.7 ms.
- **Screen jank:** SurfaceFlinger's frame timeline marks most of the app's frames as "Buffer Stuffing" and "Late Present", with a handful of "App Deadline Missed". The app queues ahead of what SurfaceFlinger latches, so the extra wait shows mostly as latency, not as dropped frames.

**Levers left:**
- **Get frames back to on time.** Any main-thread work saved before the swap helps twice: the frame is shorter, and a late frame that swaps within about 6 ms of starting drops back to on time.
- **A TextureView for the game canvas, as a probe** (drop `opaque` on the `<Canvas>` in `GameCanvas.tsx`, locally, not committed). A TextureView swap took about 0.1–0.8 ms on the main thread in every trace so far. The SurfaceFlinger transaction then happens on HWUI's RenderThread for the window, off the main thread. The cost comes back as a window redraw every frame (about 1.5–1.7 ms of `traversal` on the main thread in the R2 traces) and a blended composite. R2 measured that trade-off before the late mode was understood, on runs it could not compare. Only a back-to-back bench against the current build can decide it.

### The game canvas back on a TextureView on Android (2026-10-16)

The probe above, benched back to back on the drips bench (release, 60 Hz, thermal status 0): the control is `8c589db` with its SurfaceView; the probe is the same code without `opaque`. Two runs each.

| Run | Frames over 16.7 ms | p50 | p95 | p99 | Late frames | Main-thread `animation` per frame | Main-thread swap |
|---|---|---|---|---|---|---|---|
| SurfaceView A | 4.4 % | 14.8 ms | 16.5 ms | 21.6 ms | 57 % | 13.4 ms | 4.1 ms |
| SurfaceView B | 4.6 % | 15.0 ms | 16.6 ms | 22.7 ms | 62 % | 13.7 ms | 4.4 ms |
| TextureView A | 2.1 % | 10.6 ms | 14.2 ms | 20.2 ms | 1.9 % | 9.5 ms | 0.66 ms |
| TextureView B | 1.7 % | 10.5 ms | 13.5 ms | 19.1 ms | 1.6 % | 9.3 ms | 0.67 ms |

- **Main thread:** frames over budget roughly halve, and p50 drops by about 4.5 ms. The swap falls from about 4 ms to 0.7 ms, and the late mode is gone: the TextureView's swap does not wait on SurfaceFlinger.
- **What it costs:**
  - The window redraws every frame: `traversal` goes from 137–175 to about 880 per 15 s, at about 1.1 ms each on the main thread.
  - HWUI's RenderThread now draws every frame, about 4.0 ms each, composites the texture and makes the SurfaceFlinger hand-off there. That is its own thread, in parallel with the next main-thread frame.
- **Unchanged:** UI-runtime allocation (55–67 KB a frame) and collections (5–8 per 300 frames).
- **Frame timeline:** SurfaceFlinger now times the window's frames, which it didn't for the SurfaceView. "App Deadline Missed" stays at 11–13 per 15 s, against 8 on the SurfaceView, so presenting does not get worse.
- **Change:** `GameCanvas` passes `opaque` only off Android. iOS keeps its opaque Metal layer, which still saves a blend there.
- **The fade, the shake and the bursts stay inside the canvas.** A TextureView would honour ancestor opacity and transforms too, but nothing depends on that now.

**Visual check:** pending on the device. The stage fade under the settle bowl, the game-over shake, the pause frost, flood transitions, the corner caps, and no flash of ink or transparency when play starts.

### Where the main thread's frame goes now (2026-10-16)

Read from the TextureView traces (tv-A, tv-B) with `scripts/perf/main-thread-cores.sql`, which the bench now runs too. A frame on the main thread is about 10.6 ms: 9.4 ms of `animation` and 1.1 ms of window redraw (`traversal`).

- **Atrace names almost none of `animation`.** The swap is 0.66 ms and Choreographer's own work about 0.2 ms. The other 8.5 ms are worklets and Skia, with no trace slices.
- **The main thread does not wait any more.** It sleeps for under 0.1 ms per frame, and Hermes's collector wakes it 2–4 times per 15 s.
- **It runs on the little cores, flat out.** 91–92 % of `animation`, 8.55 ms per frame, runs on CPUs 0–3 (Cortex-A55) at 1.75 GHz, against their 1.8 GHz maximum. Under 0.8 ms runs on the big cores. The SurfaceView traces show the same (10 of 15 s on the little cores). The big cores (A78 at up to 2.42 GHz, and the X1 at 2.84 GHz) do several times the work per clock.
- **Why it stays there:** the scheduler's choice, as found on 2026-10-15. All cores are allowed (`top-app`), a tilt game never triggers Android's input boost, and this phone's power HAL refuses hint sessions.

**What follows:**
- **Moving the main thread to the big cores is now the largest lever on this phone**, if the scheduler can be made to. An app may set its own threads' CPU affinity (`sched_setaffinity`) with no permission. A probe can do it from the shell on a debuggable build, with `run-as` and `taskset`, so no code is needed to measure it. If it pays, the fix is a small native call in a local module during runs, with a thermal check over a multi-minute run.
- **The 8.5 ms needs a fresh CPU profile to split.** The 2026-10-15 profile predates the atlas, the sync props, the bursts and the TextureView. The same debuggable build can take one with `simpleperf`.

### Pinning the main thread, and a fresh CPU profile (2026-10-16)

**Pinning from the shell is blocked.** With SELinux enforcing, `run-as <package> taskset -p f0 <pid>` fails with "Permission denied", even on a debuggable build: the `run-as` domain may not read or set the app's scheduling. The four probe runs on that build were therefore all unpinned. They give its run-to-run spread:
- 2.4–3.1 % of frames over budget, p50 10.6–10.8 ms, p95 14.9–15.7 ms.
- About 72 % of `animation` on the little cores and 27 % on the big ones.

The big-core share is higher than in the release traces (6–8 %), so a debuggable build is scheduled differently. A pin needs code in the app, a native `sched_setaffinity` call, so that probe is left for later.

**CPU profile.** Taken with `simpleperf` on the same debuggable build: the drips bench, the main thread sampled at 4 kHz for 10 s, 29,695 samples, none lost. It was symbolized against the build's `merged_native_libs`; the reports are in `traces/simpleperf/tv/`. The main thread was busy about 12.4 ms per frame. Java runs partly interpreted on a debuggable build, which accounts for about 9 % of the samples and is not in a release build.

| Where | Share of main thread | Per frame |
|---|---|---|
| **Worklets** (`AnimationFrameBatchinator::flush`) | 45 % | 5.6 ms |
| – `drawAtlas`, of which almost all is reading its arguments | 22.7 % | 2.8 ms |
| –– each RSXform read by name from a plain object (`JsiSkRSXform::fromValue`) | 7.4 % | 0.9 ms |
| –– each rect read by name (`JsiSkRect::fromValue`) | 7.0 % | 0.9 ms |
| –– each colour read as properties "0" to "3" | about 7 % | 0.9 ms |
| –– Ganesh's own atlas work | under 1 % | 0.1 ms |
| – declarative Skia nodes taking new values (`JsiRecorder::applyUpdates`) | 4.4 % | 0.5 ms |
| **Skia's render on the main thread** (`performDraw`: replay, flush, swap) | 8.1 % | 1.0 ms |
| **`Process.getProcessGroup`** (the phone's own code, every frame) | 7.0 % | 0.9 ms |
| Java interpreted (debuggable build only) | about 9 % | 1.1 ms |

Each plain-object field Skia reads costs a JS string made for its name (`createStringFromAscii`, 6.8 % of the main thread alone) and a property lookup. That happens 12 times per sprite per frame: 4 for the RSXform, 4 for the rect and 4 for the colour. The GPU side of the atlas is almost free. Skia reads its own rect and RSXform objects directly (`isHostObject` → `asHostObject`), with no names.

### drawAtlas fed Skia's own objects (2026-10-16)

**Change:**
- **Rects:** each sheet cell's rect is made once as a Skia rect, so `drawAtlas` reads it directly.
- **Placements:** made once per sprite slot as Skia RSXforms and rewritten through their `set`. The function is kept from the first lookup, so a sprite costs one native call instead of four reads by name.
- **Colours:** the free dots' halos and bodies are baked into the sheet in each of the three game colours, so their `drawAtlas` calls pass no colours. A baked cell is what Modulate gave before, the colour at the white sprite's alpha.
- **Bursts:** pops keep their colours, because a pop's tint carries its fading opacity. They also take the rects and placements.
- **Purity:** the packing stays pure. It writes through a `SpriteKit`: Skia's objects in `sceneDrawer.ts`, plain objects in the tests.

**Expected:** most of `drawAtlas`'s 2.8 ms per frame (debuggable build) goes, about 2 ms of main-thread time per frame. Not measured yet; it needs a release bench against `c4fe30f`.

## 3. Findings

**Confirmed** = measured. **Likely** = follows from the code or library source. **Hypothesis** = needs a trace.

| P | Finding | Evidence | Status | Impact | Effort | Proposed fix |
|---|---|---|---|---|---|---|
| P0 | Android has been judged on a development build | `dumpsys package`: DEBUGGABLE, dev launcher activity | Confirmed | High, size unknown | S | Baseline release builds on both platforms first (R1) |
| P0 | Main thread saturated | gfxinfo: 1,797 of 1,807 janky frames are slow UI thread; animation phase p50 9.1 ms at 60 Hz | Confirmed, dev build | High | — | R2 to R4 below |
| P0 | Two full-screen transparent TextureViews redraw every frame, each with a main-thread GL flush and swap, then HWUI recomposites the window | `SkiaBaseView.java:21` (TextureView default), `:35` (`opaque` → SurfaceView); `RNSkView.h:151`; `OpenGLWindowContext.cpp:54` | Likely | High, Android only | M | One opaque canvas for room and scene (R2) |
| P1 | Every animated style on Android commits through the shadow tree | `staticFlags.json`: `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS: false`; `ReanimatedModuleProxy.cpp:68` | Confirmed; fixed (flag on, see section 2) | Medium, worst during combos | S | Turn the flag on (R3) |
| P1 | A new Skia canvas (TextureView plus EGL surface) per catch, plus a full `GameScreen` render to add and remove each burst, on the JS thread that runs the game loop | `Bursts.tsx:35` (`Pop` → `DotMatrixText` `<Canvas>`), `useStageEffects.ts:54` | Confirmed; fixed (see section 2) | Medium to high, hitches exactly during combos | M | Draw bursts in the game canvas (R4) |
| P1 | Burst rings animate `borderWidth`, a layout prop, so every ring frame relays out | `Bursts.tsx:66` | Likely; fixed in code (R4) | Low to medium | S | Fixed stroke, or draw rings in Skia (R4) |
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
