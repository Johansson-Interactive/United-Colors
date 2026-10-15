#!/usr/bin/env bash
# Measure the bench run: a late run that plays itself the same way every time (see
# src/application/bench.ts), so play can be compared build against build.
#
# Usage (from the repo root, phone unlocked, a bench build installed):
#
#     scripts/android-bench.sh <label>
#
# Build and install a bench build with:
#
#     EXPO_PUBLIC_BENCH=1 pnpm exec expo run:android --variant release --device
#
# It replaces the installed app with one that starts the run by itself and never ends it; a
# normal build (`pnpm android`) puts the game back. Play Protect may ask about uploading the
# app for a scan the first time: answer on the phone, then rerun.
#
# Launches the app, lets the run fill the screen for 35 s, records 15 s with
# scripts/android-perf-trace.sh, and summarizes the trace with Perfetto's trace_processor when
# it is on PATH (or TRACE_PROCESSOR points at it): https://perfetto.dev/docs/analysis/trace-processor
set -euo pipefail

PACKAGE=com.johanssoninteractive.tiltling
LABEL=${1:?usage: scripts/android-bench.sh <label>}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

adb shell am force-stop "$PACKAGE"
adb logcat -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "filling the screen (35 s)..."
sleep 35
"$ROOT/scripts/android-perf-trace.sh" "$LABEL" 15 | grep -E '^(device|display|thermal|trace):'

echo "UI runtime (last reports):"
adb logcat -d | grep -o '\[bench\].*' | tail -3 | sed 's/^/  /'

TP=${TRACE_PROCESSOR:-$(command -v trace_processor || true)}
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
