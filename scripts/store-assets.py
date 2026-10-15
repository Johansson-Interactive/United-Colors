#!/usr/bin/env python3
"""Compose Tiltling's Google Play store graphics from the game's own pieces.

Usage (from the repo root, or anywhere):

    python3 scripts/store-assets.py

Requires only Python 3 and Pillow. Reads:

    assets/icon.png                        the app icon artwork
    assets/google-play/captures/*.png      portrait captures of the game (see below)
    assets/google-play/fonts/Roboto.ttf    Roboto (variable), the font of the game's captions
    src/presentation/dotmatrix/glyphs.ts   the game's 5x7 dot-matrix alphabet

and overwrites these files in ``assets/google-play/``:

    icon.png                       512x512    RGBA  store icon (opaque, Play masks the corners)
    feature-graphic.png           1024x500    RGB   the name over the game's colours (English)
    feature-graphic-sv-SE.png     1024x500    RGB   the same, with the Swedish tagline
    screenshots/<locale>/NN-*.png 1080x1920   RGB   one capture each, under a caption

The captures are real, unedited screenshots of the game taken during play on a phone. A capture taller than
9:16 is cropped to 9:16 around what is on screen (the HUD kept when it all does not fit), so
nothing is stretched. Each screenshot shows its capture whole, scaled under a caption band of
18% of the height (Play allows taglines up to 20%): a word in the game's dot-matrix alphabet
and one line of plain text, localised per locale. Play rules this follows: no device frames,
no calls to action, no price, ranking or award claims, JPEG or 24-bit PNG without alpha.

Android captures at exactly 1080x1920 (a 9:16 emulator, say) have the system navigation
handle painted out with the background around it; nothing else in a capture is changed.
Shots whose capture is missing are skipped, and the rest numbered in order.
"""

import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "assets"
PLAY_DIR = ASSETS_DIR / "google-play"
CAPTURES_DIR = PLAY_DIR / "captures"
SCREENSHOTS_DIR = PLAY_DIR / "screenshots"
FONT = PLAY_DIR / "fonts" / "Roboto.ttf"
GLYPHS_TS = ROOT / "src" / "presentation" / "dotmatrix" / "glyphs.ts"

INK = (0x0B, 0x0E, 0x14)
WHITE = (0xF4, 0xF6, 0xFB)
PINK, BLUE, GREEN = (0xE9, 0x1E, 0x63), (0x21, 0x96, 0xF3), (0x8B, 0xC3, 0x4A)
TRIO = (PINK, BLUE, GREEN)

# Supersampling for everything drawn here (dots, text), downscaled with Lanczos at the end
SS = 3

# Screenshot canvas: 9:16 at the size Play asks of games for its promotional formats
SHOT_W, SHOT_H = 1080, 1920
CAPTION_H = 346  # 18% of the height
SHOT_MARGIN = 54  # around the capture, below the caption
CAPTURE_RADIUS = 40

# Where a 1080x1920 capture has the gesture navigation handle
HANDLE_BOX = (360, 1860, 720, 1912)

# The game's alphabet has no Swedish letters; these follow its 5x7 grid, with the marks on
# the top row and the letter one row shorter, as dot-matrix displays do it
EXTRA_GLYPHS = {
    "Å": ["..#..", ".###.", "#...#", "#...#", "#####", "#...#", "#...#"],
    "Ä": [".#.#.", ".###.", "#...#", "#...#", "#####", "#...#", "#...#"],
    "Ö": [".#.#.", ".###.", "#...#", "#...#", "#...#", "#...#", ".###."],
}
LETTER_GAP = 1
DOT_SCALE = 0.4  # dot radius per pitch, as in the game

# The screenshots, in listing order. `capture` names a file in captures/; `accent` is the
# colour of the caption word (Tiltling's colour in that capture, or the trio for the title);
# `crop_top`, if set, is the first row kept of a capture taller than 9:16.
SHOTS = [
    # Rows 244-2484 keep both the pause button and the point dot at the bottom
    {"name": "gulp", "capture": "gulp", "accent": [PINK], "crop_top": 244},
    {"name": "switch", "capture": "switch", "accent": [BLUE]},
    {"name": "combo", "capture": "combo", "accent": [GREEN]},
    {"name": "ptoo", "capture": "ptoo", "accent": [PINK]},
    {"name": "title", "capture": "title", "accent": list(TRIO)},
    {"name": "game-over", "capture": "game-over", "accent": [BLUE]},
    {"name": "speed", "capture": "speed", "accent": [PINK]},
    {"name": "calibrate", "capture": "calibrate", "accent": [GREEN]},
]

CAPTIONS = {
    "en-US": {
        "gulp": ("GULP", "Steer Tiltling into dots of its own colour"),
        "switch": ("SWITCH", "Point dots: it eats any, then takes their colour"),
        "combo": ("COMBO", "Quick bites pay more, catch after catch"),
        "ptoo": ("PTOO!", "Any other colour gets spat out. Run over."),
        "title": ("TILT", "A small, hungry dot that goes where you tilt"),
        "game-over": ("AGAIN?", "How far can you take Tiltling?"),
        "speed": ("YOUR SPEED", "Slow, normal or fast. Tilt to feel each one."),
        "calibrate": ("YOUR GRIP", "Level is however you like to hold your phone"),
    },
    "sv-SE": {
        "gulp": ("SMASK", "Styr Tiltling till prickar i sin egen färg"),
        "switch": ("NY FÄRG", "Poängprickar äter den alltid, och byter färg"),
        "combo": ("KOMBO", "Snabba tuggor ger mer för varje fångst"),
        "ptoo": ("PTOO!", "Fel färg spottas ut, och rundan är över"),
        "title": ("LUTA", "En liten, hungrig prick som åker dit du lutar"),
        "game-over": ("IGEN?", "Hur långt kan du ta Tiltling?"),
        "speed": ("DITT TEMPO", "Långsam, normal eller snabb. Luta och känn efter."),
        "calibrate": ("DITT GREPP", "Kalibrera efter hur du vill hålla mobilen"),
    },
}

FEATURE_W, FEATURE_H = 1024, 500
FEATURE_TAGLINES = {
    "en-US": "A small, hungry dot that goes where your phone tilts",
    "sv-SE": "En liten, hungrig prick som åker dit du lutar mobilen",
}


def load_glyphs():
    """The game's glyph table, read from its TypeScript source, plus the Swedish letters."""
    glyphs = {}
    pattern = re.compile(r'^\s*(?:"(.)"|(\w)):\s*\[(.*?)\],?\s*$')
    for line in GLYPHS_TS.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line)
        if match:
            key = match.group(1) or match.group(2)
            glyphs[key] = re.findall(r'"([.#]+)"', match.group(3))
    if "A" not in glyphs:
        raise SystemExit(f"No glyphs found in {GLYPHS_TS}")
    glyphs.update(EXTRA_GLYPHS)
    return glyphs


GLYPHS = load_glyphs()


def font(size, weight=400):
    f = ImageFont.truetype(str(FONT), size)
    try:
        f.set_variation_by_axes([weight, 100, 0])
    except OSError:
        pass  # a static Roboto: its own weight
    return f


def dot_matrix(text, pitch, colors, glow=True):
    """RGBA: `text` in the dot-matrix alphabet, one colour per letter (cycling `colors`), with
    a soft glow in each dot's colour. `pitch` is the dot-to-dot distance in final pixels."""
    chars = list(text.upper())
    widths = [len(GLYPHS.get(c, GLYPHS["?"])[0]) for c in chars]
    cols = sum(widths) + LETTER_GAP * (len(chars) - 1)
    pad = pitch * 2
    p = pitch * SS
    w, h = round((cols * pitch + pad * 2) * SS), round((7 * pitch + pad * 2) * SS)
    dots = Image.new("RGBA", (w, h))
    draw = ImageDraw.Draw(dots)
    col = 0
    letter = 0
    for ch, width in zip(chars, widths):
        rows = GLYPHS.get(ch, GLYPHS["?"])
        color = colors[letter % len(colors)]
        for r, row in enumerate(rows):
            for c, cell in enumerate(row):
                if cell == "#":
                    cx = pad * SS + (col + c + 0.5) * p
                    cy = pad * SS + (r + 0.5) * p
                    rad = DOT_SCALE * p
                    draw.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=color + (255,))
        col += width + LETTER_GAP
        if ch != " ":
            letter += 1
    out = dots
    if glow:
        halo = dots.filter(ImageFilter.GaussianBlur(p * 0.9))
        halo.putalpha(halo.getchannel("A").point(lambda a: round(a * 0.55)))
        out = Image.alpha_composite(halo, dots)
    return out.resize((w // SS, h // SS), Image.LANCZOS), pad


def radial(size, center, radius, color, inner_alpha, falloff=1.0):
    """RGBA: a soft disc of `color`, `inner_alpha` at `center` fading to 0 at `radius`."""
    layer = Image.new("RGBA", size, color + (0,))
    mask = Image.new("L", (256, 256))
    mask.putdata(
        [
            round(inner_alpha * 255 * max(0.0, 1 - (((x - 127.5) ** 2 + (y - 127.5) ** 2) ** 0.5 / 127.5)) ** falloff)
            for y in range(256)
            for x in range(256)
        ]
    )
    box = (round(center[0] - radius), round(center[1] - radius), round(center[0] + radius), round(center[1] + radius))
    alpha = Image.new("L", size)
    alpha.paste(mask.resize((box[2] - box[0], box[3] - box[1]), Image.BICUBIC), box[:2])
    layer.putalpha(alpha)
    return layer


def sphere(r, color, glow=1.0):
    """RGBA, (r * 4) square: a game dot of radius `r`: flat colour, a soft light near the top
    and a glow in its own colour, as the game draws them."""
    size = r * 4 * SS
    c = size / 2
    R = r * SS
    out = radial((size, size), (c, c), R * 2, color, 0.45 * glow, falloff=2.2)
    body = Image.new("RGBA", (size, size), color + (0,))
    disc = Image.new("L", (size, size))
    ImageDraw.Draw(disc).ellipse((c - R, c - R, c + R, c + R), fill=255)
    body.putalpha(disc)
    light = radial((size, size), (c - R * 0.12, c - R * 0.42), R * 0.78, (255, 255, 255), 0.42, falloff=1.4)
    light.putalpha(ImageChops.multiply(light.getchannel("A"), disc))
    out = Image.alpha_composite(out, body)
    out = Image.alpha_composite(out, light)
    return out.resize((r * 4, r * 4), Image.LANCZOS)


def paste_center(base, layer, x, y):
    base.alpha_composite(layer, (round(x - layer.width / 2), round(y - layer.height / 2)))


def clean_handle(capture):
    """The capture with the navigation handle painted out: each column of the handle's box is
    blended from the pixels just above it to the pixels just below it."""
    out = capture.copy()
    px = out.load()
    x0, y0, x1, y1 = HANDLE_BOX
    y1 = min(y1, out.height - 1)
    for x in range(x0, x1):
        top, bottom = px[x, y0 - 1], px[x, y1]
        for y in range(y0, y1):
            t = (y - y0 + 1) / (y1 - y0 + 1)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return out


def to_nine_sixteen(capture, crop_top=None):
    """`capture` as 9:16: a taller capture is cropped to the rows that have something on them
    (centred), or from just above the top of its content when that is taller than 9:16, so the
    score stays in. Emulator captures (already 1080x1920) lose their navigation handle."""
    if capture.size == (SHOT_W, SHOT_H):
        return clean_handle(capture)
    w, h = capture.size
    window = round(w * 16 / 9)
    if window > h:
        raise SystemExit(f"Capture {w}x{h} is wider than 9:16")
    grey = capture.convert("L").resize((w // 4, h // 4))
    rows = [y * 4 for y in range(grey.height) if grey.crop((0, y, grey.width, y + 1)).getextrema()[1] > 110]
    top, bottom = (rows[0], rows[-1]) if rows else (0, h)
    if crop_top is not None:
        y0 = crop_top
    elif bottom - top <= window:
        y0 = (top + bottom) // 2 - window // 2
    else:
        y0 = top - 40
    y0 = max(0, min(h - window, y0))
    return capture.crop((0, y0, w, y0 + window))


def rounded(img, radius):
    mask = Image.new("L", (img.width * SS, img.height * SS))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, mask.width - 1, mask.height - 1), radius * SS, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


def screenshot(capture, word, line, accent, crop_top=None):
    canvas = Image.new("RGBA", (SHOT_W, SHOT_H), INK + (255,))
    # The caption sits in the light of Tiltling's colour, as the game's edges do
    for i, color in enumerate(accent):
        x = SHOT_W / 2 + (i - (len(accent) - 1) / 2) * 300
        canvas.alpha_composite(radial(canvas.size, (x, -40), 760, color, 0.30, falloff=1.6))

    word_img, pad = dot_matrix(word, 15, accent)
    if word_img.width - pad * 2 > SHOT_W - 120:
        word_img, pad = dot_matrix(word, 15 * (SHOT_W - 120) / (word_img.width - pad * 2), accent)
    paste_center(canvas, word_img, SHOT_W / 2, 128)

    text_font = font(44, 400)
    draw = ImageDraw.Draw(canvas)
    draw.text((SHOT_W / 2, 262), line, font=text_font, fill=WHITE + (235,), anchor="mm")
    if draw.textlength(line, font=text_font) > SHOT_W - 100:
        raise SystemExit(f"Caption too long for one line: {line!r}")

    capture = to_nine_sixteen(capture.convert("RGB"), crop_top)
    area_h = SHOT_H - CAPTION_H - SHOT_MARGIN
    scale = area_h / capture.height
    shot = capture.resize(
        (round(capture.width * scale), area_h), Image.LANCZOS
    )
    shot = rounded(shot, CAPTURE_RADIUS)
    x = (SHOT_W - shot.width) // 2
    # A faint rim so the capture's dark edges read against the page
    rim = Image.new("RGBA", (shot.width + 4, shot.height + 4))
    ImageDraw.Draw(rim).rounded_rectangle(
        (0, 0, rim.width - 1, rim.height - 1), CAPTURE_RADIUS + 2, fill=WHITE + (28,)
    )
    canvas.alpha_composite(rim, (x - 2, CAPTION_H - 2))
    canvas.alpha_composite(shot, (x, CAPTION_H))
    return canvas.convert("RGB")


def feature_graphic(tagline):
    W, H = FEATURE_W, FEATURE_H
    # Deep blue-violet rather than the game's ink: Play's own background is dark, and a
    # near-black graphic would sink into it. The game's colours glow in from the edges.
    canvas = Image.new("RGBA", (W, H), (0x24, 0x1C, 0x5C, 255))
    shade = Image.linear_gradient("L").rotate(90).resize((W, H))
    canvas.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (W, H), (0x10, 0x2A, 0x62)).split(), shade.point(lambda v: round(v * 0.9)))))
    canvas.alpha_composite(radial((W, H), (-60, 560), 640, PINK, 0.62, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (1100, -80), 600, BLUE, 0.62, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (1080, 580), 420, GREEN, 0.42, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (W / 2, H / 2 - 10), 380, (0x0B, 0x0E, 0x14), 0.38, falloff=1.2))

    # Small dots near the edges, away from the name
    for x, y, r, color in [
        (70, 92, 13, GREEN),
        (168, 402, 10, BLUE),
        (300, 66, 9, PINK),
        (742, 448, 11, GREEN),
        (902, 120, 12, PINK),
        (962, 362, 10, BLUE),
        (618, 54, 8, BLUE),
        (60, 300, 8, PINK),
    ]:
        paste_center(canvas, sphere(r, color), x, y)

    # Tiltling, pink, about to gulp a pink dot; a point dot waits on the right
    paste_center(canvas, sphere(46, PINK, glow=1.3), 176, 246)
    paste_center(canvas, sphere(15, PINK), 232, 164)
    point = sphere(34, BLUE, glow=1.4)
    point.alpha_composite(sphere(16, GREEN, glow=0.4), (point.width // 2 - 32, point.height // 2 - 32))
    paste_center(canvas, point, 858, 248)

    name, _ = dot_matrix("TILTLING", 11, list(TRIO))
    paste_center(canvas, name, W / 2 + 4, 214)
    ImageDraw.Draw(canvas).text(
        (W / 2 + 4, 312), tagline, font=font(25, 400), fill=WHITE + (230,), anchor="mm"
    )
    return canvas.convert("RGB")


def main():
    PLAY_DIR.mkdir(parents=True, exist_ok=True)

    icon = Image.open(ASSETS_DIR / "icon.png").convert("RGBA").resize((512, 512), Image.LANCZOS)
    icon.save(PLAY_DIR / "icon.png", optimize=True)

    for locale, tagline in FEATURE_TAGLINES.items():
        name = "feature-graphic.png" if locale == "en-US" else f"feature-graphic-{locale}.png"
        feature_graphic(tagline).save(PLAY_DIR / name, optimize=True)

    for locale, captions in CAPTIONS.items():
        out_dir = SCREENSHOTS_DIR / locale
        out_dir.mkdir(parents=True, exist_ok=True)
        for old in out_dir.glob("*.png"):
            old.unlink()
        # Shots whose capture is missing are left out; the rest are numbered in order
        available = [shot for shot in SHOTS if (CAPTURES_DIR / f"{shot['capture']}.png").exists()]
        for shot in SHOTS:
            if shot not in available:
                print(f"skip {locale} {shot['name']}: no captures/{shot['capture']}.png")
        for number, shot in enumerate(available, start=1):
            path = CAPTURES_DIR / f"{shot['capture']}.png"
            capture = Image.open(path).convert("RGB")
            word, line = captions[shot["name"]]
            screenshot(capture, word, line, shot["accent"], shot.get("crop_top")).save(
                out_dir / f"{number:02d}-{shot['name']}.png", optimize=True
            )

    for path in sorted(PLAY_DIR.rglob("*.png")):
        if "captures" in path.parts:
            continue
        with Image.open(path) as img:
            print(f"{path.relative_to(ROOT)}  {img.width}x{img.height} {img.mode}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
