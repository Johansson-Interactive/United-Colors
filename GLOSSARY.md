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

**Combo**:
A run of catches, small dots and point dots alike, each within a split second of the one before. Every catch after the first in a combo is worth more than it would be alone, without limit. In play, each such catch rings a small amber circle where it landed, and the score turns amber while it counts the combo in.
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
How a run pauses: a finger held on the field, anywhere clear of a button, freezes the run at once and frosts the field from under the finger outward, the frost's edge wearing the rim. It covers the field in about half a second and the pause opens; a finger lifted before then drains the frost back into the fingertip, faster than it grew, and play goes on from the frozen frame. The bloom is the Get ready window run the other way. In code it is `frostBloom.ts`, screen `frosting`.
_Avoid_: long press, hold to pause, pause gesture

**Frost edge**:
The circle where the frost stops, with one side frosted and the other clear, and the rim on it: frosted inside for the bloom, clear inside for Get ready's cup. Both grow through the same ease, and the rim fades the same way once the edge is past sixty percent of the way to the walls. In code it is `FrostEdge` in `frost.ts`, drawn by the game canvas.
_Avoid_: mask, clip, cutout

**Rim**:
The thin line in the player's colour, over a soft glow, on the frost edge: pulsing like a point dot while the Get ready dot is away from the seat, steady once it is home, and in full while the bloom grows. In code it is `FrostRim`.
_Avoid_: ring, progress ring, loading circle

**Get ready**:
The step between the pause and play, held open by a finger on the frost: the field stays frosted, the cup opens in it at the seat, and a solid copy of the player dot rolls around inside the cup with the tilt. The player rolls it home and holds their level pose; the frost thaws outward from the cup, and play resumes the instant the whole field is clear, the finger still down. That finger is spent: play ignores it until it lifts. Lifting before the field is clear shuts the cup and the pause screen comes back. The game stays paused throughout. On a device without tilt, a finger on the frost resumes play directly.
_Avoid_: calibrate, level gate, resume screen

**Seat**:
Where the player dot froze when the run paused, shown in Get ready as the dot's dimple under the clear window. Rolling the copy onto it is rolling it home; the real dot never leaves it, so nothing jumps when play resumes.
_Avoid_: socket, target, home position

**Cup**:
The title's bowl, opened in the frost at the seat in Get ready: a circle of the field left sharp and full colour, the bowl's size, with the bowl's glass drawn over it, which the rolling copy of the player dot cannot leave. Its rim pulses in the player's colour like a point dot while the dot is away and holds steady once it is home. The thaw grows the clear circle outward from the cup with the hold until the field is clear, and the cup shuts if the finger lifts first.
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
The screen over a paused run, the frozen field frosted under it: the score, in the player's colour, and the run time stand in its middle; QUIT ends the run, and the corner menus hold the settings and the sound. The frost itself is the way back: a finger held on it, clear of the buttons, opens Get ready. There is no play dot, and no pause dot in play: the field is both (see Bloom). Nothing in the field moves. In code it is `PauseOverlay`.
_Avoid_: pause menu, pause button, play button

**Sink and rise**:
How the score moves between play and the pause: as the pause opens it sinks from the top into the middle and swells, and the run time follows it in; as Get ready opens it rises back to the top, where it waits dimmed until play resumes, while the run time fades where it stands. Silent, and never seen with any other screen: elsewhere the score and time fade with the pause.
_Avoid_: pour (that is the game over's), slide, transition

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
