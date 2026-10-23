# Tilt is the whole turn of the phone, swivel included

ADR 0009 measures tilt as the turn of gravity from the level pose. Gravity cannot see a turn about itself, so one axis fades as the phone nears vertical: held upright, the roll about the long axis that steers left and right is a turn about gravity and reads as nothing; lying on your side, the tip about the short axis is lost instead. Lying back at 45° half of a roll is already lost. ADR 0009 let a turn in the screen's own plane stand in for the lost axis, which gives the hand a second mapping to learn upright and nothing in between.

Now the sensor reports the phone's whole attitude, and tilt is the whole turn from the level pose, read along the phone's own long and short axes. A roll about the long axis steers left and right at full strength in every pose, flat, reclined, upright or on your side, and the turn in the screen's plane goes back to being ignored everywhere, as the flat spin on a tabletop always was. The part of that turn that gravity cannot see is the swivel: the turn about the vertical, as in a swivel chair. Both platforms already deliver it as a heading (Core Motion's yaw, Android's rotation vector), fused from the gyroscope and pinned by the compass, and the adapter had been throwing it away.

The swivel has no true zero. It is zeroed wherever the level pose is taken or held: when a run starts from the title, when the cup opens in Get ready, and when the settle bowl writes a pose. It is also zeroed on the first sample if nothing has zeroed it yet, so the compass reference never pushes the title's dots at launch. A newly saved pose reuses the last zero rather than taking whichever way the phone faces as the settings change. Both level poses, screen up and turned over, get the same swivel zero at once. The saved level pose stays a gravity direction; the swivel zero lives in memory for the session only, since a compass reference means nothing a day later and the player's turn in bed means less. Which pose is in use is still decided by gravity alone. The stillness holds in Get ready and the settle bowl check the whole turn, swivel included, so a pose is never written, and play never resumes, while the phone is still turning about the vertical.

## Considered options

- **Keep the gravity turn and loosen the hold upright**: leaves the axis lost. Rejected.
- **Rate control for the lost axis from the gyroscope**, as controller gyro aiming does ("player space"): mixes a velocity control into a position-controlled game, and the mix changes with the pose. Rejected.
- **A slow leak of the swivel back to zero** to cover compass drift and steps: a lean held unmoving would fade to half strength in a reclined pose, not only upright, since the swivel's share of a roll is a half at 45°. Rejected for the first build; the pause gesture is the recenter instead, and the leak stays a knob to add if device tests show compass steps the gesture does not cover.
- **The gyro-only sensors** (Android's game rotation vector, Core Motion's uncorrected frame): immune to magnets, but Expo does not expose them, so a native module. Held back as the fallback for the same case.
- **Gravity plus a heading angle** as the sample: Android's angle decomposition is degenerate exactly upright, where the heading angle jumps while the attitude does not. The sample carries the whole attitude, and gravity is derived from it.

## Consequences

- The recenter is a gesture the player already knows: touch the field, hold a second, play on. A compass step feels like a lean until then.
- A reclined player gets the full response on the roll axis where they had about seventy percent; the tilt speed setting covers taste.
- A phone without a gyroscope is unsupported. Its rotation vector would come from the accelerometer and compass alone, with a noisy heading, which is the swivel's only source there, so the adapter reports no samples on it and the no-tilt path takes over; the Android manifest marks the gyroscope as required.
- The scripted sensor, the pilot and the bench supply a flat attitude with no swivel, so their paths keep their behaviour.
- The screen-down sense flip of ADR 0009 applies to the swivel's reading too.
