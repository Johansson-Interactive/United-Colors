#!/usr/bin/env python3
"""Derive the Tiltling app icon files from the artwork in ``assets/icon-source.png``.

Usage (from the repo root, or anywhere):

    python3 scripts/derive-icons.py

Requires only Python 3 and Pillow. Overwrites these files in ``assets/``:

    icon.png                1024x1024  RGB   the artwork
    favicon.png              196x196   RGB   the artwork, downscaled
    adaptive-icon.png       1024x1024  RGB   Android foreground: the artwork scaled so everything
                                             in it fits the circle a round launcher mask shows,
                                             on ink out to the edges for the parallax margin
    adaptive-icon-mono.png  1024x1024  RGBA  Android themed-icon layer: the bodies as flat white
                                             silhouettes, same fit
    splash-icon.png         1024x1024  RGBA  the artwork lifted off its background, transparent

The artwork is drawn on the game's ink (#0B0E14), so a pixel's distance from ink says how
much of it is artwork: that gives the splash its alpha and the themed icon its silhouettes.
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
SOURCE = ASSETS_DIR / "icon-source.png"

S = 1024
INK = (0x0B, 0x0E, 0x14)

# A launcher shows the middle 72 of an adaptive icon's 108 dp, and a round mask the circle
# inscribed in that, less a little margin for the mask's own edge
ADAPTIVE_WINDOW = 72 / 108
MASK_MARGIN = 0.02
# How far a channel must sit above ink (0-255) for a pixel to count as fully artwork; below
# it, glow and anti-aliasing fade out
SOLID_DISTANCE = 120
# Pixels this far above ink are part of a body for the themed silhouette (glows are not)
BODY_DISTANCE = 70
# The splash shows the artwork at this fraction of the canvas width
SPLASH_SCALE = 0.8


def distance_from_ink(rgb):
    """L image: how far each pixel's brightest channel sits above the ink's, 0-255."""
    channels = [ch.point(lambda v, c=c: max(0, v - c)) for ch, c in zip(rgb.split(), INK)]
    return ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])


def lift(rgb):
    """RGBA: the artwork with ink made transparent. Alpha rises with the distance from ink
    and colour is unpremultiplied from the ink, so it composites back onto ink unchanged."""
    alpha = distance_from_ink(rgb).point(lambda v: min(255, round(v * 255 / SOLID_DISTANCE)))
    a = alpha.load()
    px = rgb.load()
    out = Image.new("RGBA", rgb.size)
    o = out.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            k = a[x, y]
            if k == 0:
                o[x, y] = INK + (0,)
                continue
            f = 255 / k
            r, g, b = px[x, y]
            o[x, y] = (
                min(255, max(0, round(INK[0] + (r - INK[0]) * f))),
                min(255, max(0, round(INK[1] + (g - INK[1]) * f))),
                min(255, max(0, round(INK[2] + (b - INK[2]) * f))),
                k,
            )
    return out


def silhouette(rgb):
    """L image: the bodies as solid shapes, edges softened a touch."""
    body = distance_from_ink(rgb).point(lambda v: 255 if v >= BODY_DISTANCE else 0)
    return body.filter(ImageFilter.GaussianBlur(rgb.width / 1024))


def reach(mask):
    """Furthest any part of ``mask`` is from the canvas centre, as a fraction of its width."""
    m = mask.point(lambda v: 255 if v > 8 else 0)
    w, h = m.size
    small = m.resize((w // 4, h // 4), Image.BOX)
    px = small.load()
    cx, cy = small.width / 2, small.height / 2
    far = 0.0
    for y in range(small.height):
        for x in range(small.width):
            if px[x, y]:
                far = max(far, math.hypot(x + 0.5 - cx, y + 0.5 - cy))
    return far / small.width


def placed(image, scale, fill):
    """``image`` scaled to ``scale`` of S and centred on an S canvas filled with ``fill``."""
    side = round(S * scale)
    canvas = Image.new(image.mode, (S, S), fill)
    canvas.paste(image.resize((side, side), Image.LANCZOS), ((S - side) // 2, (S - side) // 2))
    return canvas


def main():
    with Image.open(SOURCE) as im:
        art = im.convert("RGB").resize((S, S), Image.LANCZOS)

    outputs = []

    def save(image, name, mode):
        path = ASSETS_DIR / name
        image.convert(mode).save(path, optimize=True)
        outputs.append((path, mode))

    save(art, "icon.png", "RGB")
    save(art.resize((196, 196), Image.LANCZOS), "favicon.png", "RGB")

    # Shrink the artwork until everything in it sits inside the round mask's circle
    lifted = lift(art)
    circle = ADAPTIVE_WINDOW / 2 - MASK_MARGIN
    scale = min(ADAPTIVE_WINDOW, circle / reach(lifted.getchannel("A")))
    save(placed(art, scale, INK), "adaptive-icon.png", "RGB")
    mono = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    mono.putalpha(placed(silhouette(art), scale, 0))
    save(mono, "adaptive-icon-mono.png", "RGBA")

    save(placed(lifted, SPLASH_SCALE, INK + (0,)), "splash-icon.png", "RGBA")

    print(f"adaptive scale {scale:.3f} of the canvas")
    for path, mode in outputs:
        with Image.open(path) as im:
            ok = im.mode == mode and im.size[0] == im.size[1]
            print(f"{path.relative_to(ASSETS_DIR.parent)}: {im.size[0]}x{im.size[1]} {im.mode}"
                  f" {'OK' if ok else 'FAIL'}")
            if not ok:
                raise SystemExit(1)


if __name__ == "__main__":
    main()
