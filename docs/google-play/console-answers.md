# Tiltling — Google Play Console preparation

Prepared 14 October 2026 from source revision `ce36c60`. These are proposed answers for the current Expo app, package `com.johanssoninteractive.tiltling`, version 1.0.0. They do not describe the legacy United Colors Android package. No Console settings have been submitted and no site has been deployed.

## Answers in the screenshot's order

| Console section (Swedish) | Proposed entry | Status / explanation |
| --- | --- | --- |
| Ange en integritetspolicy | Public HTTPS URL for `site/privacy.html` | Draft supplied. Create the support mailbox, confirm retention, publish, and add access inside the app. |
| Inloggningsuppgifter | All functionality is available without special access / Alla funktioner är tillgängliga utan särskild åtkomst | No accounts, login, membership, access codes, or geographic access restrictions found. No reviewer credentials needed. |
| Annonser | No, my app does not contain ads / Nej | No ad integration or advertising SDK found. |
| Innehållsklassificering | Complete IARC questionnaire as a game | See content evidence below; IARC assigns the actual regional ratings. |
| Målgrupp | Intended for everyone, including children | Include the intended child age groups as well as 13–15, 16–17 and 18+, and meet Families requirements. Assess whether the controls and design genuinely suit ages 5 and under; include that band only if intended and supported. Include 6–8 and 9–12 for the stated broad audience. |
| Datasäkerhet | Proposed: no user data collected or shared | Source supports local-only processing; verify the actual production bundle and all included SDKs before submitting. See below. |
| Myndighetsappar | No / Nej | Independent arcade game; not made by or on behalf of a government. Confirm publisher status. |
| Finansiella funktioner | My app doesn't provide any financial features | No banking, loans, investment, crypto, money transfers or financial advice. Selling a game does not itself make it a financial-services app. |
| Hälsa | My app does not have any health features | Motion is used as a controller, not health/fitness tracking. No Health Connect integration. |
| Välj en appkategori och ange kontaktuppgifter | App type: Game. Category: Arcade. | Proposed tags, if available: Arcade, Casual, Single player, Offline. Use only matching Console tags. Public support email required; website proposed below. Phone optional for the listing, separate from account-verification requirements. |
| Konfigurera butiksuppgifterna | Use `store-listing.md` | English and Swedish copy supplied; visual assets still needed. |
| Skapa ett säljarkonto | Required if selling the app / monetizing through Play | Owner must supply real legal identity, business/address, payment, bank and tax information requested by Console. These cannot be inferred from source. |
| Ange ett pris på appen | Paid (confirmed by owner) | No ads or in-app purchases currently. Choose a base price and review local pricing. Do not publish free as a temporary workaround: an app offered free cannot later become paid under the same package. |

The Swedish entries above describe the intended selections; wording may differ in the live Console.

## Content-rating evidence

Use your monitored support email for IARC contact. Select the game category in its questionnaire. Based on the current game, proposed answers are **No** for violence against human/animal characters, blood/gore, fear/horror, sexual content/nudity, offensive language, drugs/alcohol/tobacco, gambling/simulated gambling, real-money prizes, purchases/paid random items, user-generated content, user communication, location sharing, and unrestricted web browsing. Abstract dots merge, bounce and refuse a wrong-colour catch; there are no fighting characters or weapons. If a question explicitly includes abstract collisions as violence, follow its definition and describe that interaction rather than applying a blanket No.

A low age rating is plausible, but do not manually claim PEGI 3 or Everyone before the questionnaire generates it. Content suitability and intended target audience are different declarations. Colourful abstract artwork alone does not establish the intended audience.

## Data safety worksheet and evidence

Proposed top-level answer: **No** to collecting or sharing the required user data types. No account creation. No account-deletion URL is needed for an account feature that does not exist. Do not claim an independent security review, encryption certification, or Families commitment without meeting the relevant requirements. Follow the form's conditional questions rather than filling every hidden field with No.

| Data / capability | What source shows | Proposed disclosure treatment |
| --- | --- | --- |
| High score | `src/infrastructure/AsyncStorageRepository.ts`: local `@tiltling/high_score` | Local storage, no app-operated upload found. |
| Preferences | Same file: sound/music, tilt sensitivity, screen-up/down calibration | Local storage, no app-operated upload found. |
| Motion | `DeviceMotionAdapter.ts`: live orientation samples used for steering | Processed locally; no sensor-history upload or storage found. Saved calibration is a preference. |
| Other audio | `modules/other-audio`: boolean music activity check | No recording, track names, audio files or listening history accessed by this module. |
| Audio | Bundled music/effects; `app.json` blocks recording | No microphone recording feature. |
| Identity, location, contacts, ads, payments | No app integration found in source/dependencies | Do not declare collection solely because a broad library could support it. |
| Backups | Generated Android manifest has `allowBackup="true"` | Device/platform backup may copy local app data. Policy acknowledges this; verify release backup configuration. |

Google excludes exclusively on-device processing from Data safety collection declarations. This is a source review, not a traffic audit of a signed release. Check the production AAB's merged manifest, transitive SDKs and actual network behavior; repeat for any other active versions on covered Play tracks. A development client is not the release artifact. The generated local manifest includes INTERNET, legacy external-storage permissions and SYSTEM_ALERT_WINDOW; their presence alone neither establishes collection nor proves they are needed in production. Review the release manifest and remove unnecessary permissions through Expo configuration in a separate tested change if appropriate. `expo-updates` is disabled in the local generated manifest.

## Health permission correction

`expo-sensors` adds `android.permission.ACTIVITY_RECOGNITION` through its library manifest. The app now blocks this permission in `app.json`; tilt steering retains `HIGH_SAMPLING_RATE_SENSORS`. Expo config introspection confirms a manifest removal directive. Build and upload a new AAB with a higher version code, verify the final merged permissions and test tilt on an Android device. The existing uploaded bundle still has the permission until replaced. Do not select “Övrigt” as a workaround for the warning: Tiltling has no health features.

## Publishing locations

Recommended on your existing domain, hosted on Vercel: `https://johanssoninteractive.com/tiltling/`, with `/tiltling/privacy.html` and `/tiltling/support.html`. Upload the supplied static pages under a `tiltling/` directory in a static site project and configure the domain. This keeps policy links stable if the repository moves. These are proposed paths, not existing URLs. A Vercel account/site has not been configured.

Repository-based alternative: GitHub Pages for `Johansson-Interactive/United-Colors`. If Pages is available for this repository and no custom domain is configured, a project site would normally be under `https://johansson-interactive.github.io/United-Colors/`. Publish the contents of `site/` as the Pages artifact; proposed URLs then end in `/privacy.html` and `/support.html`. Do not paste these into Console before they actually work. Keep the source policy in this repository, but do not use an editable document, a repository editor URL or a PDF as the policy destination.

The supplied HTML pages have no scripts, remote fonts, or analytics. The owner is Fredrik Johansson, using the name Johansson Interactive, with a personal Play developer account. The proposed public mailbox is `support@johanssoninteractive.com`; create and monitor it before publishing. Use the actual personal account identity for verification and merchant setup, not an invented company entity. The support-retention period is an explicit proposed practice, not a verified existing business process; accept it or update it to match actual practice. Hosting and email providers may process visitor/request information under their own practices; choose those providers before finalizing the policy.

Suggested initial release countries: Sweden for a small first rollout, then the UK and other English-language markets after testing and support readiness. This is a rollout proposal, not a technical restriction or a legal determination. Country availability, pricing and any regional obligations remain owner decisions.

## Remaining release work

1. Create `support@johanssoninteractive.com`; confirm the youngest intended age band, base price and rollout countries. Paid distribution and a broad audience including children are confirmed.
2. Finalize and publish the privacy/support pages; verify public HTTPS access without login or geographic restrictions.
3. Add a clearly labelled Privacy policy link or full text within the app (for example, an About/settings view reachable from the title screen). No such access was found. This preparation does not modify game behavior.
4. Check the actual production artifact's permissions, backup behavior, SDKs and network behavior against the declarations.
5. Export the store icon and feature graphic, and capture real Android screenshots as described in `store-listing.md`.
6. Enter the declarations and complete IARC. Review generated ratings and the Data safety preview before submission.
7. Complete any account verification, testing or production-access tasks shown elsewhere in Console; these are not visible in the supplied screenshot.

## Confirmed owner decisions

Fredrik Johansson is the developer; Johansson Interactive is the trading/brand name, not a confirmed incorporated company. The Play developer account is personal. Tiltling will be paid and is intended for everyone, including children. No purchase price has been selected. The domain `johanssoninteractive.com` is available to the owner; a website and the proposed mailbox still need to be created. The privacy policy uses a proposed 12-month support retention period, which must be adopted or revised before publication. Set its effective date to the actual publication date.

## Official references

- [User Data and privacy-policy requirements](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Data safety definitions and form](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Target audience and content](https://support.google.com/googleplay/android-developer/answer/9867159?hl=en)
- [Content ratings](https://support.google.com/googleplay/android-developer/answer/9898843?hl=en)
- [Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en)
- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [App pricing and free/paid changes](https://support.google.com/googleplay/android-developer/answer/6334373?hl=en)
- [Store listing setup](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)

- [Google Play Families requirements](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
