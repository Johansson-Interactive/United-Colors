# A turn on the spot steers upright

Supersedes the arc in ADR 0016; the rest of it stands.

ADR 0016 told a turn on the spot from a wrist roll by the arc the swivel swings the phone along, and held the swivel still while a turn went on. On a phone held upright on a sofa, a slight turn of the torso was enough to call it, and from then until the phone had been quiet for a quarter second every roll was ignored: left and right locked and the dot stopped. Each turn it did catch also left a degree or two behind, past the dead zone, so the dot crept afterwards. Neither fault can be tuned away without the other coming back, and the arc was the most complex part of tilt.

Now the swivel is the gyroscope's turn about the vertical, summed from the level pose, with nothing taken back. Near upright it steers like the roll it looks like there, a turn on the spot included. Standing and walking players hold the phone well below 60 degrees from flat, where the swivel never steers, so they are not affected. The phone's acceleration is no longer read.

## Considered options

- **Keep the arc and tune it**: a wider cut-off misses real turns, a narrower one keeps locking on small torso turns. Rejected.
- **A leak**, the swivel fading back to zero, so the dot coasts to a stop on its own: it would also fade a roll held on purpose, making upright steering a nudge where every other grip is a lean. Kept as the fallback if the creep from torso turns bothers players.
- **A leak only while the phone is still**: brings back a stillness rule, a smaller copy of what is being removed. Rejected.

## Consequences

- Upright, the hand has nothing to feel for straight ahead: a shift of the shoulders steers until the next level pose, as a run starts or Get ready ends.
- The motion probe keeps recording gravity and rotation for Android traces; it no longer shows the arc.
