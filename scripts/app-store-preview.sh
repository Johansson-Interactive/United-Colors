#!/usr/bin/env bash
# Cut Tiltling's App Store app preview from a simulator recording of the capture build.
#
#   scripts/app-store-preview.sh <recording.mp4> [start-seconds] [length-seconds]
#
# Records come from `xcrun simctl io booted recordVideo --codec h264 recording.mp4` on an
# iPhone 16 Pro simulator (1206x2622) running the capture build (see README). The preview is
# the window from `start` (default 0) of `length` seconds (default 28; Apple allows 15 to 30),
# scaled to Apple's 886x1920 portrait preview size at 30 fps, H.264 High 4.0 at about 6 Mbps (plenty for the game's dark, flat field, and a size git can carry),
# with the game's own loop underneath, fading out at the end, as Apple's app preview
# specifications ask. Writes assets/app-store/preview/preview-iphone.png next to the video:
# the frame 5 seconds in, Apple's default poster frame, to check what the store will show.
#
# Needs ffmpeg (brew install ffmpeg).

set -euo pipefail

if [ $# -lt 1 ]; then
	sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
	exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORDING="$1"
START="${2:-0}"
LENGTH="${3:-28}"
OUT_DIR="$ROOT/assets/app-store/preview"
OUT="$OUT_DIR/preview-iphone.mp4"
MUSIC="$ROOT/assets/music/game.m4a"
mkdir -p "$OUT_DIR"

FADE_START=$(python3 -c "print(max(0, $LENGTH - 1.5))")

ffmpeg -y -hide_banner -loglevel error \
	-ss "$START" -t "$LENGTH" -i "$RECORDING" \
	-stream_loop -1 -i "$MUSIC" \
	-filter_complex "[0:v]scale=886:-2:flags=lanczos,crop=886:1920,fps=30,format=yuv420p[v];[1:a]atrim=0:$LENGTH,afade=t=in:st=0:d=1,afade=t=out:st=$FADE_START:d=1.5,aformat=sample_rates=48000:channel_layouts=stereo[a]" \
	-map "[v]" -map "[a]" \
	-c:v libx264 -profile:v high -level 4.0 -b:v 6M -maxrate 8M -bufsize 12M -preset slow \
	-c:a aac -b:a 256k \
	-movflags +faststart -shortest \
	"$OUT"

ffmpeg -y -hide_banner -loglevel error -ss 5 -i "$OUT" -frames:v 1 "$OUT_DIR/preview-iphone.png"

ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,profile,level:format=duration,bit_rate -of default=noprint_wrappers=1 "$OUT"
ls -la "$OUT"
