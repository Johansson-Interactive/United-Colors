#!/usr/bin/env bash
# Measure sustained play: the bench run for five minutes, with the phone's temperatures before
# and after, then a 15 s trace. Start each run from the same temperatures, or the comparison
# says nothing; with --cool it waits until every CPU is at or below 34 °C and the skin at or
# below 33 °C, then waits for the phone to be unlocked (it may lock while it cools).
#
# Usage (from the repo root, phone unlocked, a bench build installed):
#
#     scripts/android-heat.sh [--cool] <label>
#
# The temperatures come from "Current temperatures from HAL" in dumpsys thermalservice; the
# block above it, "Cached temperatures", only changes when a threshold is crossed and can be
# minutes old. The app is stopped at the end, because a bench build keeps drawing behind the
# lock screen and would heat the phone through a cool-down. Like android-bench.sh, it stops if
# the phone locks or the app dies during play.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/android-phone.sh"
COOL=0
if [ "${1:-}" = "--cool" ]; then
	COOL=1
	shift
fi
LABEL=${1:?usage: scripts/android-heat.sh [--cool] <label>}
PLAY_S=${PLAY_S:-300}

hal_temps() {
	adb shell dumpsys thermalservice | sed -n '/Current temperatures from HAL/,/Current cooling/p'
}

temps() {
	adb shell dumpsys thermalservice | grep -m1 "Thermal Status" | tr -d '\r'
	hal_temps | grep -oE "mValue=[0-9.]+, mType=[0-9], mName=(CPU[0-9]|GPU0|skin|battery)" |
		sed 's/mValue=//; s/, mType=[0-9], mName=/ /' | sort -k2 | awk '{printf "%s %s °C  ", $2, $1} END {print ""}'
}

if [ "$COOL" = 1 ]; then
	adb shell am force-stop "$PACKAGE"
	while true; do
		T=$(hal_temps)
		CPU=$(echo "$T" | grep -oE "mValue=[0-9.]+, mType=0, mName=CPU" | grep -oE "[0-9]+(\.[0-9]+)?" | sort -n | tail -1)
		SKIN=$(echo "$T" | grep -oE "mValue=[0-9.]+, mType=3, mName=skin" | grep -oE "[0-9]+(\.[0-9]+)?" | head -1)
		echo "$(date +%T)  hottest CPU $CPU °C, skin $SKIN °C"
		[ "$(echo "$CPU <= 34 && $SKIN <= 33" | bc)" = 1 ] && break
		sleep 60
	done
	echo "cool enough"
	wait_unlocked
fi
phone_ready

echo "before:"
temps
adb shell am force-stop "$PACKAGE"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "playing (${PLAY_S} s)..."
measure_for "$PLAY_S"
echo "after:"
temps
"$ROOT/scripts/android-perf-trace.sh" "$LABEL" 15 | grep -E '^(thermal|trace):'
still_measuring
adb shell am force-stop "$PACKAGE"

TP=$(find_trace_processor)
if [ -z "$TP" ]; then
	echo "trace_processor not found; open the trace at https://ui.perfetto.dev" >&2
	exit 0
fi
TRACE=$(ls -t "$ROOT"/traces/"$LABEL"-*.pftrace | head -1)
echo "game frames (main thread):"
"$TP" -q "$ROOT/scripts/perf/frames.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
echo "main thread in the animation phase, by core (0-3 little, 4-6 big, 7 prime):"
"$TP" -q "$ROOT/scripts/perf/main-thread-cores.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
