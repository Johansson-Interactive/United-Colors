# Tiltling

A tilt game: the player steers a dot by tilting the phone, catching dots of its own colour and avoiding the rest.

## Language

### Dots

**Player**:
The dot the person steers by tilting; it has one of the three game colours at a time.
_Avoid_: ball, cursor

**Small dot**:
A dot that forms as a drip on a wall, then shoots off and bounces around the playfield.
_Avoid_: enemy, ball

**Drip**:
A small dot while it is still forming on its wall, before it shoots off.

**Point dot**:
A large, pulsing, stationary dot worth more than a small dot; catching it recolours the player. It never appears close to the player, and tends to appear away from where the last few appeared.
_Avoid_: "points" (when meaning the dot), bonus dot, switch-color dot

### Play

**Run**:
One game, from its start until the refusal that ends it.
_Avoid_: round, session

**Catch**:
The player touching a small dot of its own colour, or any point dot, and taking it in.
_Avoid_: grab, collect, eat

**Refusal**:
The player touching a small dot of another colour (other than a forming drip); it spits the dot out and the run ends.
_Avoid_: death, hit

**Score**:
The running total a run earns from catches.
_Avoid_: points

**Score sliver**:
One point of a catch, on its way into the score in play. A catch sends its score slivers one after another from where it happened, straight to the middle of the score at one steady speed, and the score counts each as it arrives, where it vanishes. A catch far from the score takes longer to count in than a near one, and a near catch can count in before an earlier, far one. Each wears its catch's colour. Score slivers in the air freeze with the run when it pauses, and the game over waits for the last of them to arrive.
_Avoid_: point, sliver (on its own), particle, feed

**Combo**:
A run of catches, small dots and point dots alike, each within a split second of the one before. Every catch after the first in a combo is worth more than it would be alone, without limit. In play, each such catch rings a small amber circle where it landed, and the score turns amber as the combo's first score sliver arrives, until none of them is left in the air.
_Avoid_: streak, chain, multiplier

**Combo step**:
A catch's place in its combo: 1 for the first (or a catch on its own), 2 for the next, and so on. A catch pays its own value plus two for every catch before it in the combo, so a combo of small dots alone totals its length squared.

**Combo bonus**:
What a catch paid beyond its own value: two for every catch before it in its combo. A run's combo bonus is the sum over its catches, so its score less its combo bonus is what its catches were worth on their own. Three small dots in one combo pay 1 + 3 + 5 = 9, of which 6 (2 + 4) is combo bonus.
_Avoid_: combo points, multiplier bonus

**Run time**:
How long a run lasted, counting only time the game was being played: not paused, and not the refusal that ends it. Shown as `M:SS`, rounded down.
_Avoid_: duration, survival time

**Bloom**:
How a run pauses: a finger held on the field, anywhere clear of a button and the grip band, freezes the run at once and opens a portal into the pause at the seat, swallowing the player dot on the first frame. It reaches the walls in about a second and the pause is there; a finger lifted before then drains the portal back into the dot, faster than it grew, and play goes on from the frozen frame. In code it is `touch/bloom.ts`, screen `frosting`; see ADR 0011.
_Avoid_: long press, hold to pause, pause gesture

**Grip band**:
The strip 24 dp wide down the field's left and right edges where a finger is taken for the hand holding the phone, not the player: a phone whose glass curves round its sides is gripped there. A finger landing in it does nothing, on any screen, until it lifts. It is not drawn. In code it is `GRIP_BAND`; see ADR 0008.

**Portal**:
The circle between the pause and play, opening from the seat, with one world inside it, the other outside, and the rim on its edge: the pause inside for the bloom, play inside for Get ready. Both grow through the same ease, and the rim fades the same way once the portal is past sixty percent of the way to the walls. In code it is `Portal` in `portal.ts`; see ADR 0011.
_Avoid_: frost edge, mask, clip, cutout, window

**Rim**:
The thin line in the player's colour, over a soft glow, on the portal's edge: in full while the bloom grows and while the cup opens, then pulsing like a point dot while the Get ready dot is away from the seat, steady once it is home. In code it is `PortalRim`.
_Avoid_: ring, progress ring, loading circle

**Get ready**:
The step between the pause and play, held open by a finger on the pause: a portal back into play opens at the seat and grows into the cup, and once the cup is fully open a solid copy of the player dot rolls around inside it with the tilt. The player rolls it home and holds their level pose; the portal widens from the cup to the walls, and play resumes the instant the whole field is clear, the finger still down. That finger is spent: play ignores it until it lifts. Lifting before the field is clear shuts the portal and the pause is whole again. The game stays paused throughout. On a device without tilt, a finger on the pause resumes play directly.
_Avoid_: calibrate, level gate, resume screen, roll it home

**Seat**:
Where the player dot froze when the run paused, and where both portals open from; shown in Get ready as the dot's dimple inside the cup. Rolling the copy onto it is rolling it home; the real dot never leaves it, so nothing jumps when play resumes.
_Avoid_: socket, target, home position

**Cup**:
The title's bowl, opened as a portal into play at the seat in Get ready: it grows with the finger's hold at the bloom's speed, the bowl's glass showing at its edge, and drains back if the finger lifts first. Fully open, it arms Get ready: only then does the copy of the player dot roll, inside the glass it cannot leave, and the level hold count. Its rim then pulses in the player's colour like a point dot while the dot is away and holds steady once it is home. The hold widens the portal from the cup to the walls.
_Avoid_: window, hole, spotlight, bowl (that is the title's and the settle screen's)

**Run record**:
What a run did, as the game keeps it for its game over: its catches in order (each with the tick it landed on, what it paid, its combo step, its colour and whether it was a point dot) and its run time. It is never stored, and it is not the personal best.
_Avoid_: history, log, "record" on its own

**Pour**:
The game over's replay of a run: its catches pour in as small dots, in their order and rhythm, and merge into the drop while a clock runs up to the run time, until the drop settles and the bonus pour follows.
_Avoid_: recap, summary animation

**Drop**:
The one body of the player's liquid the pour's catches merge into. Its area follows the tally, so it grows as they land and swells as the bonus pours in; it holds the tally and, once settled, the amber layer. Once settled, it is never smaller than what holds its figures at a readable size, so a short run's drop swells a little past its score as it settles.
_Avoid_: blob, ball, cup

**Bonus pour**:
The second beat of the pour, once the drop has settled: the combo bonus falls in as one amber body, the amber layer rises, the drop swells and the tally counts up from what the catches were worth alone to the score. The bonus is seen going into the total, so nothing is left for the player to add up. A run without a combo bonus has none.
_Avoid_: bonus reveal, combo tally

**Amber layer**:
The combo bonus, drawn as amber liquid at the bottom of the settled drop with its figure in ink inside it: a bare number, never `+N`, as it has already counted into the tally. Its share of the drop is the combo bonus's share of the score, except that it is never too small to hold a readable figure: a small combo bonus is deliberately drawn larger than its true share, and a large one smaller, so the tally above it is never drawn smaller than the bonus figure. While rising, it is held back under the tally until the tally has lifted and the drop swelled enough to make room.
_Avoid_: bonus bar, combo fill

**Tally**:
The running total inside the pour's drop: what the catches landed so far were worth on their own, then, in the bonus pour, counting up to the run's score as it rises into the drop's top part, above the amber layer. It is drawn at the largest size that fits inside its room (the whole drop, or the part above the amber layer once there is one), never larger than the score in play and never smaller than readable. Throughout the pour it is sized as the final score's figure, so it grows with the drop and never jumps as a digit is added. While the drop is still too small to hold that figure readably, the tally stays at the smallest size and spills past the drop's edge, a little longer than its own, narrower figure would need; the settled drop is always large enough to hold it.
_Avoid_: counter, subtotal

### Screens

**Title screen**:
Where a run starts: the name, the PLAY dot rolling in its bowl and the personal best, over the kiosk. Also called the start game view. In code it is `KioskOverlay`, screen `title`, game phase `KIOSK`.
_Avoid_: menu, home, start screen

**Kiosk**:
The attract-mode game that plays itself behind the title screen. It halts and fades while a view opens over the title.

**Pause**:
The world on the other side of the bloom's portal: the frozen field frosted, with the score, in the player's colour, and the run time standing still in its middle; QUIT ends the run, and the corner menus hold the settings and the sound. All of it is already there as the portal reveals it, and none of it can be pressed while the bloom grows or while Get ready is held open. A finger held on it, clear of the buttons, opens Get ready. There is no play dot, and no pause dot in play: the field is both (see Bloom). Nothing in the field moves. In code it is `PauseOverlay`.
_Avoid_: pause menu, pause button, play button

**Corner menu**:
A dot in a bottom corner that opens into smaller dots, one per item (`DotMenu`). The title screen and the pause share two: the settings corner bottom left (`SettingsMenu`: level pose and tilt speed) and the sound corner bottom right (`SoundMenu`: music and effects).
_Avoid_: settings page, popup

### Ranking

**Personal best**:
The highest score this install has reached under the current scoring version; a new scoring version starts it over.
_Avoid_: high score, record

**Leaderboard**:
The shared list, across all players everywhere, ranking each player by their personal best; a player appears on it at most once. Each scoring version has its own leaderboard.
_Avoid_: high score list, ranking, scoreboard

**Scoring version**:
Which scoring rules a score was earned under. It changes only when scoring changes enough that old and new scores can't fairly be compared, and that change starts a fresh leaderboard.
_Avoid_: season, game version

**Tag**:
The short name, one to eight letters and digits, a player is shown by on the leaderboard. A player picks it the first time they set a personal best.
_Avoid_: username, nickname, initials
