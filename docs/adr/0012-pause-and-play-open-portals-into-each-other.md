# Pause and play open portals into each other

_Amended by ADR 0015: a finger landing again within a second of an early lift plays the bloom out whole to the pause._

Pausing and resuming looked like two unrelated effects. The bloom grew frost from under the finger, wherever it landed, and the pause screen opened only once the frost covered the field. Then the score flew from the HUD into the middle of the pause and swelled, and the run time popped in dot by dot. Resuming ran it back with fades: ROLL IT HOME replaced PAUSED, the score rose to the top and waited dimmed, and the cup popped open at the seat in a fixed 120 ms. A lot of motion that told the player nothing. Frost from the fingertip pulled the eye away from the dot, where play stopped and where it will start again, and the pause assembled itself instead of being a place to step into.

Now pause and play open portals into each other. A portal is a circle with a world on each side and the rim on its edge. The bloom opens a portal into the pause from under the finger, wherever it landed: it grows from the fingertip to the farthest corner in the same 900 ms. Through it is the pause world, the frozen field frosted, with the score, run time, PAUSED, the resume hint, QUIT and the corner menus already there. An early lift drains it back into the fingertip, faster than it grew. Get ready opens a portal back into play at the same seat: held by the finger, it grows from nothing to the cup at the bloom's speed, the bowl's glass showing at its edge. The dot copy rolls with the tilt from the finger's landing, inside the glass as it grows, so the cup shows its bounds as the dot drops into them. The cup being fully open is the arming. Until then the level hold doesn't count; once open, the rim pulses, starting from the top of its beat so it takes over from the opening's full rim with no jump, and Get ready goes on as before, the portal widening to the walls with the hold. Each portal opens onto the other world, and the world you step through to is the one you are in. Nothing on either side flies, swells or fades in: it is there when revealed.

## Considered options

- **Open the bloom at the seat too**, so both portals share one place: tried, and reverted after playing it. The pause answers the touch, so it opens where the finger lands; the way back still opens at the seat, where play starts again.
- **Keep the score sink and rise**: it linked the HUD score to the pause's, but as motion layered on top of the portal. Rejected: the HUD score is on the play side, so the portal covers and uncovers it, and the pause's score simply stands there.
- **Keep ROLL IT HOME**: it taught Get ready, but swapping the pause's caption under the finger changed the world the player was standing in. Dropped; a caption can come back later if first-time players need it.
- **Keep the 200 ms arming delay with a fixed cup open**: a timer the player cannot see. Rejected for the cup's opening as the arming: the jolt of the landing is over by the time the cup is open, and the player sees why the dot is not rolling yet.
- **A depth effect behind the portal** (zoom, parallax, push-in): out of scope. It may be tried later on a device.
- **Keep the dot copy seated until the cup is open**: it waited out the jolt too, but the dot sat still for the first 300 ms of the hold, as if Get ready had not started. Rejected: the jolt only matters to the hold, so only the hold waits; a jolted dot just wobbles in a glass it cannot leave.
- **Portals between the worlds: into the pause from the finger, back into play from the seat** (chosen).

## Consequences

- The frost edge is renamed: it is `Portal` in `src/presentation/effects/portal.ts`, a circle with a side for each world: pause inside for the bloom, play inside for Get ready. The rest radius, the reach to the farthest corner, the shared ease and the rim's fade past sixty percent are unchanged.
- The play side is always the top layer, and the portal only decides which part of it shows. Every Skia canvas on the play side clips to the same portal: the game canvas's sharp field, the HUD score, score slivers in flight, and Get ready's glass, dot copy and rim. The pause content stays plain React Native views underneath and is never clipped.
- The frosted pause world is drawn from the frozen frame only while the run is not in play, so play costs nothing extra. No new dependencies and no masking library.
- The `frosting` screen no longer carries where the finger landed: nothing uses it. "Touch to pause" goes the moment a finger lands, is not clipped, and comes back after an early lift by its existing rule.
- The pause's content cannot be pressed while the bloom grows, nor while a finger holds Get ready open, so a stray second finger cannot quit the run. Leaving the pause for the title, the level bowl or the speed screen keeps its fades.
- The score sink module is gone. The overlay of Get ready no longer fades in or out as a whole; the dot copy still fades into the real dot when play resumes.
- Leaving the app still goes straight to the pause with no portal, and leaving in Get ready shuts it. Coming back, the pause's content fades in, as it does back from the level bowl or the speed screen: only under the bloom is it revealed in place. The dev-only pause dot, with no finger to open under, plays the full bloom from the seat without a hold.
- While the cup opens, the dot copy can roll only as far as the cup is open: the glass stops it at the rim and pushes it in as the cup drains, so it is never cut off at the portal's edge. It cannot move for the first 100 ms or so, while the cup is smaller than the dot.
- Open to tuning on a device: how fast the cup opens (the bloom's speed means about 300 to 400 ms to the cup).
