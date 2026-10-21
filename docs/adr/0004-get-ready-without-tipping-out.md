# A paused run continues through Get ready, with no "tip it out first" phase

The pause screen used to hold a spirit level in its middle. To continue a run, the player first had to tip the bubble out of the inner circle, then bring it back and hold the phone level (or tap the ring). The tip-out was there so that a phone already lying level, or the jolt of the thumb, couldn't resume play by accident. Players didn't understand it: nothing said why they had to tip anything, and the step sat among the pause's other controls.

Now continuing is a choice first: the HUD's pause dot becomes a play dot on the pause screen, and pressing it opens Get ready. The pause UI fades, the frost lifts, and the player holds a hollow outline of their dot on the dot itself until a ring closes on it. A phone already level just holds for a moment. Holds only count after a short arming delay from opening, which is what keeps the thumb's jolt from counting.

## Considered options

- **Keep the tip-out, explain it with a caption**: more words on a screen that was already crowded, for a step players shouldn't need.
- **Resume straight from the play dot**: fast, but play could restart with the phone at a bad tilt and run the player into a dot of another colour.
- **Get ready with an arming delay** (chosen): pressing play is the deliberate act the tip-out used to stand in for; the delay covers the tap's jolt, and the hold makes sure the pose is sensible.

## Consequences

- The game stays paused throughout Get ready; it is a screen of the flow over the pause, not a game phase. The pause dot, or leaving the app, closes it back to the pause screen, so a hold can't complete while the player is away.
- The speed view and the settle bowl open only from the pause screen. Settling a new level pose from the pause still floods straight into play, so the player never levels twice in a row.
- With no tilt sensor, the play dot resumes play directly.
- The ring closing is the countdown: play resumes the instant it closes, with no flood.
