#!/bin/sh
# SessionStart: pin every agent shell to the Node in .nvmrc. Claude Code sources $CLAUDE_ENV_FILE
# before each Bash command; those shells carry fnm's PATH but not its variables, so the line
# evaluates `fnm env` before switching. Without fnm (CI, other machines) it does nothing.
[ -n "${CLAUDE_ENV_FILE:-}" ] || exit 0
command -v fnm >/dev/null 2>&1 || exit 0
cat >>"$CLAUDE_ENV_FILE" <<'LINE'
eval "$(fnm env --version-file-strategy=recursive)" && fnm use --silent-if-unchanged >/dev/null 2>&1
LINE
