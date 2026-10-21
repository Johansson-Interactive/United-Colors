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

**Run record**:
What a run did, as the game keeps it for its game over: its catches in order (each with the tick it landed on, what it paid, its combo step, its colour and whether it was a point dot) and its run time. It is never stored, and it is not the personal best.
_Avoid_: history, log, "record" on its own

**Pour**:
The game over's replay of a run: its catches pour in as small dots, in their order and rhythm, and merge into the drop while a clock runs up to the run time, until the drop settles and the bonus pour follows.
_Avoid_: recap, summary animation

**Drop**:
The one body of the player's liquid the pour's catches merge into. Its area follows the tally, so it grows as they land and swells as the bonus pours in; it holds the tally and, once settled, the amber layer.
_Avoid_: blob, ball, cup

**Bonus pour**:
The second beat of the pour, once the drop has settled: the combo bonus falls in as one amber body, the amber layer rises, the drop swells and the tally counts up from what the catches were worth alone to the score. The bonus is seen going into the total, so nothing is left for the player to add up. A run without a combo bonus has none.
_Avoid_: bonus reveal, combo tally

**Amber layer**:
The combo bonus, drawn as amber liquid at the bottom of the settled drop with its figure in ink inside it: a bare number, never `+N`, as it has already counted into the tally. Its share of the drop is the combo bonus's share of the score, except that it is never too small to hold a readable figure: a small combo bonus is deliberately drawn larger than its true share, and a large one smaller, so the tally above it is never drawn smaller than the bonus figure. While rising, it is held back under the tally until the tally has lifted and the drop swelled enough to make room.
_Avoid_: bonus bar, combo fill

**Tally**:
The running total inside the pour's drop: what the catches landed so far were worth on their own, then, in the bonus pour, counting up to the run's score as it rises into the drop's top part, above the amber layer, shrinking to fit inside it as the bonus figure fits inside the amber. Only a drop too small to hold it readably leaves it at full size, standing on the amber and out of the drop's top.
_Avoid_: counter, subtotal

### Screens

**Title screen**:
Where a run starts: the name, the PLAY dot rolling in its bowl and the personal best, over the kiosk. Also called the start game view. In code it is `KioskOverlay`, screen `title`, game phase `KIOSK`.
_Avoid_: menu, home, start screen

**Kiosk**:
The attract-mode game that plays itself behind the title screen. It halts and fades while a view opens over the title.

**Pause**:
The screen over a paused run: a spirit level that resumes play once the phone is held level again. In code it is `PauseOverlay`.

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
