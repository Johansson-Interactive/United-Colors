# The swivel zero follows a turn on the spot

Superseded by ADR 0014: the swivel no longer steers, so it needs no zero.

ADR 0010 fixed the swivel's zero in the room for as long as a run lasts, with the pause gesture as the only recenter. Players turn on the spot while they play, in a swivel chair, in bed or walking, and that zero stayed facing the old way. A turn is not a lean, and it did more harm than a compass step: tilt is read along the level pose's axes, so with the zero half a turn behind, tipping forward read as sideways even flat, where a swivel steers nothing. The controls turned round under the player.

Now the zero follows the player. Gravity cannot tell a turn on the spot from a swivel that steers, but steering has a reach: no lean goes past 45°, already far faster than anyone plays. A lean holds a swivel of its share of the turn about the vertical at the level pose, all of it upright and none of it flat, so the reach in swivel shrinks from 45° upright to nothing flat. A swivel past that reach is a turn: the zero is dragged along at once, so it never trails by more than the reach, and then it catches up the rest of the way over a fraction of a second (a fifth of a second to close all but a third) until the phone reads no swivel. Inside the reach nothing moves, so a held lean keeps its full strength in every pose for as long as it is held. Flat, the zero follows every swivel at once, and tilt is gravity's turn, as before ADR 0010.

The dragged zero is the session's zero from then on: a pose saved later reuses it, as it reuses one the pause gesture took.

## Considered options

- **Keep the zero fixed until the pause gesture**: the controls turn round under a player who turns. Rejected; it is the bug.
- **A steady leak of the swivel back to zero**, as ADR 0010 held back: fades a held lean in every pose but flat, and still lets the zero trail a turn by a long way while the turn goes on. Rejected.
- **Zero follows only past the reach, without catching up**: leaves the turn's last 45° upright, a full lean, until the player pauses. Rejected.
- **Read the lean about the phone's axes and the vertical together**, so a swivel about the vertical never counts: that basis collapses upright, where the vertical lies along the phone's long axis, and the screen's own turn would blow up near it. Rejected.

## Consequences

- During a turn on the spot the dot is pushed the way of the turn, up to a full lean upright and less the flatter the pose; it settles once the player is still.
- A compass step past the reach is caught up the same way; a smaller one still reads as a lean until the pause gesture, as ADR 0010 says.
- TiltSource takes a clock, as the catch-up runs in time, not in samples, whose rate differs by platform.
