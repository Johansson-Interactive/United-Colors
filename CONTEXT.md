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
A run of catches, small dots and point dots alike, each within a split second of the one before. Every catch after the first in a combo is worth more than it would be alone, without limit.
_Avoid_: streak, chain, multiplier

**Combo step**:
A catch's place in its combo: 1 for the first (or a catch on its own), 2 for the next, and so on. A catch pays its own value plus two for every catch before it in the combo, so a combo of small dots alone totals its length squared.

**Combo bonus**:
What a catch paid beyond its own value: two for every catch before it in its combo. A run's combo bonus is the sum over its catches, so its score less its combo bonus is what its catches were worth on their own. Three small dots in one combo pay 1 + 3 + 5 = 9, of which 6 (2 + 4) is combo bonus.
_Avoid_: combo points, multiplier bonus

**Run time**:
How long a run lasted, counting only time the game was being played: not paused, and not the refusal that ends it. Shown as `M:SS`, rounded down.
_Avoid_: duration, survival time

**Pour**:
The game over's replay of a run: its catches fall in, in their order and rhythm, and merge into one drop of the player's liquid while a clock runs up to the run time, until the drop settles with its combo bonus as an amber layer at the bottom.
_Avoid_: recap, summary animation

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
