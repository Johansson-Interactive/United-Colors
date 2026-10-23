# A second touch soon after an early lift opens the pause whole

Closed testers found that tapping the field over and over slows the game down. Each touch freezes the run at once (ADR 0008), and an early lift keeps it frozen while the portal drains, faster than it grew. A tapper landing for 100 ms every 200 ms keeps the run frozen about 140 ms in every 200: play in slow motion, with time to dodge refusals and line up combos. A finger landing again before the portal had drained picked the hold back up where it left off, so tapping never had to commit to anything.

Now a finger landing again within a second of an early lift opens the pause whole. The bloom plays out to the walls as the dev pause dot's does, held or not, and lifting no longer drains it. If the portal is still draining, it grows again from where it is; once it has closed and play has gone on, a new portal opens under the finger. The run stays frozen until an early lift's portal has fully closed, as before. A tapper now gets one short freeze a second, and the next tap lands in the pause.

## Considered options

- **Only the drain counts**: a finger landing while the portal still drains opens the pause whole, and nothing after. Rejected: a short tap drains in about 40 ms, so a fast tapper is past the drain long before the next tap.
- **A slower drain over live play**: play resumes at the lift and the portal drains for about a second, so the shrinking portal shows how long a second touch commits. Rejected: the run must stay frozen until the portal has closed, and a longer frozen drain only hands a tapper more freeze.
- **A mark that shows the second**: a small ring of the rim lingering at the fingertip and fading out. Rejected as a second element doing what the portal already does; the second is not drawn.
- **Keep the slip grace**: a slip would resume the hold, but it is the same landing as a tap. Dropped; a slipping finger was pausing anyway, and now it gets the pause.
- **A second touch within a second opens the pause whole** (chosen).

## Consequences

- The slip grace from ADR 0008 is gone: landing again during the drain commits to the pause instead of picking up the hold.
- The second is not drawn. A brush followed by a real touch lands in the pause without a sign that it would; that touch was meant to pause anyway. "Touch to pause" keeps its rule.
- The second counts from the lift, in wall time, through the frozen drain and on into play. It ends early with the run, on leaving the app (which lands on the pause anyway), and on a resume through Get ready. A finger in the grip band still does nothing.
- Open to tuning on a device: the second.
