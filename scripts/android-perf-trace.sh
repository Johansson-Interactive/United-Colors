#!/usr/bin/env bash
# Record an Android performance trace of Tiltling, for before/after comparisons.
#
# Usage (from the repo root, with the phone unlocked and the scenario already on screen):
#
#     scripts/android-perf-trace.sh [label] [seconds]
#
#   label    names the output file (default: trace)
#   seconds  how long to record (default: 15)
#
# Set ANDROID_SERIAL to pick a phone when more than one is connected.
#
# Measure release builds (the EAS `preview` profile, or `expo run:android --variant release`).
# A development client runs the JavaScript in __DEV__ mode on both the JS and the UI runtime,
# so its numbers say little about what players get. The script warns when the installed build
# is debuggable.
#
# Writes traces/<label>-<time>.pftrace (open it at https://ui.perfetto.dev) and prints the
# window's HWUI frame summary for the recording. While the game canvas is a TextureView, every
# Skia frame is also an HWUI frame, so that summary tracks the game. A SurfaceView canvas
# bypasses HWUI: then compare the SurfaceFlinger frame timeline in the trace instead.
set -euo pipefail

PACKAGE=com.johanssoninteractive.tiltling
LABEL=${1:-trace}
DURATION_S=${2:-15}
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/traces"
STAMP=$(date +%Y%m%d-%H%M%S)
DEVICE_TRACE=/data/misc/perfetto-traces/tiltling-$STAMP.pftrace
LOCAL_TRACE="$OUT_DIR/$LABEL-$STAMP.pftrace"

if ! adb shell pidof "$PACKAGE" >/dev/null; then
	echo "$PACKAGE is not running; start it and the scenario first" >&2
	exit 1
fi
if adb shell dumpsys package "$PACKAGE" | grep -q DEBUGGABLE; then
	echo "warning: the installed build is debuggable (a development build), not release" >&2
fi

echo "device:  $(adb shell getprop ro.product.model | tr -d '\r')," \
	"Android $(adb shell getprop ro.build.version.release | tr -d '\r')"
echo "display: $(adb shell dumpsys SurfaceFlinger | grep -m1 'refresh-rate' | tr -s ' ' | tr -d '\r')"
echo "thermal: $(adb shell dumpsys thermalservice | grep -m1 'Thermal Status' | tr -d '\r')"

adb shell dumpsys gfxinfo "$PACKAGE" reset >/dev/null
echo "recording ${DURATION_S}s..."
adb shell perfetto --txt -c - -o "$DEVICE_TRACE" >/dev/null <<EOF
duration_ms: $((DURATION_S * 1000))
buffers { size_kb: 131072 fill_policy: RING_BUFFER }
data_sources {
  config {
    name: "linux.ftrace"
    ftrace_config {
      ftrace_events: "sched/sched_switch"
      ftrace_events: "sched/sched_waking"
      ftrace_events: "power/cpu_frequency"
      ftrace_events: "power/cpu_idle"
      ftrace_events: "power/gpu_frequency"
      atrace_categories: "gfx"
      atrace_categories: "view"
      atrace_categories: "input"
      atrace_categories: "sched"
      atrace_categories: "freq"
      atrace_categories: "dalvik"
      atrace_categories: "hal"
      atrace_apps: "$PACKAGE"
    }
  }
}
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
data_sources {
  config {
    name: "linux.process_stats"
    process_stats_config { scan_all_processes_on_start: true }
  }
}
EOF

mkdir -p "$OUT_DIR"
adb exec-out cat "$DEVICE_TRACE" >"$LOCAL_TRACE"
adb shell rm -f "$DEVICE_TRACE"

echo
echo "HWUI frames during the recording:"
adb shell dumpsys gfxinfo "$PACKAGE" |
	grep -E 'Total frames rendered|Janky frames:|percentile|Missed Vsync|Slow UI thread|Slow issue draw' |
	sed 's/^/  /'
echo
echo "trace: $LOCAL_TRACE"
