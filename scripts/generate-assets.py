#!/usr/bin/env python3
"""Generate the United Colors app icon assets ("the trio mark").

Usage (from the repo root, or anywhere):

    python3 scripts/generate-assets.py

Requires only Python 3 and Pillow. Overwrites these files in ``assets/``:

    icon.png           1024x1024  RGB   opaque ink background + vignette
    adaptive-icon.png  1024x1024  RGBA  transparent, content inside the 66% safe zone
    splash-icon.png    1024x1024  RGBA  transparent, mark ~40% of the canvas width
    favicon.png         196x196   RGB   opaque ink background + vignette

The mark is three glossy spheres (pink top, green bottom-right, blue
bottom-left) on the vertices of an equilateral triangle, each with a soft
outer glow and an up-left highlight. Everything is rendered at 4x
supersampling and downscaled with LANCZOS.

Glow sizing: the nominal glow (disc 1.25R, blur sigma 0.06S) is shrunk
uniformly for an asset when it would otherwise reach past that asset's
allowed region (canvas edge for icon/favicon, 676px safe zone for the
adaptive icon). The script asserts that the glow really stays inside.
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

SUPERSAMPLE = 4

# Palette
INK = (0x0B, 0x0E, 0x14)
INK_LIGHT = (0x14, 0x1A, 0x26)  # vignette centre
PINK = (0xE9, 0x1E, 0x63)
BLUE = (0x21, 0x96, 0xF3)
GREEN = (0x8B, 0xC3, 0x4A)

# Mark geometry, as fractions of the canvas size S (before the per-asset scale).
DOT_RADIUS = 0.20
DOT_DISTANCE = 0.235  # centre of canvas -> centre of each dot

GLOW_RADIUS = 1.25  # glow disc radius, in dot radii
GLOW_BLUR = 0.06  # gaussian sigma, fraction of S
GLOW_ALPHA = 0.45
GLOW_REACH_SIGMAS = 3.0  # how far (in sigmas) a blurred glow is allowed to reach

HIGHLIGHT_OFFSET = -0.25  # gradient centre offset (x and y), in dot radii
HIGHLIGHT_RADIUS = 0.70  # gradient fades to 0 at this radius, in dot radii
HIGHLIGHT_ALPHA = 0.30

# (colour, angle in degrees; y axis points down) in draw order: pink ends up on top.
DOTS = (
    (BLUE, 150.0),
    (GREEN, 30.0),
    (PINK, -90.0),
)

SAFE_ZONE_PX = 676  # Android adaptive icon safe zone on a 1024px canvas


class Asset:
    def __init__(self, filename, size, scale, opaque, allowed_half_extent, glow_tolerance):
        self.filename = filename
        self.size = size
        self.scale = scale  # whole-mark scale (R, d and glow)
        self.opaque = opaque  # True -> ink background, saved as RGB
        # Allowed region around the canvas centre, as a fraction of S (half width).
        self.allowed_half_extent = allowed_half_extent
        # Max glow alpha (0-255) tolerated outside the allowed region.
        self.glow_tolerance = glow_tolerance


ASSET_SPECS = (
    Asset("icon.png", 1024, 1.0, True, 0.5, 2),
    Asset("adaptive-icon.png", 1024, 0.60, False, SAFE_ZONE_PX / 1024 / 2, 0),
    Asset("splash-icon.png", 1024, 0.50, False, 0.5, 2),
    Asset("favicon.png", 196, 1.0, True, 0.5, 2),
)


def disc_mask(size, cx, cy, r):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return mask


def composite_over(canvas, color, alpha):
    """Alpha-composite a flat colour, shaped by the L-mode ``alpha``, onto ``canvas``."""
    layer = Image.new("RGBA", canvas.size, color + (0,))
    layer.putalpha(alpha)
    canvas.alpha_composite(layer)


def vignette_background(size):
    """RGB canvas: INK_LIGHT in the centre fading to INK at the corners."""
    # radial_gradient is 0 at the centre and 255 in the corners, so a plain resize
    # gives exactly INK_LIGHT at the centre and INK at the canvas corners.
    gradient = Image.radial_gradient("L").resize((size, size), Image.BICUBIC)
    # composite() takes image1 where mask == 255.
    return Image.composite(
        Image.new("RGB", (size, size), INK),
        Image.new("RGB", (size, size), INK_LIGHT),
        gradient,
    )


def highlight_lut():
    """Smooth fall-off: HIGHLIGHT_ALPHA at the gradient centre, 0 at its edge.

    Pillow's radial_gradient is 0 at the centre and 255 only in the image corners
    (distance half_width * sqrt(2)); at the middle of an edge it is 255 / sqrt(2).
    So for an image whose half width is the highlight radius, t = v * sqrt(2) / 255.
    """
    lut = []
    for v in range(256):
        t = min(1.0, v * math.sqrt(2) / 255)
        falloff = 1 - t * t * (3 - 2 * t)  # 1 - smoothstep
        lut.append(round(255 * HIGHLIGHT_ALPHA * falloff))
    return lut


def highlight_mask(size, cx, cy, r, lut):
    """L-mode alpha of the glossy highlight for a dot, clipped to the dot circle."""
    hx = cx + HIGHLIGHT_OFFSET * r
    hy = cy + HIGHLIGHT_OFFSET * r
    hr = HIGHLIGHT_RADIUS * r
    n = round(2 * hr)
    # n/2 == hr, so the LUT's t reaches 1 exactly on the inscribed circle of radius hr.
    gradient = Image.radial_gradient("L").resize((n, n), Image.BICUBIC).point(lut)
    layer = Image.new("L", (size, size), 0)
    layer.paste(gradient, (round(hx - n / 2), round(hy - n / 2)))
    return ImageChops.multiply(layer, disc_mask(size, cx, cy, r))


def glow_factor(scale, allowed_half_extent):
    """Uniform shrink (<= 1) so the nominal glow stays inside the allowed region."""
    r = DOT_RADIUS * scale
    d = DOT_DISTANCE * scale
    # Extent of the dot union beyond the canvas centre, per side (fractions of S).
    side = d * math.cos(math.radians(30)) + r
    top = d + r
    bottom = d * math.sin(math.radians(30)) + r
    budget = min(
        allowed_half_extent - side,
        allowed_half_extent - top,
        allowed_half_extent - bottom,
    )
    nominal = (GLOW_RADIUS - 1) * r + GLOW_REACH_SIGMAS * GLOW_BLUR * scale
    return max(0.0, min(1.0, budget / nominal))


def render_mark(canvas, scale, factor, allowed_box, tolerance):
    """Draw glows, then dots with highlights, onto ``canvas`` (RGBA, square)."""
    size = canvas.width
    cx = cy = size / 2
    r = DOT_RADIUS * size * scale
    d = DOT_DISTANCE * size * scale
    glow_r = r * (1 + (GLOW_RADIUS - 1) * factor)
    sigma = GLOW_BLUR * size * scale * factor
    lut = highlight_lut()

    centers = [
        (color, cx + d * math.cos(math.radians(a)), cy + d * math.sin(math.radians(a)))
        for color, a in DOTS
    ]

    # 1. All glows first, so they sit behind every solid dot.
    for color, x, y in centers:
        mask = disc_mask(size, x, y, glow_r).filter(ImageFilter.GaussianBlur(sigma))
        mask = mask.point(lambda v: round(v * GLOW_ALPHA))
        outside = mask.copy()
        outside.paste(0, allowed_box)
        peak = outside.getextrema()[1]
        if peak > tolerance:
            raise AssertionError(f"glow leaks outside allowed box (alpha {peak} > {tolerance})")
        composite_over(canvas, color, mask)

    # 2. Solid dots, each followed by its own highlight.
    for color, x, y in centers:
        dot = disc_mask(size, x, y, r)
        composite_over(canvas, color, dot)
        composite_over(canvas, (255, 255, 255), highlight_mask(size, x, y, r, lut))


def render_asset(asset):
    big = asset.size * SUPERSAMPLE
    if asset.opaque:
        canvas = vignette_background(big).convert("RGBA")
    else:
        canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    factor = glow_factor(asset.scale, asset.allowed_half_extent)
    margin = round((0.5 - asset.allowed_half_extent) * big)
    # Opaque icons: check the outermost pixel ring (glow must not be clipped by the canvas).
    margin = max(margin, 1)
    allowed_box = (margin, margin, big - margin, big - margin)
    render_mark(canvas, asset.scale, factor, allowed_box, asset.glow_tolerance)

    image = canvas.resize((asset.size, asset.size), Image.LANCZOS)
    if asset.opaque:
        image = image.convert("RGB")
    path = ASSETS_DIR / asset.filename
    image.save(path, optimize=True)
    return path, factor


def verify(asset, path):
    with Image.open(path) as im:
        im.load()
        line = f"{path.relative_to(ASSETS_DIR.parent)}: size={im.size[0]}x{im.size[1]} mode={im.mode}"
        ok = im.size == (asset.size, asset.size)
        if asset.opaque:
            ok = ok and im.mode == "RGB"
        else:
            ok = ok and im.mode == "RGBA"
            bbox = im.getchannel("A").getbbox()
            width = bbox[2] - bbox[0]
            line += f" alpha_bbox={bbox} ({width}x{bbox[3] - bbox[1]}, {width / im.size[0]:.1%} of width)"
            if asset.filename == "adaptive-icon.png":
                lo = (asset.size - SAFE_ZONE_PX) // 2
                hi = lo + SAFE_ZONE_PX
                inside = bbox[0] >= lo and bbox[1] >= lo and bbox[2] <= hi and bbox[3] <= hi
                line += f" inside_safe_zone[{lo},{hi}]={inside}"
                ok = ok and inside
        return line, ok


def main():
    all_ok = True
    for asset in ASSET_SPECS:
        path, factor = render_asset(asset)
        line, ok = verify(asset, path)
        all_ok = all_ok and ok
        print(f"{line} glow_factor={factor:.2f} {'OK' if ok else 'FAIL'}")
    if not all_ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
