# Tilt is measured from a fresh level pose, and the swivel steers only upright

Supersedes ADR 0009, ADR 0010, ADR 0013 and ADR 0014.

Gravity alone (ADR 0014) works flat, leaning and walking, but on a sofa the phone stands nearly upright, its long side vertical, and a roll about that side is a turn about the vertical: gravity cannot see it, so left and right are lost. The steering wheel that stood in for it is a second motion nobody reaches for. The whole turn (ADR 0010) sees the roll, but a turn on the spot is the same rotation, and it steered. No reading of the phone's attitude can tell the two apart, so a second signal has to.

Now:

- **The level pose is taken afresh** when PLAY is pressed and when Get ready's dot settles home, in whatever grip the player holds. It is never saved, so screen up, screen down, upright and lying on your side are one case. The settle bowl and the settings' level pose item are gone.
- **Tip and roll are read from gravity's turn from the level pose**, along the screen's axes, as before.
- **The swivel steers only near upright.** How upright the level pose is decides, once per level pose, how much a turn about the vertical counts: none below 60 degrees from flat, all of it by about 80. It steers whichever screen axis lies nearest the vertical, so it stands in for the roll on a sofa and for the tip lying on your side. Standing and walking players hold the phone well below 60 degrees, so a turn on the spot never reaches them.
- **A swivel with an arc is a turn on the spot.** Turning about the body swings the phone along a circle a few tenths of a metre across; a wrist roll spins it about itself. The swivel is tracked from the gyroscope's rate, without the compass, against a turn reference taken with the level pose; a swivel that comes with an arc moves the reference along, and one without it steers. When the arc is too small to tell, as in a slow turn, it steers. The arc threshold is set from device recordings, not guessed.
- **Tilt sets the dot's speed**, as it always has, through a dead zone, a gentle start, a maximum speed and a diagonal clamp.
- **The cup and the title's bowl lean to match the hand**, so the dot settles home from any steady grip.

## Considered options

- **Gravity with a steering wheel upright** (ADR 0014): the sofa roll is lost. Rejected; it is the bug.
- **The whole turn from the level pose** (ADR 0010), as the handoff brief recommends: a turn on the spot steers in every pose but flat. Rejected.
- **Face tracking with the front camera**, tilt read as the phone against the face: the only reading that settles it in every posture, but camera permission and light, a native dependency, darkness, and heat on top of the Android heat already measured. Rejected for a casual game.
- **Tilt sets acceleration**, a marble with inertia: a different game, not a control fix. Left for a game-design experiment.

## Consequences

- Standing upright and turning slowly can still steer until the next Get ready.
- The gyroscope's drift reaches the swivel only near upright, and only until the next level pose.
- The leaning bowl decides what "steady" means; its lean speed is tuned on device from a throwaway prototype first.
