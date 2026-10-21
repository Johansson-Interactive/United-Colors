#!/usr/bin/env bash
# Measure the bench run: a late run that plays itself the same way every time (see
# src/application/bench.ts), so play can be compared build against build.
#
# Usage (from the repo root, phone unlocked, a bench build installed; to compare two builds, use
# scripts/android-ab-bench.sh, which runs this):
#
#     scripts/android-bench.sh <label>
#
# Build a bench build with scripts/android-bench-build.sh and install it with `adb install -r`
# (steady holds 60 dots; drips keeps a drip forming on the walls: see src/application/bench.ts).
#
# It replaces the installed app with one that starts the run by itself and never ends it; a
# normal build (`pnpm android`) puts the game back. Play Protect may ask about uploading the
# app for a scan the first time: answer on the phone, then rerun.
#
# Launches the app, lets the run fill the screen for 35 s, records 15 s with
# scripts/android-perf-trace.sh, and summarizes the trace with Perfetto's trace_processor when
# it is found (TRACE_PROCESSOR, PATH or ~/.local/perfetto): https://perfetto.dev/docs/analysis/trace-processor
# It stops, rather than measuring, if the phone is or becomes locked, or the app dies.
set -euo pipefail

LABEL=${1:?usage: scripts/android-bench.sh <label>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/android-phone.sh"

phone_ready
adb shell am force-stop "$PACKAGE"
adb logcat -b all -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "filling the screen (35 s)..."
measure_for 35
# A bench build logs "[bench]" every few seconds once its run has started
if ! adb logcat -d | grep -q '\[bench\]'; then
	echo "no [bench] log: the installed app is not a bench build (was EXPO_PUBLIC_BENCH set when it was built?)" >&2
	exit 1
fi
"$ROOT/scripts/android-perf-trace.sh" "$LABEL" 15 | grep -E '^(device|display|thermal|trace):'

echo "UI runtime (last reports):"
adb logcat -d | grep -o '\[bench\].*' | tail -3 | sed 's/^/  /'
still_measuring

TP=$(find_trace_processor)
if [ -z "$TP" ]; then
	echo "trace_processor not found; open the trace at https://ui.perfetto.dev" >&2
	exit 0
fi
TRACE=$(ls -t "$ROOT"/traces/"$LABEL"-*.pftrace | head -1)
echo
echo "game frames (main thread):"
"$TP" -q "$ROOT/scripts/perf/frames.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
echo "main-thread waits in the animation phase, by waker (hades = Hermes GC):"
"$TP" -q "$ROOT/scripts/perf/gc-waits.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
echo "buffer handoffs from the main thread, and frames by start in SurfaceFlinger's period:"
"$TP" -q "$ROOT/scripts/perf/buffer-queue.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
echo "main thread in the animation phase, by core (0-3 little, 4-6 big, 7 prime):"
"$TP" -q "$ROOT/scripts/perf/main-thread-cores.sql" "$TRACE" 2>/dev/null | sed 's/^/  /'
