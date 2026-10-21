#!/usr/bin/env python3
"""Compose Tiltling's App Store graphics from the game's own pieces.

Usage (from the repo root, or anywhere):

    python3 scripts/app-store-assets.py

Requires only Python 3 and Pillow, and draws with the helpers of store-assets.py (the Play
graphics), so the two stores share one look. Reads:

    assets/app-store/captures/*.png    1206x2622 captures of the game on an iPhone 16 Pro
                                       simulator, from the capture build (see README)
    assets/icon.png                    the app icon artwork

and overwrites these files in ``assets/app-store/``:

    screenshots/<locale>/medium/NN-*.png   1206x2622  iPhone with Dynamic Island, medium (required)
    screenshots/<locale>/large/NN-*.png    1290x2796  iPhone with Dynamic Island, large
    header.png, header-sv-SE.png           5244x2950  16:9 universal creative asset: the product
                                                      page header, reused in search results

Each screenshot shows its capture whole, with the top inset (the Dynamic Island's black band)
and the home indicator taken off, in a rounded pane lit from behind in Tiltling's colour, under
a caption: the word the game would say in its dot-matrix alphabet, and one line in the system
font, as the game's own captions are set on iOS. Shots whose capture is missing are skipped and
the rest numbered in order. The large set is the medium one scaled up (the two aspects differ by
a third of a percent), so one layout serves both.

The header keeps everything that matters inside the middle 3:2 and 21:9 of the 16:9 canvas,
since the App Store crops it both ways: to 21:9 at the top of the product page and to 3:2 in
search results. It has no price, URL or claim, and reads the same in Light and Dark Mode.
"""

import importlib.util
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STORE_DIR = ROOT / "assets" / "app-store"
CAPTURES_DIR = STORE_DIR / "captures"
SCREENSHOTS_DIR = STORE_DIR / "screenshots"

# The Play script, loaded as a module (its name is not importable as written)
_spec = importlib.util.spec_from_file_location("store_assets", Path(__file__).with_name("store-assets.py"))
play = importlib.util.module_from_spec(_spec)
sys.modules["store_assets"] = play
_spec.loader.exec_module(play)
INK, WHITE, PINK, BLUE, GREEN, TRIO, SS = play.INK, play.WHITE, play.PINK, play.BLUE, play.GREEN, play.TRIO, play.SS
dot_matrix, radial, sphere, paste_center, rounded = play.dot_matrix, play.radial, play.sphere, play.paste_center, play.rounded

# The required iPhone size: the simulator's own, so captures are used at 1:1
SHOT_W, SHOT_H = 1206, 2622
LARGE_W, LARGE_H = 1290, 2796
CAPTION_H = 472  # 18% of the height, as on Play
SHOT_MARGIN = 60
PANE_RADIUS = 48
# The capture's top inset: 62 points of black above the stage on an iPhone 16 Pro, at 3x
TOP_INSET = 186
# Where the simulator's home indicator sits in a capture
HOME_BAR_BOX = (380, 2572, 826, 2610)

HEADER_W, HEADER_H = 5244, 2950

# Apple's system font, which the game's captions are set in on iOS; Roboto if this is not a Mac
SYSTEM_FONT = Path("/System/Library/Fonts/SFNS.ttf")

# The screenshots, in listing order: the first three show in search results, so they tell the
# game's rules before its menus. `capture` names a file in captures/; `accent` is the colour of
# the caption word (Tiltling's colour in that capture, or the trio for the title).
SHOTS = [
    {"name": "gulp", "accent": [PINK]},
    {"name": "ptoo", "accent": [PINK]},
    {"name": "switch", "accent": [BLUE]},
    {"name": "combo", "accent": [GREEN]},
    {"name": "game-over", "accent": [BLUE]},
    {"name": "title", "accent": list(TRIO)},
    {"name": "speed", "accent": [PINK]},
    {"name": "grip", "accent": [GREEN]},
    {"name": "pause", "accent": [BLUE]},
]

# The App Store's primary language is English (U.S.), so the English copy spells "color"
CAPTIONS = {
    "en-US": {
        "gulp": ("GULP", "Steer Tiltling into dots of its own color"),
        "ptoo": ("PTOO!", "One wrong bite and the run is over"),
        "switch": ("SWITCH", "Point dots: it eats any, then takes their color"),
        "combo": ("COMBO", "Quick bites pay more, catch after catch"),
        "game-over": ("AGAIN?", "How far can you take Tiltling?"),
        "title": ("TILT", "A small, hungry dot that goes where you tilt"),
        "speed": ("YOUR SPEED", "Slow, normal or fast. Tilt to feel each one."),
        "grip": ("YOUR GRIP", "Level is however you like to hold your phone"),
        "pause": ("BREATHE", "Pause, and the field frosts over until you’re level"),
    },
    "sv-SE": {
        "gulp": ("SMASK", "Styr Tiltling till prickar i sin egen färg"),
        "ptoo": ("PTOO!", "En fel tugga och rundan är över"),
        "switch": ("NY FÄRG", "Poängprickar äter den alltid, och byter färg"),
        "combo": ("KOMBO", "Snabba tuggor ger mer för varje fångst"),
        "game-over": ("IGEN?", "Hur långt kan du ta Tiltling?"),
        "title": ("LUTA", "En liten, hungrig prick som åker dit du lutar"),
        "speed": ("DITT TEMPO", "Långsam, normal eller snabb. Luta och känn efter."),
        "grip": ("DITT GREPP", "Plant är precis som du vill hålla mobilen"),
        "pause": ("ANDAS", "Pausa, så frostar planen över tills du håller plant"),
    },
}

HEADER_TAGLINES = {
    "en-US": "A small, hungry dot that goes where your phone tilts",
    "sv-SE": "En liten, hungrig prick som åker dit du lutar mobilen",
}


def font(size, weight="Regular"):
    if SYSTEM_FONT.exists():
        f = ImageFont.truetype(str(SYSTEM_FONT), size)
        try:
            f.set_variation_by_name(weight)
        except OSError:
            pass
        return f
    return play.font(size, {"Regular": 400, "Medium": 500, "Semibold": 600}[weight])


def clean_home_bar(capture):
    """The capture with the home indicator painted out: each column of its box is blended from
    the pixels just above it to the pixels just below it."""
    out = capture.copy()
    px = out.load()
    x0, y0, x1, y1 = HOME_BAR_BOX
    for x in range(x0, x1):
        top, bottom = px[x, y0 - 1], px[x, y1]
        for y in range(y0, y1):
            t = (y - y0 + 1) / (y1 - y0 + 1)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return out


def stage(capture):
    """The game's stage out of a simulator capture: the top inset off, the home indicator gone."""
    if capture.size != (SHOT_W, SHOT_H):
        raise SystemExit(f"Capture is {capture.width}x{capture.height}, not {SHOT_W}x{SHOT_H}")
    return clean_home_bar(capture).crop((0, TOP_INSET, SHOT_W, SHOT_H))


def screenshot(capture, word, line, accent):
    canvas = Image.new("RGBA", (SHOT_W, SHOT_H), INK + (255,))
    # The caption sits in the light of Tiltling's colour, as the game's edges do
    for i, color in enumerate(accent):
        x = SHOT_W / 2 + (i - (len(accent) - 1) / 2) * 330
        canvas.alpha_composite(radial(canvas.size, (x, -40), 850, color, 0.30, falloff=1.6))

    word_img, pad = dot_matrix(word, 17, accent)
    if word_img.width - pad * 2 > SHOT_W - 130:
        word_img, pad = dot_matrix(word, 17 * (SHOT_W - 130) / (word_img.width - pad * 2), accent)
    paste_center(canvas, word_img, SHOT_W / 2, 143)

    text_font = font(49)
    draw = ImageDraw.Draw(canvas)
    draw.text((SHOT_W / 2, 293), line, font=text_font, fill=WHITE + (235,), anchor="mm")
    if draw.textlength(line, font=text_font) > SHOT_W - 110:
        raise SystemExit(f"Caption too long for one line: {line!r}")

    shot = stage(capture.convert("RGB"))
    area_h = SHOT_H - CAPTION_H - SHOT_MARGIN
    scale = area_h / shot.height
    shot = rounded(shot.resize((round(shot.width * scale), area_h), Image.LANCZOS), PANE_RADIUS)
    x = (SHOT_W - shot.width) // 2
    # The pane is lit from behind in Tiltling's colour, as a dot is, with a faint rim so its
    # dark edges read against the page
    glow = radial(canvas.size, (SHOT_W / 2, CAPTION_H + area_h / 2), area_h * 0.72, accent[0], 0.26, falloff=1.3)
    canvas.alpha_composite(glow)
    rim = Image.new("RGBA", (shot.width + 4, shot.height + 4))
    ImageDraw.Draw(rim).rounded_rectangle((0, 0, rim.width - 1, rim.height - 1), PANE_RADIUS + 2, fill=WHITE + (30,))
    canvas.alpha_composite(rim, (x - 2, CAPTION_H - 2))
    canvas.alpha_composite(shot, (x, CAPTION_H))
    return canvas.convert("RGB")


def large(shot):
    """The medium screenshot at the large display's size: scaled up, the margin trimmed."""
    scaled = shot.resize((LARGE_W, round(SHOT_H * LARGE_W / SHOT_W)), Image.LANCZOS)
    return scaled.crop((0, 0, LARGE_W, LARGE_H))


def header(tagline):
    """The 16:9 creative asset: the name in the game's alphabet over the game's colours, Tiltling
    about to gulp a dot on the left and a point dot waiting on the right, all inside the part
    that survives both of the App Store's crops."""
    W, H = HEADER_W, HEADER_H
    s = W / 1024  # the Play feature graphic's sizes, scaled to this canvas
    canvas = Image.new("RGBA", (W, H), (0x24, 0x1C, 0x5C, 255))
    shade = Image.linear_gradient("L").rotate(90).resize((W, H))
    canvas.alpha_composite(Image.merge("RGBA", (*Image.new("RGB", (W, H), (0x10, 0x2A, 0x62)).split(), shade.point(lambda v: round(v * 0.9)))))
    canvas.alpha_composite(radial((W, H), (-60 * s, H + 60 * s), 660 * s, PINK, 0.62, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (W + 60 * s, -80 * s), 640 * s, BLUE, 0.62, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (W - 20 * s, H + 60 * s), 440 * s, GREEN, 0.42, falloff=1.4))
    canvas.alpha_composite(radial((W, H), (W / 2, H / 2), 420 * s, INK, 0.38, falloff=1.2))

    # Safe area: the middle 3:2 (search results) and 21:9 (product page) of the canvas
    safe_w, safe_h = H * 3 / 2, W * 9 / 21
    x0, y0 = (W - safe_w) / 2, (H - safe_h) / 2

    # A few small dots near the safe area's edges, away from the name
    for fx, fy, r, color in [
        (0.04, 0.12, 13, GREEN),
        (0.10, 0.86, 10, BLUE),
        (0.70, 0.93, 11, GREEN),
        (0.88, 0.16, 12, PINK),
        (0.58, 0.05, 8, BLUE),
    ]:
        paste_center(canvas, sphere(round(r * s), color), x0 + fx * safe_w, y0 + fy * safe_h)

    # Tiltling, pink, about to gulp a pink dot; a point dot waits on the right
    paste_center(canvas, sphere(round(46 * s), PINK, glow=1.3), x0 + 0.14 * safe_w, y0 + 0.5 * safe_h)
    paste_center(canvas, sphere(round(15 * s), PINK), x0 + 0.20 * safe_w, y0 + 0.31 * safe_h)
    point = sphere(round(34 * s), BLUE, glow=1.4)
    inner = sphere(round(16 * s), GREEN, glow=0.4)
    point.alpha_composite(inner, (point.width // 2 - inner.width // 2, point.height // 2 - inner.height // 2))
    paste_center(canvas, point, x0 + 0.86 * safe_w, y0 + 0.5 * safe_h)

    name, _ = dot_matrix("TILTLING", round(11 * s), list(TRIO))
    paste_center(canvas, name, W / 2 + 4 * s, y0 + 0.43 * safe_h)
    ImageDraw.Draw(canvas).text((W / 2 + 4 * s, y0 + 0.64 * safe_h), tagline, font=font(round(25 * s)), fill=WHITE + (230,), anchor="mm")
    return canvas.convert("RGB")


def main():
    STORE_DIR.mkdir(parents=True, exist_ok=True)

    for locale, tagline in HEADER_TAGLINES.items():
        name = "header.png" if locale == "en-US" else f"header-{locale}.png"
        header(tagline).save(STORE_DIR / name, optimize=True)

    for locale, captions in CAPTIONS.items():
        dirs = {size: SCREENSHOTS_DIR / locale / size for size in ("medium", "large")}
        for out_dir in dirs.values():
            out_dir.mkdir(parents=True, exist_ok=True)
            for old in out_dir.glob("*.png"):
                old.unlink()
        # Shots whose capture is missing are left out; the rest are numbered in order
        available = [shot for shot in SHOTS if (CAPTURES_DIR / f"{shot['name']}.png").exists()]
        for shot in SHOTS:
            if shot not in available:
                print(f"skip {locale} {shot['name']}: no captures/{shot['name']}.png")
        for number, shot in enumerate(available, start=1):
            capture = Image.open(CAPTURES_DIR / f"{shot['name']}.png").convert("RGB")
            word, line = captions[shot["name"]]
            medium = screenshot(capture, word, line, shot["accent"])
            medium.save(dirs["medium"] / f"{number:02d}-{shot['name']}.png", optimize=True)
            large(medium).save(dirs["large"] / f"{number:02d}-{shot['name']}.png", optimize=True)

    for path in sorted(STORE_DIR.rglob("*.png")):
        if "captures" in path.parts:
            continue
        with Image.open(path) as img:
            print(f"{path.relative_to(ROOT)}  {img.width}x{img.height} {img.mode}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
