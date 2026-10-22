# The playing field is the same on every phone: 9:16, eight player widths across, at the bottom of the screen

The field used to be the whole screen, measured in dp, with the dots a fixed size in dp. A tall, wide phone therefore had more room than a small one: a 430 x 885 field holds about 8.6 x 17.7 player widths, a 375 x 647 one about 7.5 x 12.9, and the dots take longer to cross the larger one. With a shared leaderboard (ADR 0001) that is an advantage you buy with a device. Now the playing field is a fixed portrait 9:16 box in game units, 400 x 711 1/9 (the player is an eighth of the width), and every phone shows that same field scaled to fit: the largest 9:16 box the screen holds, on its bottom edge and centred side to side, with any height left over black above it. Every dot size, speed and the tilt speed are in those units, so the field holds the same number of dots on every phone.

## Considered options

- **Fill the screen, as before**: the most immersive, but the device decides the room. Rejected.
- **A fixed number of player widths across, height whatever the screen gives**: still gives tall phones more room down. Rejected.
- **Centre the box vertically**: splits the spare space into two strips. Rejected for the bottom edge, nearest the thumbs, with one strip at the top beside the notch, which is black anyway.
- **One fixed corner shape for every phone**: the corners would be identical physics everywhere. Rejected: the corners follow the phone's glass, on all four corners of the box, scaled into game units. It looks right and the effect on play is small.

## Consequences

- On most phones the field is about 13% shorter than the old full-screen field, so play is more crowded; difficulty is retuned from play tests afterwards.
- Everything the game draws, menus and HUD included, lives in the field and scales with it. The grip band (ADR 0008) is the exception: it is about the hand on the glass, so it stays 24 dp of real screen.
- Nothing system-drawn covers the field: the status bar is hidden, Android stays immersive, and the iOS home indicator auto-hides.
- A resize mid-run (a foldable opening) only rescales the field; the run does not notice.
- Personal bests from the old field are kept. Tilt sensitivity remains a player setting. Sensor sample rate and display refresh are not equalised.
