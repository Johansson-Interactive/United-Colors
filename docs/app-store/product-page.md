# Tiltling — App Store Connect product page

Prepared 21 October 2026 for the first release, version 1.0.0, bundle `com.johanssoninteractive.tiltling`. The copy reuses the Google Play listing (`docs/google-play/store-listing.md`) so both stores speak in one voice, with one difference: the App Store's primary language is English (U.S.), so the English copy here spells "color". Every length below was counted. Apple counts keywords in bytes, so the Swedish å, ä and ö count twice.

All graphics are in `assets/app-store/`, composed by `python3 scripts/app-store-assets.py` from captures of the capture build on an iPhone 16 Pro simulator (see "Captures" below). Rerun it after replacing a capture or changing a caption.

## App Information (app-level, not per version)

| Field | Entry |
| --- | --- |
| Name (30) | **Tiltling** (8) |
| Subtitle (30) | en: `Tilt to steer a hungry dot` (26) · sv: `Luta mobilen, mata pricken` (26) |
| Primary category | Games → Arcade; secondary category Games → Casual |
| Content rights | No third-party content (the music and sounds are synthesised by our own scripts) |
| Age rating | Answer the questionnaire: none of the content items apply. Expect 4+, but let the questionnaire assign the rating rather than claiming one. |
| Privacy Policy URL | `https://johanssoninteractive.com/tiltling/privacy` (live, 200) |
| App Privacy | Data Not Collected: the high score, settings and calibration stay on the device (see `docs/google-play/console-answers.md`) |

## Product Page Information (per version)

### English (U.S.)

**Promotional text** (145 of 170; you can edit it at any time without a new version):

> Tilt your phone to steer Tiltling, a hungry little dot that only eats its own color. One wrong bite and the run is over. How far can you take it?

**Description** (about 1,150 of 4,000): the English description from `docs/google-play/store-listing.md` with its three spellings changed, which gives:

> Meet Tiltling, a small, hungry dot that goes where your phone tilts. It only eats dots of its own color.
>
> Tiltling is a picky eater. Here is how dinner goes:
>
> GULP. Small dots drip from the walls and bounce across the playfield. Steer Tiltling into the ones that match its color.
>
> PTOO! Touch a dot of any other color and Tiltling spits it out. That is the end of the run.
>
> SWITCH. Now and then a large, pulsing point dot appears. Tiltling eats any of those, but takes on the color of what it ate. Rethink your next move at once.
>
> COMBO. Feed it in quick succession and the combo grows, with every catch paying more than the last.
>
> As the playfield fills up, every tilt counts. How far can you take Tiltling?
>
> Everything is a dot: every control, every letter, every score.
>
> • Tilt controls in three speeds, calibrated to however you like to hold your phone
> • Colorful, fluid animation in a dot-matrix style
> • Original music, sound effects and haptic feedback
> • Separate music and sound settings
> • Your best score and settings saved on your device
> • Offline single-player game: no account, no ads, no in-app purchases
>
> Designed for portrait play on a phone with motion sensors.

**Keywords** (97 of 100 bytes):

```
gyro,gyroscope,arcade,color,colour,ball,balance,reflex,motion,offline,casual,bounce,accelerometer
```

The words "tilt", "steer", "hungry" and "dot" are already in the name and subtitle, so they're left out here. Apple indexes those fields too, and repeating a word gains nothing. Both spellings of colour stay in, for the searches of the UK and the rest of the Commonwealth.

### Svenska

**Reklamtext** (141 tecken, 146 byte):

> Luta mobilen och styr Tiltling, en hungrig liten prick som bara äter sin egen färg. En fel tugga och rundan är över. Hur långt kan du ta den?

**Beskrivning**: the Swedish full description from `docs/google-play/store-listing.md`, word for word.

**Nyckelord** (91 of 100 bytes):

```
gyro,gyroskop,arkad,färg,färger,boll,balans,reflex,rörelse,offline,studs,lutning,prickar
```

### Shared fields

| Field | Entry |
| --- | --- |
| Support URL | `https://johanssoninteractive.com/tiltling/support` (live, 200) |
| Marketing URL | `https://johanssoninteractive.com/tiltling` (live, 200) |
| Version | `1.0.0` (matches `app.json`) |
| Copyright | `2026 Fredrik Johansson` (Apple's format is year then owner, without ©; the owner is the personal developer account) |
| What's New | Not shown for a first version. Save `The first release of Tiltling.` / `Första versionen av Tiltling.` for later. |
| Routing app coverage file | None |

## Screenshots

Apple accepts 1 to 10 screenshots per display size and language, as JPEG or PNG without alpha. The app is iPhone-only (`supportsTablet: false`), so iPad slots don't apply. Nine are made, in `assets/app-store/screenshots/<locale>/<size>/`:

| Slot in App Store Connect | Folder | Size | Status |
| --- | --- | --- | --- |
| iPhone with Dynamic Island, **medium** display | `medium/` | 1206 × 2622 | **Required.** The only iPhone size Apple's spec names as required. Captured at 1:1 on the iPhone 16 Pro simulator. |
| iPhone with Dynamic Island, large display | `large/` | 1290 × 2796 | Optional; the medium set scaled up (the aspects differ by a third of a percent). Upload it too, since Apple doesn't say whether the medium set is scaled *up* for larger phones. |
| All smaller iPhone slots | — | — | Scaled down from the sets above by App Store Connect |

Each shows a capture whole, with the Dynamic Island's black band and the home indicator taken off, in a rounded pane lit from behind in Tiltling's colour, under the word the game would say (in its own dot-matrix alphabet) and one line in the system font. Up to three show side by side in search results, so the first three tell the rules; the menus come last.

| # | Capture | en-US caption | sv-SE caption |
| --- | --- | --- | --- |
| 1 | Play, score 128: Tiltling stretching into a pink dot | GULP · Steer Tiltling into dots of its own color | SMASK · Styr Tiltling till prickar i sin egen färg |
| 2 | The refusal at 158: the spat-out dot and the shockwave | PTOO! · One wrong bite and the run is over | PTOO! · En fel tugga och rundan är över |
| 3 | A point dot caught at 106: the blue ring, the player turning blue | SWITCH · Point dots: it eats any, then takes their color | NY FÄRG · Poängprickar äter den alltid, och byter färg |
| 4 | A combo at 129: amber score and amber ring | COMBO · Quick bites pay more, catch after catch | KOMBO · Snabba tuggor ger mer för varje fångst |
| 5 | Game over, 1:45: the drop holding 158 with its 42 of combo bonus, NEW BEST! | AGAIN? · How far can you take Tiltling? | IGEN? · Hur långt kan du ta Tiltling? |
| 6 | Title, best 158, pink play dot | TILT · A small, hungry dot that goes where you tilt | LUTA · En liten, hungrig prick som åker dit du lutar |
| 7 | Speed view | YOUR SPEED · Slow, normal or fast. Tilt to feel each one. | DITT TEMPO · Långsam, normal eller snabb. Luta och känn efter. |
| 8 | Calibrate, the ring closing on the settling dot | YOUR GRIP · Level is however you like to hold your phone | DITT GREPP · Plant är precis som du vill hålla mobilen |
| 9 | Paused at 5, the frosted field | BREATHE · Pause, and the field frosts over until you’re level | ANDAS · Pausa, så frostar planen över tills du håller plant |

Alt text, if App Store Connect asks (it rarely does for screenshots): describe the capture column above.

### Captures

The captures in `assets/app-store/captures/` come from the **capture build**: `EXPO_PUBLIC_CAPTURE=1 pnpm expo run:ios --configuration Release --device <udid> --no-bundler` on an iPhone 16 Pro simulator (iOS 18.3). In it the pilot (`src/application/pilot.ts`) steers the player from what the frame shows, so the simulator, which has no motion sensor, plays real runs with the game's own rules, spawning and scoring; the menus are reached by tapping. Play moments are frames of a recording of one run (`xcrun simctl io booted recordVideo --codec h264`, 1206 × 2622), picked by hand; the menus are plain `simctl` screenshots. The run behind shots 1–5 scored 158 in 1:45.

### iPhone Duo (new)

- Sizes: outer display 1398 × 2034, inner display 2007 × 2853 (portrait).
- **Optional today.** Apple: "Starting in April 2027, screenshots will be required for any app using the iOS 27.1 SDK or later." No other size is scaled into the Duo slot.
- Uploading them puts an "optimized for iPhone Duo" badge on the product page. Leave them out of 1.0: the game is portrait-only, and its playfield hasn't been checked on the inner display, which is close to square at about 0.70. First run the game on a Duo simulator. If the playfield fills the screen properly, run the capture build there, and add the shots in a later version, before you move to the iOS 27.1 SDK.

## App preview

`assets/app-store/preview/preview-iphone.mp4`: 30 seconds of the recorded run, from 1:26 to 1:56 of the recording, so it holds a combo, a colour switch, the refusal, the game over's pour and NEW BEST!, with the game loop underneath, fading out. Cut by `scripts/app-store-preview.sh /tmp/run1.mp4 86 30`.

- 886 × 1920 portrait, 30 fps, H.264 High 4.0 at about 5.6 Mbps (20 MB; Apple's 10–12 Mbps is a target, not a floor, and the dark field needs no more), AAC 256 kbps stereo.
- Upload it to the same iPhone slot as the screenshots; App Store Connect scales previews for other sizes. Up to three previews are allowed per size and language; they play before the screenshots, muted, and up to three can appear in search results.
- `preview-iphone.png` next to it is the frame at 5 seconds, Apple's default poster frame. Pick a poster frame in App Store Connect if you prefer another moment.
- It shows the whole screen as the device shows it, the black band of the Dynamic Island and the home indicator included. That is how the game looks in hand; a cropped preview would have lost 50 px of playfield on each side.
- Processing can take up to 24 hours after upload.

## Header and Search Results (the new "New Ways to Market Apps")

Apple launched Creative Assets on 5 October 2026 and added a new review guideline, 2.3.14, on 16 October. They appear only on **iOS 27 / iPadOS 27 and later**. They are **optional**, and they add to the screenshots and previews rather than replace them.

| Placement | Image | Video |
| --- | --- | --- |
| Product page header | 21:9, 3840 × 1646 (JPEG/PNG), or 16:9, 5244 × 2950 (PNG only) | 21:9, 3840 × 1646, 30/60 fps, 5–30 s, `.mov`/`.m4v`/`.mp4`. Muted by default, the user can unmute, loops |
| Search results | 3:2, 1920 × 1280 up to 3840 × 2560 (JPEG/PNG), or 16:9, 5244 × 2950 (PNG only) | 3:2, same sizes, 30/60 fps, 5–30 s. Always muted, loops |

- **One asset for both placements:** only a *universal* asset can serve both, and the only universal image size is **16:9, 5244 × 2950 PNG**, with no alpha. Upload it as the header, then tick "Use header asset in search results".
- **Without a search asset**, search results show in-app events, app previews and screenshots as before.
- **Rules (2.3.14 and Apple's best practices):** the asset must relate to the app or brand and be suitable for 4+, even if the app's rating is higher. Leave out prices, URLs, © symbols, other platforms or stores, Apple awards and unverifiable claims. Text is optional; if you use it, keep it to a short phrase and localise it. Keep the focal point centred and the key elements inside the safe area, because the same asset is cropped for iPhone, iPad and both orientations. Check it with the Preview button in App Store Connect, which also covers Dark Mode.
- **First release:** while no version has been approved, a creative asset can only be reviewed **in the same submission as 1.0**. After approval, you can submit assets standalone from the Asset Library and publish them to the live version without a new build.

**Decision: launch with the header.** `assets/app-store/header.png` (en-US) and `header-sv-SE.png` are universal 16:9 PNGs at 5244 × 2950, 24-bit, no alpha: the name in the game's alphabet, one colour per letter, over the deep blue-violet of the Play feature graphic with the three colours glowing in from the edges, Tiltling about to gulp a pink dot on the left and a point dot waiting on the right, with the tagline beneath. Everything that matters sits inside the middle 3:2 and 21:9 of the canvas, so both of the App Store's crops keep it. In App Store Connect: version page → Product Page Information → Header and Search Results tab → Upload the header, choose the matching localisation, tick "Use header asset in search results", then Preview it on iPhone in both appearances before submitting with 1.0.

## Not on the product page, but needed for submission

- Pricing: paid, with the price tier still to be chosen (same open decision as on Play).
- Export compliance: already answered in the binary (`ITSAppUsesNonExemptEncryption: false`).
- App Review information: contact name, phone and email. Sign-in isn't required. Notes: "Steer by tilting the device; a simulator without motion falls back to tap."
- A production build uploaded through EAS (`eas build -p ios --profile production`, then `eas submit`) and selected under Build. The capture build is never shipped: `EXPO_PUBLIC_CAPTURE` is unset in EAS.

## Sources

- [Apple Newsroom, June 2026: Creative Assets announcement](https://www.apple.com/newsroom/2026/06/apple-expands-app-store-capabilities-to-help-developers-grow-and-reach-new-users/)
- [Apple Developer News, 5 Oct 2026: Showcase your apps with new assets](https://developer.apple.com/news/?id=ljpl7kyn)
- [Creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications)
- [Manage your App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets)
- [Asset best practices](https://developer.apple.com/app-store/asset-best-practices/)
- [App Review Guidelines (2.3.14)](https://developer.apple.com/app-store/review/guidelines/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) · [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/) · [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/)
- Third party: [Adapty](https://adapty.io/blog/app-store-asset-library/), [MUBBITS](https://mubbits.com/blog/app-store-product-page-headers-search-creatives), [AppScreens (Duo sizes)](https://appscreens.com/app-store-screenshot-sizes)
