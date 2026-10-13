#!/usr/bin/env python3
"""Generate the Tiltling music: two seamless loops and a game-over stinger.

Usage (from the repo root, or anywhere):

    python3 scripts/generate-music.py

Requires only Python 3 plus ``afconvert`` (macOS) or ``ffmpeg`` for AAC encoding.
Overwrites these files in ``assets/music/``:

    menu.m4a       84 BPM, 16 bars  soft pad, marimba arpeggio, sparse bells
    game.m4a      112 BPM, 16 bars  marimba lead, plucked arpeggio, bass, light drums
    game-over.m4a  ~6 s             falling marimba line resolving on a ringing chord

Everything is synthesised from sines, triangles and noise and is fully deterministic
(fixed noise seed), so re-running gives identical audio. The loops share one chord
progression in C major (C Am F G | C Em F G) and keep melodies mostly on the major
pentatonic, so they crossfade into each other and sit under the sound effects.

Loops are seamless: each loop is exactly 16 bars long (both tempos give a whole number
of samples per beat at 44.1 kHz) and note tails that run past the end wrap around to
the start, so the last bar rings into the first.

Both loops are mastered to the same integrated loudness (see mastering.py), limited so no
peak passes -1 dBFS, so the cue volumes in BindMusic.ts mix them directly. The stinger plays
as an effect and is peak-normalised like the other effects.
"""

import math
import random
import tempfile
from pathlib import Path

from mastering import RATE, encode, integrated_loudness, master_loop, momentary_max, normalise, peak_db, write_wav

MUSIC_DIR = Path(__file__).resolve().parent.parent / "assets" / "music"

# One bar per chord, two passes of the progression make a 16-bar loop. Chords are MIDI
# notes of a close voicing around middle C; the first note is also the bass root.
PROGRESSION = (
    (48, 60, 64, 67),  # C
    (45, 60, 64, 69),  # Am
    (41, 60, 65, 69),  # F
    (43, 62, 67, 71),  # G
    (48, 60, 64, 67),  # C
    (40, 59, 64, 67),  # Em
    (41, 60, 65, 69),  # F
    (43, 62, 65, 67),  # G7, leans back into the C at the loop start
)

# Lead line on an 8th-note grid, 8 steps per bar. Numbers are MIDI notes, "-" holds the
# previous note, "." is a rest.
MELODY = (
    "76 . 79 . 81 79 76 .",
    "72 . 76 - - . 74 .",
    "69 . 72 . 76 - 74 72",
    "74 - - . 67 . 74 76",
    "79 . 76 79 84 - 81 .",
    "79 - 76 . 74 . 76 .",
    "81 . 79 . 76 . 72 74",
    "74 - - - . . . .",
)

# The second pass answers instead of repeating: same rhythm feel, higher and sparser
MELODY_ANSWER = (
    "84 . 81 . 79 . 76 .",
    "79 - - . 76 . 72 .",
    "77 . 76 . 72 - 69 .",
    "71 - 74 . 79 - - .",
    "76 . 79 . 81 . 84 .",
    "83 - 79 . 76 . 79 .",
    "81 . 77 . 76 . 74 72",
    "71 - - - 74 - 67 .",
)

# Menu bells: a few long notes per pass
MENU_BELLS = (
    "76 - - - - - - -",
    ". . . . 72 - - -",
    "69 - - - - - - -",
    ". . . . 74 - - -",
    "79 - - - - - - -",
    ". . . . 76 - - -",
    "77 - - - 76 - - -",
    "74 - - - - - - -",
)


def midi_hz(note):
    return 440.0 * 2.0 ** ((note - 69) / 12.0)


def parse_line(bars, steps_per_bar=8):
    """(step, length_in_steps, note) for each note in an 8th-note grid line."""
    notes = []
    for bar_index, bar in enumerate(bars):
        for step_index, token in enumerate(bar.split()):
            step = bar_index * steps_per_bar + step_index
            if token == "-":
                if notes:
                    start, length, note = notes[-1]
                    notes[-1] = (start, length + 1, note)
            elif token != ".":
                notes.append((step, 1, int(token)))
    return notes


class Track:
    """A mono float buffer. Loops wrap note tails around the end; one-shots grow."""

    def __init__(self, seconds, loop):
        self.loop = loop
        self.buf = [0.0] * int(round(seconds * RATE))

    def add(self, start_s, samples):
        offset = int(round(start_s * RATE))
        buf = self.buf
        size = len(buf)
        if not self.loop and offset + len(samples) > size:
            buf.extend([0.0] * (offset + len(samples) - size))
            size = len(buf)
        for i, value in enumerate(samples):
            buf[(offset + i) % size] += value


# Instruments. Each returns a list of samples for one note.


def envelope(n, attack_s, decay_s):
    """Linear attack then exponential decay with time constant decay_s."""
    attack = max(1, int(attack_s * RATE))
    k = 1.0 / (decay_s * RATE)
    return [i / attack if i < attack else math.exp(-(i - attack) * k) for i in range(n)]


def marimba(freq, gain, ring_s=0.9):
    """Sine body plus the 4x overtone that gives mallets their knock."""
    n = int(ring_s * 3 * RATE)
    body = envelope(n, 0.002, ring_s)
    knock = envelope(n, 0.001, ring_s * 0.12)
    w1 = 2 * math.pi * freq / RATE
    w4 = 4 * w1
    return [
        gain * (body[i] * math.sin(w1 * i) + 0.35 * knock[i] * math.sin(w4 * i))
        for i in range(n)
    ]


def bell(freq, gain, ring_s=2.4, rings=2.5):
    """Soft FM-ish bell: sine with an inharmonic partial, rendered for `rings` decay times."""
    n = int(ring_s * rings * RATE)
    env = envelope(n, 0.004, ring_s)
    shimmer = envelope(n, 0.004, ring_s * 0.4)
    w = 2 * math.pi * freq / RATE
    return [
        gain * env[i] * (math.sin(w * i) + 0.25 * shimmer[i] * math.sin(w * 2.76 * i))
        for i in range(n)
    ]


def triangle(phase):
    phase %= 1.0
    return 4 * phase - 1 if phase < 0.5 else 3 - 4 * phase


def bass(freq, gain, length_s):
    """Round triangle bass with a short release."""
    n = int((length_s + 0.08) * RATE)
    hold = int(length_s * RATE)
    attack = int(0.006 * RATE)
    step = freq / RATE
    out = []
    for i in range(n):
        if i < attack:
            amp = i / attack
        elif i < hold:
            amp = 1.0 - 0.25 * (i - attack) / max(1, hold - attack)
        else:
            amp = 0.75 * math.exp(-(i - hold) / (0.025 * RATE))
        out.append(gain * amp * triangle(i * step))
    return out


def pad(freqs, gain, length_s):
    """Slow-swelling chord of slightly detuned sine pairs."""
    n = int((length_s + 1.2) * RATE)
    attack = 0.9 * RATE
    hold = length_s * RATE
    ws = []
    for f in freqs:
        ws.append(2 * math.pi * f * 0.998 / RATE)
        ws.append(2 * math.pi * f * 1.002 / RATE)
    scale = gain / len(ws)
    out = []
    for i in range(n):
        if i < attack:
            amp = math.sin(0.5 * math.pi * i / attack)
        elif i < hold:
            amp = 1.0
        else:
            amp = math.exp(-(i - hold) / (0.35 * RATE))
        out.append(scale * amp * sum(math.sin(w * i) for w in ws))
    return out


def kick(gain):
    n = int(0.28 * RATE)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        freq = 48 + 90 * math.exp(-t / 0.03)
        phase += 2 * math.pi * freq / RATE
        out.append(gain * math.exp(-t / 0.09) * math.sin(phase))
    return out


def noise_hit(rng, gain, decay_s, brightness):
    """Noise burst; brightness 0..1 blends lowpassed into differenced (highpassed) noise."""
    n = int(decay_s * 5 * RATE)
    out = []
    prev = 0.0
    low = 0.0
    for i in range(n):
        x = rng.uniform(-1, 1)
        high = x - prev
        prev = x
        low += 0.2 * (x - low)
        mix = brightness * 0.5 * high + (1 - brightness) * low
        out.append(gain * math.exp(-i / (decay_s * RATE)) * mix)
    return out


# Songs


def chord_tones(chord):
    return chord[1:]


def render_menu():
    bpm = 84
    beat = 60.0 / bpm
    bar = 4 * beat
    bars = 16
    track = Track(bars * bar, loop=True)

    for b in range(bars):
        chord = PROGRESSION[b % 8]
        t0 = b * bar
        track.add(t0, pad([midi_hz(n) for n in chord_tones(chord)], 0.16, bar))
        track.add(t0, bass(midi_hz(chord[0]), 0.10, bar * 0.9))
        # Rolling 8th-note arpeggio: up through the chord and back
        tones = chord_tones(chord)
        pattern = [tones[0], tones[1], tones[2], tones[0] + 12, tones[2], tones[1], tones[0], tones[1]]
        for step, note in enumerate(pattern):
            gain = 0.11 if step % 2 == 0 else 0.07
            track.add(t0 + step * beat / 2, marimba(midi_hz(note), gain, ring_s=0.6))

    # Bells only in the second pass, so the loop breathes
    eighth = beat / 2
    for step, length, note in parse_line(MENU_BELLS):
        track.add(8 * bar + step * eighth, bell(midi_hz(note), 0.09, ring_s=max(1.2, length * eighth)))

    return track


def render_game():
    bpm = 112
    beat = 60.0 / bpm
    bar = 4 * beat
    bars = 16
    sixteenth = beat / 4
    eighth = beat / 2
    track = Track(bars * bar, loop=True)
    rng = random.Random(7)

    for b in range(bars):
        chord = PROGRESSION[b % 8]
        t0 = b * bar
        root = midi_hz(chord[0])
        # Bass: root on 1, fifth on the "and" of 2, root on 3, octave pickup on the "and" of 4
        for beat_pos, ratio, length in ((0, 1, 0.9), (1.5, 1.5, 0.4), (2, 1, 0.9), (3.5, 2, 0.35)):
            track.add(t0 + beat_pos * beat, bass(root * ratio, 0.22, length * beat))
        # Plucked 16th arpeggio, quiet so the melody sits on top
        tones = chord_tones(chord)
        cycle = [tones[0], tones[2], tones[1] + 12, tones[2]]
        for step in range(16):
            gain = 0.07 if step % 4 == 0 else 0.045
            track.add(t0 + step * sixteenth, marimba(midi_hz(cycle[step % 4] + 12), gain, ring_s=0.18))
        # Drums: kick on 1 and 3, soft clap on 2 and 4, hats on 8ths
        for k in (0, 2):
            track.add(t0 + k * beat, kick(0.42))
        for c in (1, 3):
            track.add(t0 + c * beat, noise_hit(rng, 0.16, 0.05, 0.4))
        for h in range(8):
            track.add(t0 + h * eighth, noise_hit(rng, 0.07 if h % 2 else 0.045, 0.012, 1.0))

    for start_bar, line in ((0, MELODY), (8, MELODY_ANSWER)):
        for step, length, note in parse_line(line):
            track.add(start_bar * bar + step * eighth, marimba(midi_hz(note), 0.24, ring_s=0.25 + 0.12 * length))

    return track


def render_game_over():
    track = Track(3.2, loop=False)
    beat = 60.0 / 100
    # Falling line, then the plagal close F -> C ringing out
    for i, note in enumerate((76, 74, 72, 69)):
        track.add(i * beat / 2, marimba(midi_hz(note), 0.30, ring_s=0.5))
    t = 2 * beat
    for note in (53, 65, 69, 72):
        track.add(t, marimba(midi_hz(note), 0.16, ring_s=0.8))
    t += beat
    for note in (48, 60, 64, 67, 72):
        track.add(t, bell(midi_hz(note), 0.13, ring_s=1.1, rings=4))
    track.add(t, pad([midi_hz(n) for n in (60, 64, 67)], 0.15, 0.6))
    # The stinger ends on that chord, so let it die away rather than stop mid-ring
    fade_out(track.buf, 1.5)
    return track


def fade_out(buf, seconds):
    """Half-cosine fade to silence over the last `seconds` of the buffer."""
    n = min(len(buf), int(seconds * RATE))
    start = len(buf) - n
    for i in range(n):
        buf[start + i] *= 0.5 + 0.5 * math.cos(math.pi * i / n)


# Output


def main():
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    songs = (
        ("menu", render_menu),
        ("game", render_game),
        ("game-over", render_game_over),
    )
    with tempfile.TemporaryDirectory() as tmp:
        for name, render in songs:
            track = render()
            if track.loop:
                buf, reduction = master_loop(track.buf)
                level = f"{integrated_loudness(buf, loop=True):.1f} LUFS, limited {reduction:.1f} dB"
            else:
                buf = normalise(track.buf)
                level = f"{momentary_max(buf):.1f} LUFS momentary max"
            wav_path = Path(tmp) / f"{name}.wav"
            write_wav(wav_path, buf)
            out_path = MUSIC_DIR / f"{name}.m4a"
            encode(wav_path, out_path)
            print(f"{out_path.relative_to(MUSIC_DIR.parent.parent)}  {len(buf) / RATE:.1f}s  {level}, peak {peak_db(buf):.1f} dBFS")


if __name__ == "__main__":
    main()
