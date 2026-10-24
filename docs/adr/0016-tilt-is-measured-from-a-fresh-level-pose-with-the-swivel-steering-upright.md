# Tilt is measured from a fresh level pose, and the swivel steers only upright

Supersedes ADR 0009, ADR 0010, ADR 0013 and ADR 0014. Its arc, telling a turn on the spot apart, is superseded by ADR 0017.

Gravity alone (ADR 0014) works flat, leaning and walking, but on a sofa the phone stands nearly upright, its long side vertical, and a roll about that side is a turn about the vertical: gravity cannot see it, so left and right are lost. The steering wheel that stood in for it is a second motion nobody reaches for. The whole turn (ADR 0010) sees the roll, but a turn on the spot is the same rotation, and it steered. No reading of the phone's attitude can tell the two apart, so a second signal has to.

Now:

- **The level pose is taken afresh** as a run starts, once the flood from PLAY or RETRY has covered the screen and the jolt of the tap has passed, and when Get ready's portal clears the field, in whatever grip the player holds. It is never saved, so screen up, screen down, upright and lying on your side are one case. The settle bowl and the settings' level pose item are gone.
- **Tip and roll are read from gravity's turn from the level pose**, along two directions on the screen: across, which lies level at the pose and moves gravity in full, and downhill, square to it, a roll about which gravity sees only in part. Gravity's share is scaled back to the whole roll, at most four times as it is 60 degrees from flat.
- **The swivel steers only near upright.** How upright the level pose is decides, once per level pose, how much a turn about the vertical counts: none below 60 degrees from flat, all of it by 80, blending from gravity's scaled share to the whole turn in between. It steers about downhill, whichever screen axis lies nearest the vertical, so it stands in for the roll on a sofa and for the tip lying on your side. Standing and walking players hold the phone well below 60 degrees, so a turn on the spot never reaches them.
- **A swivel with an arc is a turn on the spot.** Turning about the body swings the phone along a circle a few tenths of a metre across; a wrist roll spins it about itself. The swivel is summed from the gyroscope's rate, without the compass, from the level pose. A least-squares fit of each swivel's radius, from the level push it comes with beyond the hand's resting push, is read as the swivel goes: once it reaches 11 cm the swivel is a turn on the spot, and the sum goes back to where it stood before the swivel began. Until then, and in a turn too slow to tell, it steers. Recorded on an iPhone held upright on a sofa (`src/__tests__/fixtures/motion`), wrist rolls never read more than 7.2 cm and torso turns read 18 to 30 cm within 30 ms of starting; through the turns the new tilt steered at most 3.7 degrees, through the rolls up to 47.
- **Tilt sets the dot's speed**, as it always has, at the same 40 px/s per degree, through a dead zone of 1 degree, a gentle start to 3, and a top speed at 20 degrees in any direction, so a diagonal is no faster than straight. The game reads the tilt as it comes; only the interface smooths it.
- **The cup and the title's bowl lean to match the hand**: their "down" follows the tilt over a quarter second, so the dot rolls off the seat as the grip changes and glides home once it is steady, from any grip. Tuned on a phone from a throwaway prototype, where a slower lean that let the dot slosh felt worse.

## Considered options

- **Gravity with a steering wheel upright** (ADR 0014): the sofa roll is lost. Rejected; it is the bug.
- **The whole turn from the level pose** (ADR 0010), as the handoff brief recommends: a turn on the spot steers in every pose but flat. Rejected.
- **Face tracking with the front camera**, tilt read as the phone against the face: the only reading that settles it in every posture, but camera permission and light, a native dependency, darkness, and heat on top of the Android heat already measured. Rejected for a casual game.
- **Tilt sets acceleration**, a marble with inertia: a different game, not a control fix. Left for a game-design experiment.

## Consequences

- The bench run keeps its level pose flat (`TiltSource`'s `flat` rule): its scripted tilt is from flat, as before.
- The motion probe (`EXPO_PUBLIC_MOTION_PROBE=1`, EAS profile `probe`) stays, to record Android traces: the arc is so far set from an iPhone only, and Android's linear acceleration may be noisier.
- Standing upright and turning slowly can still steer until the next Get ready.
- The gyroscope's drift reaches the swivel only near upright, and only until the next level pose.
