# Get ready rolls the dot home through a window in the frost

_Amended by ADR 0008: Get ready now opens from a finger held on the frost rather than the play dot, its window runs from the finger to the seat, and it stays open only while the finger is down. The frost window described here became the frost edge._

Get ready (ADR 0004) used to lift the pause's frost and draw a hollow outline of the player dot that slid with the tilt, with a ring around the dot contracting as the hold filled. It worked, but it was a cursor and a progress ring: nothing in it belonged to the game's language of liquid dots, frost, pulses and catches, and the unfrosted field looked as if play had already begun.

Now the frost stays. The seat, where the player dot froze, is the one clear window in it, its rim pulsing in the player's colour on the point dot's rhythm, which already means "come here" in play. A solid copy of the dot rolls off the seat with the tilt, carried by a lightly underdamped spring so it has some weight. Rolling it home and holding level thaws the frost outward from the seat; the rim fades as the thaw passes the walls, and play resumes the instant the field is clear. The hold rules (arming delay, level zone, hold time, faster drain) are unchanged.

## Considered options

- **The dot as liquid**: the dot itself sags downhill and ripples until held still. The most Tiltling, but stillness is a subtle countdown on a small dot.
- **A bubble in the bead**: the glare becomes a bubble that floats uphill and sinks away while held. Fits the lit-bead drawing, but gives no sense of where the dot belongs.
- **Three beads on a hoop** that tumble downhill and are reeled in as a catch. Playful, but the busiest, and beads of other colours would read as a refusal.
- **Roll it home with a sleeping (dimmed) field and a beacon seat**: cheap, but a dim field could pass for night rather than paused.
- **Roll it home through a window in the frost** (chosen): the frost the pause already has says "not running"; the window says where home is; the thaw is the countdown and ends exactly when the field is clear.

## Consequences

- The field is frosted for the whole of the paused phase (`fieldFrosted` is now the phase alone); Get ready no longer lifts it. The frost's dim moved from a view over the canvas into the canvas, so the window can cut through blur and dim alike.
- The window is the canvas's: the room and the scene are drawn a second time, sharp, clipped to the window's circle, over the blurred scene. That costs a second scene draw only while a window is open.
- The rolling dot is the overlay's copy; the real player dot stays on the seat under an ink disc, so the overlay's fade-out reveals it in place when play resumes.
- Fired, the overlay leaves the window open: the whole field is clear, so the frost's 300 ms lift behind it goes unseen. Closed by the pause dot or by leaving the app, it closes the window, and the stage effects close it again whenever the frost comes on, so a pause always starts frosted all over.
- The hold still counts from the tilt alone: the copy can be a few frames from home when the thaw begins. If that reads wrong on a device, the stepper can gate the hold on the dot being seated.
- A dot merging into the player at the moment of pausing is part of the liquid body and shows in the window as it froze.
