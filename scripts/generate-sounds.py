#!/usr/bin/env python3
"""Generate the catch sounds: a small tick for small dots, a layered chime for point dots.

Usage (from the repo root, or anywhere):

    python3 scripts/generate-sounds.py

Requires only Python 3 plus ``afconvert`` (macOS) or ``ffmpeg`` for AAC encoding.
Overwrites these files in ``assets/sounds/``:

    collect-small.m4a  ~0.3 s  short marimba-like tick on E6
    collect-large.m4a  ~3.8 s  three bell tones rising through C6, G6, C7

Everything is synthesised from sines with fixed envelopes, so re-running gives identical
audio. The tones sit on the C major pentatonic used by the music, so they blend with it.
"""

import math
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

SOUNDS_DIR = Path(__file__).resolve().parent.parent / "assets" / "sounds"

RATE = 44100
BITRATE = 96000
PEAK = 0.89  # -1 dBFS


def midi_hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def mix_into(out, start_s, samples):
    start = int(start_s * RATE)
    if len(out) < start + len(samples):
        out.extend([0.0] * (start + len(samples) - len(out)))
    for i, x in enumerate(samples):
        out[start + i] += x


def tick(freq, gain, length_s):
    """Short plucked tick: fundamental with a quick-decaying octave overtone."""
    n = int(length_s * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        attack = 1 - math.exp(-t / 0.001)
        body = math.sin(2 * math.pi * freq * t) * math.exp(-t / 0.035)
        overtone = 0.25 * math.sin(2 * math.pi * 2 * freq * t) * math.exp(-t / 0.012)
        out.append(gain * attack * (body + overtone))
    return out


# Partials of a struck bell: (frequency ratio, gain, decay as a share of the ring time)
BELL_PARTIALS = (
    (1.0, 1.0, 1.0),
    (2.0, 0.35, 0.5),
    (2.76, 0.2, 0.35),
    (5.4, 0.08, 0.15),
)


# A chime rings for this many decay times, the last part easing to silence, so the tail
# dies away instead of stopping while still audible
CHIME_RINGS = 4
CHIME_RELEASE = 0.3


def chime(freq, gain, ring_s):
    """Struck bell; ring_s is the fundamental's decay time, not the length of the note."""
    n = int(ring_s * CHIME_RINGS * RATE)
    release = int(n * CHIME_RELEASE)
    out = []
    for i in range(n):
        t = i / RATE
        attack = 1 - math.exp(-t / 0.003)
        if i > n - release:
            attack *= 0.5 + 0.5 * math.cos(math.pi * (i - (n - release)) / release)
        s = sum(
            g * math.exp(-t / (ring_s * decay)) * math.sin(2 * math.pi * freq * ratio * t)
            for ratio, g, decay in BELL_PARTIALS
        )
        out.append(gain * attack * s)
    return out


def render_collect_small():
    out = []
    mix_into(out, 0.0, tick(midi_hz(76), 0.6, 0.3))
    return out


def render_collect_large():
    out = []
    # Three bell tones rising through C6, G6 and C7, each landing a little after the last
    for start, note, gain, ring in ((0.0, 84, 0.5, 1.1), (0.08, 91, 0.4, 1.0), (0.16, 96, 0.28, 0.9)):
        mix_into(out, start, chime(midi_hz(note), gain, ring))
    return out


# Output


def normalise(buf):
    peak = max(abs(x) for x in buf) or 1.0
    scale = PEAK / peak
    return [x * scale for x in buf]


def write_wav(path, buf):
    frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, x)) * 32767)) for x in buf)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(frames)


def encode(wav_path, out_path):
    if shutil.which("afconvert"):
        cmd = ["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE), str(wav_path), str(out_path)]
    elif shutil.which("ffmpeg"):
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-c:a", "aac", "-b:a", str(BITRATE), str(out_path)]
    else:
        raise SystemExit("Need afconvert (macOS) or ffmpeg to encode AAC")
    subprocess.run(cmd, check=True)


def main():
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    effects = (
        ("collect-small", render_collect_small),
        ("collect-large", render_collect_large),
    )
    with tempfile.TemporaryDirectory() as tmp:
        for name, render in effects:
            buf = normalise(render())
            wav_path = Path(tmp) / f"{name}.wav"
            write_wav(wav_path, buf)
            out_path = SOUNDS_DIR / f"{name}.m4a"
            encode(wav_path, out_path)
            print(f"{out_path.relative_to(SOUNDS_DIR.parent.parent)}  {len(buf) / RATE:.2f}s")


if __name__ == "__main__":
    main()
