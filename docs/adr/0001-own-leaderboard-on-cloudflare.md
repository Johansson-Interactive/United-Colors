# Own leaderboard on a Cloudflare Worker, not platform leaderboards

The legacy Android app used Google Play Games leaderboards. The remake instead runs its own leaderboard: a Cloudflare Worker with D1, in this repo, which shares the domain's score ceiling and scoring version. We chose this so iOS and Android players share one list, nobody has to sign in to a platform account, and the board can be drawn in the game's own dot style instead of the stock system screens.

## Consequences

- Anyone can post any score. The Worker only checks plausibility, plus rate limits: catches must fit the run's length, and the score must fit those catches when no combo is longer than the reported longest combo (itself capped). The ceiling is a pure function in `src/domain`, so a scoring change updates game and Worker together. We accept that a determined cheater can post a believable score. Full replay verification was considered and left out.
- Players are anonymous installs identified by a Tag. A reinstall means a new identity, and moderation is done by hand in the D1 console.
