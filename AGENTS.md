# AGENTS.md

Agent operating guide for this repository. Follow this file first, then user/developer instructions.

## Do / Don't

Do:
- Keep changes small, scoped, and reversible.
- Enforce strict Separation of Concerns (SoC): `domain`, `application`, `infrastructure`, `presentation`.
- Keep `domain` pure TypeScript with no React/Expo/platform imports.
- Add or update tests for behavior-changing logic.
- Run quality checks before finishing work.
- Follow the **react-native-best-practices** skill (`.cursor/skills/react-native-best-practices/SKILL.md`) when working on presentation, performance, or platform-specific code.

Don't:
- Mix game rules into UI components.
- Add unapproved dependencies or change locked versions.
- Introduce ESLint/Prettier; use Biome only.
- Perform broad rewrites when targeted edits are enough.
- Assume behavior details when legacy code can verify them.

## Locked Stack

Use exactly:
- Expo `57`
- React Native `0.86`
- React `19.2.3`
- TypeScript `6.0.3`
- Node `24.21.0`
- pnpm `10.34.6` via Corepack

Repository requirements:
- `.nvmrc` must be `24.21.0`.
- `package.json` must include:
  - `"engines": { "node": "24.21.0", "pnpm": "10.34.6" }`
  - `"packageManager": "pnpm@10.34.6"`

## Setup and Command Conventions

Full-project commands:
- `corepack enable`
- `nvm use` (or install/use Node `24.21.0`)
- `pnpm install`
- `pnpm typecheck` — TypeScript check only
- `pnpm lint` — Biome lint (check)
- `pnpm lint:fix` — Biome lint with auto-fix
- `pnpm format` — Biome format (check)
- `pnpm format:fix` — Biome format with auto-fix
- `pnpm preflight` — typecheck + lint + format (run before PR)
- `pnpm test`

File-scoped commands (preferred while iterating):
- `pnpm biome check <path>` or `pnpm lint:fix` for full project
- `pnpm biome format --write <path>` or `pnpm format:fix` for full project

Before opening a PR, run `pnpm preflight && pnpm test` (or full-project checks above).

## Architecture and Boundaries

Target structure:
- `src/domain`: entities, rules, simulation, collision, scoring (pure TS)
- `src/application`: orchestration, app/game flow use-cases, store wiring
- `src/infrastructure`: sensor/audio/storage/clock adapters
- `src/presentation`: React Native screens/components, Skia rendering, overlays
- `src/app`: bootstrap, providers, composition root

Boundary rules:
- `presentation` may depend on `application` contracts, never domain internals.
- `infrastructure` implements interfaces owned by `application`/`domain`.
- `domain` must be deterministic and testable without device APIs.

## Product Constraints

- Platforms: Android + iOS day one.
- Behavior parity first.
- Keep kiosk mode.
- Gyro-only controls in v1.
- No online leaderboard in v1.
- Persist high score + settings.
- Portrait only.
- New app IDs/store listings (no legacy release continuity).

## Testing and Quality Gates

Minimum expected checks:
- Unit tests for state transitions, collisions, spawn progression, bounds, persistence roundtrip.
- TypeScript strict pass.
- Biome lint + format checks pass.

If behavior changes, update/add tests in the same change.

## Safety and Change Hygiene

- Prefer reading legacy behavior from `origin/master` over guessing.
- Document assumptions in PR notes or handoff summary.
- Avoid destructive commands unless explicitly requested.
- Never commit secrets or machine-local paths.

## Skills

Agents should read and follow the relevant skill file before starting work that falls within its scope.

| Skill | Path | When to use |
|-------|------|-------------|
| react-native-best-practices | `.cursor/skills/react-native-best-practices/SKILL.md` | Presentation-layer work, FPS/TTI/bundle-size optimization, animation jank, memory leaks, native module integration, profiling. |

## When Stuck

- Stop and state the blocker clearly.
- Provide 1-2 concrete options with tradeoffs.
- Default to the smallest safe step that preserves parity and SoC.
