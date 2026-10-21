# The tally is contained in the drop

The game over's picture says the drop is the score, but the tally was only fitted inside it when a combo bonus poured in. Without one, the tally kept its in-play size centred on the drop, so most small and mid-sized drops had it spilling past their edge, during the pour and once settled. A tiny drop with a bonus left the tally at full size, standing on the amber and out of the drop's top. A score sticking out of the vessel that is meant to be it reads as broken.

Now one rule sizes the tally, with or without a bonus: the largest dot spacing at which it fits inside its room (the whole drop, or the part above the amber layer), clamped between the smallest readable spacing and its in-play spacing. Once settled, the drop is never smaller than the radius that holds its figures at that smallest spacing: the tally alone, or the tally above and the bonus figure inside the amber. The settled radius is the larger of its true radius and that minimum.

## Considered options

- **Shrink the tally without a floor**: the drop's area stays exactly the score, but a short run's score becomes an unreadable smudge.
- **Let a tiny drop's tally stick out**: keeps both the area and the size honest, but is the broken look this fixes.
- **Enlarge the settled drop to a minimum** (chosen): the figure always fits readably, at the cost of the drop's area overstating tiny scores.

## Consequences

- "The drop's area follows the tally" no longer holds for tiny scores once settled. This is deliberate; don't "fix" it back. The catches' own drops are still sized by what they were worth, so the last catch never lands looking larger than it was, and the replay stays true to the run.
- During the pour the drop has no minimum. While it is too small to hold the tally readably, the tally stays at the smallest spacing and its dots outside the drop are drawn in the drop's colour.
- During the pour the tally is fitted as the final score's figure, not the one it shows, so its size follows the drop and does not jump as a digit is added (99 to 100). A small early figure, narrower than the final one, therefore stays at the smallest spacing and spills a little longer than it needs to. This is deliberate.
- A run without a combo bonus whose last catch's drop is below the minimum swells to it over POUR_RISE_MS after settling, and takes that much longer to rest. Any other run settles exactly as before. With a bonus, the existing bonus swell covers the minimum, so there is one swell, not two.
- The shell scales the tally by the same eased radius it draws the drop at, so figure and vessel move together.
- The pour's slot is sized for the enlarged settled drop, so it still fits between the clock and the best row.
