#!/usr/bin/env bash
# Compare two bench builds on the phone, the way a result holds up: back to back, on the same
# evening, from the same temperatures. The phone drifts over a session by more than many
# changes move frame times, so a build is only judged against a control benched right beside it.
#
# Usage (from the repo root, phone unlocked and on USB):
#
#     scripts/android-ab-bench.sh <control.apk> <candidate.apk>
#
# Make each APK with scripts/android-bench-build.sh, the control from the commit before the
# change (a separate worktree keeps both at hand). Labels come from the file names.
#
# For each build in turn: installs it and checks the installed APK's md5 against the file,
# runs two short benches (scripts/android-bench.sh), then five minutes of play from a cool start
# (scripts/android-heat.sh --cool), since short runs start cool and understate late play.
# Compare the two builds' UI runtime reports (B/frame and GCs) and frame summaries; traces are
# in traces/. Any locked phone, dead app or wrong install stops the run.
set -euo pipefail

CONTROL=${1:?usage: scripts/android-ab-bench.sh <control.apk> <candidate.apk>}
CANDIDATE=${2:?usage: scripts/android-ab-bench.sh <control.apk> <candidate.apk>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/android-phone.sh"

installed_md5() {
	adb shell md5sum "$(adb shell pm path "$PACKAGE" | head -1 | sed 's/package://' | tr -d '\r')" | cut -d' ' -f1
}

bench() {
	local apk=$1 label
	label=$(basename "$apk" .apk)
	local want
	want=$(md5 -q "$apk")
	if [ "$(installed_md5)" != "$want" ]; then adb install -r "$apk" >/dev/null; fi
	if [ "$(installed_md5)" != "$want" ]; then
		echo "the installed app is not $apk" >&2
		exit 5
	fi
	echo "== $label ($want)"
	phone_ready
	"$ROOT/scripts/android-bench.sh" "$label-a"
	"$ROOT/scripts/android-bench.sh" "$label-b"
	"$ROOT/scripts/android-heat.sh" --cool "$label-heat"
}

bench "$CONTROL"
bench "$CANDIDATE"
