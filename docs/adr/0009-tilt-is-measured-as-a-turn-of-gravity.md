# Tilt is measured as the turn of gravity from the level pose

Superseded by ADR 0016: the level pose is taken afresh as play starts and resumes, never saved, and there is one, not two.

Tilt used to be two angles from flat, one per screen axis (`atan2(gx, -gz)` and `atan2(-gy, -gz)`), and the level pose was those two angles, subtracted from each reading. Near upright that reading breaks down: as the screen nears vertical, `gz` nears zero and a small turn of the phone moves the angles a lot. Held at 88° (lying on your side), 0.3° of sensor jitter read as 8.5°. Calibration failed because its 2.3° hold never held, and steering went twitchy. Players lying down reported it on Android, whose rotation-vector sensor is noisier than Core Motion; the same arithmetic ran on iPhone too.

Now the sensor reports which way gravity points. The level pose is saved as a gravity direction, and tilt is the shortest turn from it to the current gravity, read along the level pose's own axes (`domain/levelPose.ts`). The size of the reading is the angle gravity has turned, in every pose, so jitter is never magnified. The settle bowl's hold is checked on that angle too.

## Considered options

- **Loosen the hold as the phone nears upright**: lets calibration finish, but steering stays twitchy, and the threshold would be a guess per device.
- **Smooth the sensor harder**: adds lag to every pose to cover for one.
- **Measure the turn of gravity** (chosen): one reading that is steady everywhere; it changes the saved pose's shape.

## Consequences

- ADR 0014 returns to gravity, with the reclined roll scaled back to full and the steering wheel upright. Superseded before that by ADR 0010: tilt is now the whole turn, swivel included, and the steering-wheel stand-in below is gone. Gravity can't see a turn about itself. In a flat pose that turn is the phone's flat spin, as before. Upright or on your side, it is a turn about the phone's x or y axis, so the turn in the screen's own plane (a steering wheel) steers that axis instead.
- There are still two level poses, screen up and turned over. The one in use is the one the phone is nearer, and the other takes over only when it is 60° nearer. Between flat poses that switches 30° past upright, as the old side switch did. A pose set on your side holds through the leaning of play. Calibrating replaces the pose in use, not the one for the side the screen happens to face.
- The game session and the interface each pick the pose in use (`PoseSide`: `up` or `down`) from the same samples. They can only disagree while the phone sits in the switch's dead band, well away from either pose.
- `domain/levelPose.ts` is the first domain module whose functions carry Reanimated's `"worklet"` directive, because the interface runs the same arithmetic on the UI thread every frame. The directive is a string with no effect outside Reanimated; the module still imports nothing but domain types.
- Saved poses are now `{ x, y, z }`. One saved as two angles is dropped and reads as flat until the player sets it again. The app is in closed alpha, so no converter is kept for the old shape.
