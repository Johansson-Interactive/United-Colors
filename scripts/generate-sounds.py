#!/usr/bin/env python3
"""Generate the catch sounds and master the point-spawn cue.

Usage (from the repo root, or anywhere):

    python3 scripts/generate-sounds.py

Requires Python 3 plus ``afconvert`` (macOS) or ``ffmpeg`` for AAC encoding, and ``ffmpeg``
to read the legacy spawn sound. Overwrites these files in ``assets/sounds/``:

    collect-small.m4a  ~0.3 s  short marimba-like tick on E6
    collect-large.m4a  ~2.8 s  three bell tones rising through C6, G6, C7
    point-spawn.m4a    ~0.2 s  the legacy app's jump.ogg, as mono AAC

The catch sounds are synthesised from sines with fixed envelopes, so re-running gives
identical audio. The tones sit on the C major pentatonic used by the music, so they blend
with it. Every effect is peak-normalised to -1 dBFS and mixed by its volume in
AudioService.ts (see mastering.py).
"""

import math
import tempfile
from pathlib import Path

from mastering import RATE, decode, encode, momentary_max, normalise, peak_db, write_wav

SOUNDS_DIR = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def midi_hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def mix_into(out, start_s, samples):
    start = int(start_s * RATE)
    if len(out) < start + len(samples):
        out.extend([0.0] * (start + len(samples) - len(out)))
    for i, x in enumerate(samples):
        out[start + i] += x


# Soft saturation on the tick. A single sine is all peak and little loudness, so at -1 dBFS
# the tick capped how loud the whole mix could be. The few odd harmonics this adds make it
# about 3 phon louder for the same peak (ISO 532-1) with the pitch and envelope unchanged.
TICK_DRIVE = 1.4


def tick(freq, gain, length_s):
    """Short plucked tick: fundamental with a quick-decaying octave overtone, gently driven."""
    n = int(length_s * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        attack = 1 - math.exp(-t / 0.001)
        body = math.sin(2 * math.pi * freq * t) * math.exp(-t / 0.035)
        overtone = 0.25 * math.sin(2 * math.pi * 2 * freq * t) * math.exp(-t / 0.012)
        out.append(gain * math.tanh(TICK_DRIVE * attack * (body + overtone)) / math.tanh(TICK_DRIVE))
    return out


# Partials of a struck bell: (frequency ratio, gain, decay as a share of the ring time).
# The inharmonic upper two are kept low: up at 6-11 kHz they read as glassy glare rather
# than as part of the note.
BELL_PARTIALS = (
    (1.0, 1.0, 1.0),
    (2.0, 0.35, 0.5),
    (2.76, 0.14, 0.3),
    (5.4, 0.04, 0.12),
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
    # Three bell tones rising through C6, G6 and C7, each landing a little after the last.
    # A point dot can follow the last within a couple of seconds, so the ring is kept short
    # enough not to pile up under the next catch.
    for start, note, gain, ring in ((0.0, 84, 0.5, 0.7), (0.08, 91, 0.4, 0.65), (0.16, 96, 0.28, 0.6)):
        mix_into(out, start, chime(midi_hz(note), gain, ring))
    return out


def render_point_spawn():
    # The legacy sound is stereo with both channels the same and clips past full scale, and
    # iOS only recently learned to play Ogg Vorbis; as mono AAC at -1 dBFS it plays anywhere
    return decode(SOUNDS_DIR / "jump.ogg")


# Output


def main():
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    effects = (
        ("collect-small", render_collect_small),
        ("collect-large", render_collect_large),
        ("point-spawn", render_point_spawn),
    )
    with tempfile.TemporaryDirectory() as tmp:
        for name, render in effects:
            buf = normalise(render())
            wav_path = Path(tmp) / f"{name}.wav"
            write_wav(wav_path, buf)
            out_path = SOUNDS_DIR / f"{name}.m4a"
            encode(wav_path, out_path)
            print(
                f"{out_path.relative_to(SOUNDS_DIR.parent.parent)}  {len(buf) / RATE:.2f}s  "
                f"{momentary_max(buf):.1f} LUFS momentary max, peak {peak_db(buf):.1f} dBFS"
            )


if __name__ == "__main__":
    main()
