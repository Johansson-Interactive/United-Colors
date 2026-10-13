"""Output stage shared by the audio generators: loudness metering, a limiter, encoding.

Like the generators it needs only Python 3 plus ``afconvert`` (macOS) or ``ffmpeg``.
Loudness follows ITU-R BS.1770-4 (K-weighting, 400 ms blocks, -70 LUFS absolute and
-10 LU relative gates): the measure streaming services normalise to and the game loudness
guidelines (e.g. Sony's -18 LUFS for portable devices) are written in.

The music loops are mastered to one integrated loudness, so their cue volumes in
src/application/useCases/BindMusic.ts are a straight mix. Effects are peak-normalised
(short sounds have little loudness per peak, so they get all the headroom there is) and
mixed by the volumes in src/infrastructure/AudioService.ts.
"""

import math
import shutil
import struct
import subprocess
import wave
from collections import deque

RATE = 44100
BITRATE = 96000
PEAK = 10 ** (-1 / 20)  # -1 dBFS

# Music loops land here before their cue volumes; loud enough that the game loop plays near
# -17 LUFS, within a few dB of what Spotify (-14) and Apple Music (-16) play at
MUSIC_LUFS = -16.0


# Metering


def biquad(buf, b, a, loop=False):
    """Direct-form I biquad. A loop runs twice so the filter state wraps round the seam."""
    b0, b1, b2 = b
    _, a1, a2 = a
    x1 = x2 = y1 = y2 = 0.0
    out = [0.0] * len(buf)
    for _ in range(2 if loop else 1):
        for i, x in enumerate(buf):
            y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, x, y1, y
            out[i] = y
    return out


def k_weighting():
    """BS.1770 pre-filter (high shelf) and RLB high-pass at RATE, as libebur128 derives them."""
    f0, gain, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / RATE)
    vh = 10 ** (gain / 20)
    vb = vh**0.4996667741545416
    a0 = 1 + k / q + k * k
    shelf = (
        ((vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0),
        (1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0),
    )
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / RATE)
    a0 = 1 + k / q + k * k
    highpass = ((1.0, -2.0, 1.0), (1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0))
    return shelf, highpass


def block_loudness(buf, loop=False):
    """Loudness (LUFS) of each 400 ms block, stepping 100 ms. One-shots get a silent tail."""
    shelf, highpass = k_weighting()
    signal = buf if loop else buf + [0.0] * int(0.4 * RATE)
    weighted = biquad(biquad(signal, *shelf, loop=loop), *highpass, loop=loop)
    sums = [0.0]
    for v in weighted:
        sums.append(sums[-1] + v * v)
    size, hop = int(0.4 * RATE), int(0.1 * RATE)
    return [
        -0.691 + 10 * math.log10(max(1e-20, (sums[s + size] - sums[s]) / size))
        for s in range(0, len(weighted) - size + 1, hop)
    ]


def integrated_loudness(buf, loop=False):
    blocks = [l for l in block_loudness(buf, loop) if l > -70]
    if not blocks:
        return -70.0

    def mean(ls):
        return -0.691 + 10 * math.log10(sum(10 ** ((l + 0.691) / 10) for l in ls) / len(ls))

    gate = mean(blocks) - 10
    return mean([l for l in blocks if l > gate])


def momentary_max(buf):
    """Loudest 400 ms window: the usual single-number loudness for a short effect."""
    return max(block_loudness(buf))


def peak_db(buf):
    peak = max(abs(x) for x in buf)
    return 20 * math.log10(peak) if peak else -120.0


# Mastering


def normalise(buf, peak=PEAK):
    scale = peak / (max(abs(x) for x in buf) or 1.0)
    return [x * scale for x in buf]


def limit(buf, ceiling=PEAK, loop=False, lookahead_s=0.005, release_s=0.12):
    """
    Lookahead peak limiter. The gain needed by each sample is taken as a sliding minimum over
    the lookahead, averaged over the same span so it ramps rather than steps (which keeps it
    at or below what every peak needs), then recovers with an exponential release. A loop is
    processed with the buffer wrapped round so the gain is continuous across the seam.
    Returns the limited buffer and the largest gain reduction in dB.
    """
    n = len(buf)
    look = max(1, int(lookahead_s * RATE))
    signal = buf[-n:] + buf + buf[:look] if loop else buf + [0.0] * look
    need = [min(1.0, ceiling / abs(x)) if x else 1.0 for x in signal]

    # Sliding minimum of need[i .. i + look]
    ahead = [1.0] * len(need)
    window = deque()
    for i in range(len(need) - 1, -1, -1):
        while window and need[window[-1]] >= need[i]:
            window.pop()
        window.append(i)
        while window[0] > i + look:
            window.popleft()
        ahead[i] = need[window[0]]

    # Average over the `look` samples ending here (unity before the start), then release
    release = 1 - math.exp(-1 / (release_s * RATE))
    gain = [1.0] * len(need)
    total = float(look)
    smoothed = 1.0
    for i, g in enumerate(ahead):
        total += g - (ahead[i - look] if i >= look else 1.0)
        smoothed = min(total / look, smoothed + (1 - smoothed) * release)
        gain[i] = smoothed

    start = n if loop else 0
    out = [signal[start + i] * gain[start + i] for i in range(n)]
    reduction = -20 * math.log10(min(gain[start : start + n]))
    return out, reduction


def master_loop(buf, lufs=MUSIC_LUFS, ceiling=PEAK):
    """Bring a loop to an integrated loudness, limiting any peaks that would pass the ceiling."""
    out, reduction = buf, 0.0
    # Limiting shaves a little loudness off, so a second pass makes it up
    for _ in range(2):
        gain = 10 ** ((lufs - integrated_loudness(out, loop=True)) / 20)
        out, step = limit([x * gain for x in out], ceiling, loop=True)
        reduction = max(reduction, step)
    return out, reduction


# Output


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


def decode(path):
    """Any file ffmpeg reads, as mono floats at RATE (for re-mastering existing sounds)."""
    if not shutil.which("ffmpeg"):
        raise SystemExit(f"Need ffmpeg to read {path}")
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return list(struct.unpack(f"<{len(raw) // 4}f", raw))
