# Point dots are placed from a weighted grid, not a uniform random spot

A point dot used to land on a uniform random spot, re-rolled up to ten times if it touched the player and used anyway after that. It could appear on or right next to the player, who would catch it by accident, be recoloured, and then have the small dot they were chasing refuse them. Now a point dot is placed from a coarse grid of weights (cells half a player wide), picked in one draw with no re-rolls. Cells touching a circle two player widths clear of the player are blocked. Each spawn lowers the weights around where it landed, and every spawn first lets all weights recover part of the way, so the last few spots are avoided without the board ever settling into "everywhere equally unlikely".

## Considered options

- **Square cut-out around the player, uniform over what's left**: exact and O(1), but it can't express "avoid where the last ones were".
- **Fenwick tree over cell masses** (from the original handoff): it avoids full-grid passes, but a portrait phone has about 540 cells and a point dot spawns every few seconds, so a plain scan costs about a microsecond. Recovery touches every cell anyway. Switch only if the bench says so.
- **No recovery**: every cell would sink to the floor weight partway through a long run, quietly undoing the rule.

## Consequences

- Memory is per run. It is cleared on reset and when the screen size changes, so the same seed still plays the same run.
- Cells touching the circle are blocked whole, so the real clear space is up to about one cell wider than the gap constant says.
- Placement draws a fixed number of values from the run's random stream, so seeded runs recorded before this change no longer match.
