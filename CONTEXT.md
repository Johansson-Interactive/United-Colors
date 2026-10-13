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
A large, pulsing, stationary dot worth more than a small dot; catching it recolours the player.
_Avoid_: "points" (when meaning the dot), bonus dot

### Play

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
A catch's place in its combo: 1 for the first (or a catch on its own), 2 for the next, and so on. A catch pays its own value plus its combo step minus one.
