# Tilt is read from gravity, with a steering wheel upright

Supersedes ADR 0010 and ADR 0013.

ADR 0010 read tilt as the whole turn of the phone, swivel included, so a roll steered at full strength reclined and upright. But held reclined or upright, a roll is partly or wholly a turn about the vertical, and so is the player turning on the spot: the phone can't tell them apart. ADR 0013 let the swivel zero follow a turn past a lean's reach, which only bounded the harm. On device, a player turned 90 degrees to the left in a reclined pose and the dot ran right until the zero caught up. Flat, the same turn did nothing, and that is what players expect: turning on the spot is not steering.

Now tilt is read from gravity alone, as before ADR 0010 (`gravityTilt` in `domain/levelPose.ts`). Turning on the spot never moves gravity, so it never moves the dot, in any pose. Gravity's turn from the level pose splits along two directions on the screen:

- The direction that lies level at the pose (the short axis, held reclined in portrait) moves gravity in full, and reads as it is.
- The roll about the other direction, downhill on the screen at the pose, moves gravity by only its share of the roll: cos of how far the pose is reclined from flat. Up to 60 degrees from flat, that share is scaled back to the whole roll, so a reclined player keeps full strength (x1.4 at 45 degrees, x2 at 60).
- Nearer upright, scaling further would blow sensor jitter up, which is how ADR 0009's upright bug began. Turning the screen like a steering wheel moves gravity the same way, so between 60 degrees and upright that movement is read more and more as the wheel, at full size upright. Turned clockwise, the wheel lowers the right edge, as the roll it stands in for does reclined, so the dot goes the same way.

Flat there is no lost direction and every tip reads as gravity sees it, as it always did.

## Considered options

- **Keep the whole turn, and let the zero follow** (ADR 0013): the dot is pushed during every turn on the spot, up to a full lean upright. Rejected; it is the bug.
- **Gravity first, swivel as the upright fallback**: fixes reclined play, but a player turning while holding the phone upright still moves the dot. Rejected for the wheel, so the rule holds in every pose.
- **Tell a turn on the spot from a roll by the phone's path**: turning about the body swings the phone along an arc, and the accelerometer feels that, while a roll about the wrist barely does. A slow turn gives about 0.025 g, around the sensor's noise and hand shake, a wrist has a radius of its own, and a turn holding the phone to the chest has almost none. Rejected for now; it could be measured on device if the wheel proves unwelcome.

## Consequences

- The swivel has no part in steering, so its zero, its following and every `zeroSwivel` in the flow are gone. Compass steps no longer reach the dot.
- Upright, steering left and right is the wheel, a second motion to learn there. Between 60 degrees and upright a roll fades and the wheel grows; both steer the same way, so a mix of the two still steers.
- Reclined, the steering wheel moves the dot too, by its share, as it did before ADR 0010. Flat it moves nothing.
- The scaled roll carries the sensor's jitter scaled with it, up to twice at 60 degrees; the tilt smoothing already in place is expected to cover it. `WHEEL_FROM` is the knob if device tests disagree.
- A big roll reclined reads a little as a tip, since gravity follows a cone rather than a great circle: about 1 degree of tip for a 17-degree roll at 30 degrees.
- Gravity is all the game reads, so it is all the sensor reports (`SensorPort` gives a gravity, from the rotation's beta and gamma). The phone's attitude, and all the arithmetic that turned and smoothed it, are gone: a turn on the spot can't reach the game, because it is never read.
- Screen down, a roll and the wheel keep the hand's way round on either side of 60 degrees and of upright (`SENSE` in `gravityTilt`, by the pose's side). Reading the sign from gravity's z instead reversed both for a screen-down pose raised past 60 degrees from overhead, as lying back and tipping the phone up towards the face sets it.
- The settle bowl's stillness hold checks how far gravity has turned, as forgiving in every pose. Turning on the spot doesn't break the hold, since it changes nothing the pose keeps. Get ready's hold reads the tilt, so it fills while the player turns on the spot too.
- The gyroscope stays required: gravity fused with it holds steady while the hand moves, where the accelerometer alone would shake.
