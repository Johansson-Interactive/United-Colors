# The field is the pause, and the way back: a held touch, with Get ready held open

_Amended by ADR 0015: a finger landing again within a second of an early lift opens the pause whole, so the slip grace below (a finger that lands again before the bloom has drained picks up the hold) is gone._

_Amended by ADR 0012: the bloom now opens from the seat, not under the finger, and drains back into the dot. The frost edge became the portal, shared by both worlds. Get ready's cup opens with the hold, at the bloom's speed, and its being fully open replaces the arming delay._

Play had a pause dot in the top-right corner, and the pause screen had a play dot in the same spot that opened Get ready (ADR 0005). In a tilt game the thumbs hold the phone by its lower half; the corner needed an awkward reach while steering, and on the pause screen the play dot crowded PAUSED and was far from the thumb. Players also had to learn where the dot was before they could pause at all.

Now touch is the control, and the field is the surface. In play, a finger held anywhere clear of a button freezes the run at once and blooms frost from under it: the frost's edge wears the Get ready rim in the player's colour and grows with the hold, about half a second to the walls, where the pause screen opens. A finger lifted before then drains the frost back into the fingertip, faster than it grew, and play goes on from the frozen frame. On the pause screen, a finger held on the frost opens Get ready and holds it open: the cup opens in the frost at the seat, the title's bowl with its glass, which the rolling copy of the dot cannot leave, and Get ready proceeds as before (roll the dot home, hold level, the thaw spreads from the cup). The cup makes the bound the roll always had visible, and makes the three bowl screens one instrument: the title's bowl, the settle bowl and the cup. Play resumes the instant the field is clear, with the finger still down; that finger is spent, and play ignores it until it lifts. Lifting before the field is clear shuts the window and the pause screen is whole again.

The two frosts are one edge going two ways: the bloom frosts inside the edge, Get ready clears inside it. Both grow through the same ease, wear the same rim, fade it past sixty percent of the way to the walls, and drain back faster than they fill. They rest at different sizes: the bloom at 1.7 dot radii under the thumb, the cup at the bowl's. The shared pieces live in `frost.ts`; the bloom's and Get ready's steppers each add their own rule on top.

## Considered options

- **Keep the corner dot and add touch-anywhere as a second way**: the dot would still crowd PAUSED and still teach the wrong place. Rejected.
- **A filling arc around the finger as the pause indicator**: a timer in a game whose language is dots and frost. Rejected in favour of the frost edge's radius being the progress.
- **Pause only on a tap, no hold**: a grip touch at the screen's edge would pause the run. Rejected; the hold costs nothing (the run is frozen from the first frame) and a brush recedes harmlessly.
- **Keep the game running until the frost covers**: half a second of steering blind during the gesture, with a refusal possible. Rejected: the run freezes on the touch.
- **Get ready as a toggled screen with a touch to go back**: needs its own exit and can be left open. Rejected for Get ready held by the finger: lifting is the exit.
- **The window opening under the finger and running to the seat**: built first, then dropped. The finger stays down, so a window at the fingertip is under the thumb, and the run added a beat before the hold could count; the cup at the seat is where the eye has to go anyway.
- **The cup under the finger, the dot falling into it**: the real dot never moves while paused, so the copy would have to travel back before play; and the thumb would cover the cup's centre. Rejected for the cup at the seat.
- **Resume by picking the phone up and holding level, with no touch**: in the game's language, but implicit and risky with a menu open. Parked.
- **The field as the pause and the way back, with Get ready held open** (chosen).

## Consequences

- There is no pause dot in play and no play dot on the pause screen. The HUD is the score alone. A dev-only pause dot remains for the control mode where touch steers the dot on a simulator (`useDevControlMode`), since there the field cannot pause.
- One touch layer (`FieldTouch`) sits over the canvas and under every button, mounted on every screen, so the finger that opens Get ready is the same touch whose lift shuts it. It reports each landing to the flow and keeps whether the finger is down in a shared value the steppers read on the UI thread.
- The flow gains a `frosting` screen: the HUD kept up over a run the bloom has frozen, so the pause screen opens only once the frost has covered the field. The game is paused from the first frame of the touch; a lift resumes it without Get ready, since the pose has not had time to change.
- The frost window became the frost edge: a circle with a frosted side. The canvas draws a frosted disc over a sharp field for the bloom (a blurred copy clipped to the disc) and a sharp window in the frost for Get ready, each a second scene draw only while the edge is on the field.
- Get ready's hold keeps its arming delay against the jolt of the finger landing. A finger that slips and lands again before the cup has shut reopens it, which is the grace for slips.
- Leaving the app under the bloom keeps the pause the run already has and lands on the pause screen; leaving in Get ready closes it, as before.
- A resting thumb at the screen's edge did pause more often than it should: on phones whose glass curves round the sides, the hand holding the phone touches the field. The touch layer now stops 24 dp short of the left and right edges (`GRIP_BAND`), on every screen and every device, since a flat phone loses only a strip nobody aims at, and detecting a curve is not possible reliably. A finger landing in the band lands on the canvas instead: it does nothing, stays spent until it lifts however far it slides in, and leaves the layer free, so a finger landing beside it still pauses and its lift is still seen. The band is not drawn.
- Open to tuning on a device: the bloom's hold (900 ms, the same as Get ready's thaw), the cup's breath with the pulse, and the grip band's width.
