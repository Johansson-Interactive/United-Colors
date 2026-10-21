# The combo bonus pours into the tally, instead of being written beside it

The game over's pour used to count every catch in at what it paid, combo bonus included, so the tally reached the score as the last catch landed. The amber layer then rose in with `+N` inside it. Players read `+N` under the total as a sum left for them to finish, and thought their real score was the total plus the amber. The screen's own picture said the opposite: the amber was part of the same drop whose area is the score. The sign contradicted the picture.

Now the catches count in at what they were worth on their own, and the drop grows to match. Once it settles, the bonus pours in: an amber body falls onto the drop, the amber layer rises, the drop swells and the tally counts up to the score, in the same drain-into-the-total language the in-play tally uses. The figure in the amber is bare, with no sign, because the addition has visibly happened. Combo catches fall in their own colour during the pour, so amber appears exactly once, as the bonus.

## Considered options

- **Drop the `+` and caption the amber `COMBO`**: removes the false instruction, but leaves the player to infer that the two numbers are parts of a whole.
- **Settle the amber out of the already counted drop, as sediment**: separation reads as "part of", but the tally never moves, so the relation is still inferred rather than watched.
- **Pour the bonus in with the count-up** (chosen): the `+` becomes an action the player watches finish, and one metaphor runs through the whole screen: liquid in, number up.

## Consequences

- The tally no longer matches the in-play score at the moment the last catch lands; it does half a second later, at the end of the bonus pour. `NEW BEST!` waits for that moment, and the best-to-beat is passed during the bonus pour when the own value fell short of it.
- A run with a combo bonus takes POUR_RISE_MS longer to settle. A run without one is unchanged.
- The amber is held back under the tally while the tally lifts and the drop swells, so the tally's ink never stands in amber during the rise. For a drop too small to hold its tally, the amber appears a little after the bonus lands.
- The drawn drop follows the swell exactly rather than easing after it, so the amber is never drawn above where the stepper has it.
- A large bonus counts up through at most POUR_COUNT_TICKS values, so the plan passed to the UI thread stays small.
- Once settled, each figure sits inside its own layer of the drop: the tally in the player's colour above the amber, the bonus inside the amber, each shrunk to fit. To keep the total from reading smaller than its part, the amber is drawn below its true share when a large bonus would squeeze the tally smaller than the bonus figure. A drop too small to hold the tally readably is enlarged to hold it; see ADR 0006.
