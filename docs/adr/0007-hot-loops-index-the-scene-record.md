# The hot loops index the scene record directly, with their own copies of the wall rule

The UI-thread loops that draw every dot (the sprite packing, the scene drawer and the wall drop packing) read the scene record by indexing it with the exported field offsets. They don't call the scene record's worklets. So "this small dot is on a wall" (the wall normal's L1 norm against `WALL_NORMAL_MIN`) is written out inline five times, beside `hasWall` and the shader string. A helper would define the rule once, but on the UI thread a worklet call allocates, even when it takes only the scene array and an offset and returns a boolean.

That was measured on 2026-10-21 (#49), on the OnePlus 9 Pro (LE2123, 120 Hz) with Reanimated 4.5.1 and react-native-worklets 0.10.1. The `drips` bench release build was run back to back with the same build plus one change: an `onWall(scene, offset): boolean` worklet in the scene record, called in place of each of the five inline checks. Each build had two 15 s runs and five minutes of sustained play from the same cool start. The figures are from the UI runtime's own counters, averaged over its reports:

| | Inline (control) | Helper |
| --- | --- | --- |
| UI runtime allocation, 15 s runs | 29.4 KB/frame | 49.6 KB/frame |
| UI runtime GCs per 300 frames, 15 s runs | 3.5 | 5.2 |
| UI runtime allocation, sustained | 21.6 KB/frame | 69.8 KB/frame |
| UI runtime GCs per 300 frames, sustained | 3.8 | 7.3 |
| Frame p50 / p95 / p99, sustained | 6.0 / 7.8 / 9.5 ms | 6.0 / 8.3 / 10.0 ms |
| Late frames, sustained | 1.9 % | 2.0 % |

The helper's extra allocation grows with the number of dots in play. It is about 20 KB a frame early in the run and 48 KB once the board fills, which comes to tens of bytes per call. Collections nearly double. On this phone Hermes's concurrent collector absorbs them, so frame times and the late share don't move yet. On a slower phone, or with more per-dot work, every one of those collections risks a dropped frame.

## Considered options

- **Allocation-free readers in the scene record** (#50): one definition of "on a wall" and "a plain small dot" for the hot loops. Rejected, because the readers aren't allocation-free: a worklet call allocates on the UI thread whatever it takes or returns.
- **Inline the rule and keep a test on each copy**: the drawing modules' suites already pack drips and free dots and catch a copy that disagrees, so a second layer adds little.
- **Keep the direct indexing and the inline copies** (chosen): no allocation in the per-dot loops, at the cost of repeating the rule.

## Consequences

- Don't replace the inline wall checks, or any other per-dot read in the hot loops, with a worklet call, however small. A call once per frame (such as `dotCount` or `readDot` for the rare dot that needs every field) is fine.
- A change to how walls are encoded means editing all five copies, `hasWall` and the generated shader string. Search for `WALL_NORMAL_MIN`.
- Revisit after a Reanimated or react-native-worklets upgrade. Re-run the #49 bench (the `drips` build, a control run back to back, `scripts/android-heat.sh --cool` for both) and compare the UI runtime's B/frame and GCs. If a per-dot helper no longer adds to them, #50's readers can go ahead.
