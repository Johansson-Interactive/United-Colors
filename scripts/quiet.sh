#!/bin/sh
# Run a check and print its output only when it fails; a pass is one line. Keeps `pnpm verify`
# readable where a tool is chatty on success (react-doctor prints a page of guidance either way).
# Usage: scripts/quiet.sh <name> <command...>
name=$1
shift
if out=$("$@" 2>&1); then
	echo "✔ $name"
else
	status=$?
	printf '%s\n' "$out"
	exit "$status"
fi
