#!/usr/bin/env python3
"""Vertical promo clip: collage tiles slideshow -> arc -> two title cards -> loop.

Timeline (seconds, same as the reference clip, 10.75 s, loops seamlessly):
  0.00-4.17  tiles cycle A/B/C/D every 0.5 s (arc draws in at 1.58-2.08)
  4.17-4.75  tiles cut away, only the arc
  4.75-6.50  title 1 (e.g. "Haiku 5.5")
  6.50-8.25  title 2 (icon + brand, e.g. spark + "Claude")
  8.25-8.80  text gone, arc wipes out left to right
  8.75-10.75 tiles cycle again A/B/C/D

Themes:
  claude  minimal paper collage on off-white (the reference look)
  brawl   cartoon game style: dark blue, outlined tiles, yellow arc, bold text

Usage:
  python3 make_video.py --out promo.mp4
  python3 make_video.py --theme brawl --out brawl.mp4
  python3 make_video.py --title "Haiku 5.5" --brand "Claude" --fps 30
"""
import argparse
import importlib
import math
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

DURATION = 10.75

# Reference geometry on a 720x1280 canvas; scaled to the output width.
TILE = 273
TILES = [  # (x, y, notch) notch = which quadrant is cut out
    (228, 76, "br"),
    (224, 502, None),
    (218, 930, "tr"),
]
ARC_PEAK_Y = 681.0
ARC_EDGE_Y = 717.0
TEXT_BASELINE = 652.0

# (start, end, set index or None)
SCHEDULE = [
    (0.0, 0.5, 0), (0.5, 1.0, 1), (1.0, 1.5, 2), (1.5, 25 / 12, 3),
    (25 / 12, 2.5, 0), (2.5, 3.0, 1), (3.0, 3.5, 2), (3.5, 50 / 12, 3),
    (50 / 12, 105 / 12, None),
    (105 / 12, 9.25, 0), (9.25, 9.75, 1), (9.75, 10.25, 2), (10.25, DURATION, 3),
]
ARC_IN = (19 / 12, 25 / 12)      # draws in, left -> right
ARC_OUT = (8.27, 8.79)           # wipes out, left -> right
TITLE1 = (57 / 12, 78 / 12)
TITLE2 = (78 / 12, 99 / 12)

GF = "https://fonts.googleapis.com/css2?family="
THEMES = {
    "claude": dict(
        textures="textures",
        bg=(249, 249, 247), bg_glow=None,
        arc=[((22, 22, 22), 2.3)],          # (colour, width) strokes, bottom first
        tile_outline=0, tile_shadow=0,
        title="Haiku 5.5", brand="Claude",
        fonts=[("Literata-500.ttf", GF + "Literata:opsz,wght@12,500")],
        ref_text="Haiku 5.5", ref_width=324.0, tracking=-0.018,
        text_fill=(22, 22, 22), text_fill2=(22, 22, 22), stroke=0, shadow=0,
        icon="spark", icon_color=(217, 119, 87), icon_size=66, icon_gap=15, cap=58.0,
        pop=False, sound=False,
    ),
    "brawl": dict(
        textures="textures_brawl",
        bg=(26, 30, 96), bg_glow=(64, 92, 214),
        arc=[((16, 12, 24), 10.0), ((255, 206, 0), 5.0)],
        tile_outline=3.2, tile_shadow=7,
        title="BRAWL STARS", brand="ИГРАЙ СЕЙЧАС",
        fonts=[("LilitaOne.ttf", GF + "Lilita+One"), ("Rubik-900.ttf", GF + "Rubik:wght@900")],
        ref_text="BRAWL STARS", ref_width=590.0, tracking=0.0,
        text_fill=(255, 212, 0), text_fill2=(255, 255, 255), stroke=0.075, shadow=0.09,
        icon="star", icon_color=(255, 212, 0), icon_size=96, icon_gap=10, cap=62.0,
        pop=True, sound=True,
    ),
}


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return 0.5 * (u + (1 - math.cos(math.pi * u)) / 2)


def ease_out_back(u, s=2.2):
    u = min(max(u, 0.0), 1.0) - 1
    return 1 + (s + 1) * u ** 3 + s * u ** 2


def fetch_font(fname, css_url):
    path = os.path.join(HERE, "fonts", fname)
    if os.path.exists(path):
        return path
    try:
        css = urllib.request.urlopen(css_url, timeout=20).read().decode()
        url = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        urllib.request.urlretrieve(url, path)
        return path
    except Exception as e:  # offline: fall back to a system font
        print(f"font download failed ({fname}), using DejaVu:", e, file=sys.stderr)
        return "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"


def covers(font_path, text):
    font = ImageFont.truetype(font_path, 40)
    return all(ch.isspace() or font.getmask(ch).getbbox() is not None for ch in text)


class Renderer:
    def __init__(self, width, theme, title, brand, seed, font=None):
        self.th = th = THEMES[theme]
        self.W = width
        self.H = round(width * 16 / 9)
        self.k = width / 720.0
        self.seed = seed
        self.fonts = [font] if font else [fetch_font(f, u) for f, u in th["fonts"]]
        self.tex = importlib.import_module(th["textures"])
        self.blank = self._background()
        self.sets = [self._tiles_frame(i) for i in range(4)]
        self.arc_rgb, self.arc_a = self._arc_layer()
        self.arc_x = np.arange(self.W, dtype=np.float32)
        self.title1 = self._text_sprite(title or th["title"], icon=False, fill=th["text_fill"])
        self.title2 = self._text_sprite(brand or th["brand"], icon=True, fill=th["text_fill2"])

    # -------------------------------------------------------------- layers
    def _background(self):
        th = self.th
        if not th["bg_glow"]:
            return Image.new("RGB", (self.W, self.H), th["bg"])
        y, x = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        r = np.sqrt(((x - self.W / 2) / self.W) ** 2 + ((y - self.H * 0.47) / self.H) ** 2 * 0.9)
        m = np.clip(1 - r / 0.62, 0, 1) ** 1.6
        img = np.array(th["bg"], np.float32) * (1 - m[..., None]) + np.array(th["bg_glow"], np.float32) * m[..., None]
        stripes = (np.floor((x + y) / (46 * self.k)) % 2) * 0.035
        img *= (1 + stripes)[..., None]
        return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

    def _tile_poly(self, x, y, n, notch):
        h = round(n * 136 / 273)
        if notch == "br":
            return [(x, y), (x + n, y), (x + n, y + n - h), (x + n - h, y + n - h), (x + n - h, y + n), (x, y + n)]
        if notch == "tr":
            return [(x, y), (x + n - h, y), (x + n - h, y + h), (x + n, y + h), (x + n, y + n), (x, y + n)]
        return [(x, y), (x + n, y), (x + n, y + n), (x, y + n)]

    def _tiles_frame(self, i):
        th, k = self.th, self.k
        n = round(TILE * k)
        im = self.blank.copy()
        polys = [self._tile_poly(round(x * k), round(y * k), n, notch) for x, y, notch in TILES]
        if th["tile_shadow"]:
            sh = Image.new("L", im.size, 0)
            o = th["tile_shadow"] * k
            for p in polys:
                ImageDraw.Draw(sh).polygon([(px + o, py + o) for px, py in p], fill=110)
            im.paste(Image.new("RGB", im.size, (6, 6, 20)), (0, 0), sh)
        for (x, y, notch), p, tex in zip(TILES, polys, self.tex.make_set(i, n, self.seed)):
            mask = Image.new("L", (n, n), 0)
            x0, y0 = round(x * k), round(y * k)
            ImageDraw.Draw(mask).polygon([(px - x0, py - y0) for px, py in p], fill=255)
            im.paste(Image.fromarray(tex), (x0, y0), mask)
        if th["tile_outline"]:
            ss = 2
            ol = Image.new("L", (self.W * ss, self.H * ss), 0)
            d = ImageDraw.Draw(ol)
            for p in polys:
                d.line([(px * ss, py * ss) for px, py in p + p[:1]], fill=255,
                       width=round(th["tile_outline"] * k * ss), joint="curve")
            ol = ol.resize(im.size, Image.LANCZOS)
            im.paste(Image.new("RGB", im.size, (16, 12, 24)), (0, 0), ol)
        return im

    def _arc_layer(self):
        ss = 3
        W, H, k = self.W * ss, self.H * ss, self.k * ss
        sag = ARC_EDGE_Y - ARC_PEAK_Y
        R = (360 ** 2 + sag ** 2) / (2 * sag)
        cy = ARC_PEAK_Y + R
        pts = []
        for i in range(401):
            x = -12 + (744 * i / 400)
            y = cy - math.sqrt(R * R - (x - 360) ** 2)
            pts.append((x * k, y * k))
        rgb = np.zeros((self.H, self.W, 3), np.float32)
        alpha = np.zeros((self.H, self.W), np.float32)
        for color, width in self.th["arc"]:
            lay = Image.new("L", (W, H), 0)
            ImageDraw.Draw(lay).line(pts, fill=255, width=round(width * k), joint="curve")
            a = np.asarray(lay.resize((self.W, self.H), Image.LANCZOS)).astype(np.float32) / 255.0
            rgb = rgb * (1 - a[..., None]) + np.array(color, np.float32) * a[..., None]
            alpha = alpha + a * (1 - alpha)
        rgb = np.where(alpha[..., None] > 0, rgb / np.maximum(alpha, 1e-6)[..., None], 0)
        return rgb, alpha

    def _spark(self, size):
        """Hand-drawn style asterisk: 12 tapered rays of uneven length."""
        ss = 4
        S = size * ss
        im = Image.new("L", (S, S), 0)
        d = ImageDraw.Draw(im)
        c = S / 2
        rng = np.random.default_rng(3)
        n = 12
        for i in range(n):
            a = 2 * math.pi * i / n + rng.uniform(-0.09, 0.09) + 0.13
            L = S / 2 * rng.uniform(0.78, 0.98)
            w0, w1 = S * 0.12, S * 0.085
            ex, ey = c + math.cos(a) * L, c + math.sin(a) * L
            px, py = -math.sin(a), math.cos(a)
            sx, sy = c + math.cos(a) * S * 0.05, c + math.sin(a) * S * 0.05
            poly = [(sx + px * w0 / 2, sy + py * w0 / 2), (ex + px * w1 / 2, ey + py * w1 / 2),
                    (ex - px * w1 / 2, ey - py * w1 / 2), (sx - px * w0 / 2, sy - py * w0 / 2)]
            d.polygon(poly, fill=255)
            d.ellipse([ex - w1 / 2, ey - w1 / 2, ex + w1 / 2, ey + w1 / 2], fill=255)
        r = S * 0.17
        d.ellipse([c - r, c - r, c + r, c + r], fill=255)
        return im.resize((size, size), Image.LANCZOS)

    def _icon(self, size):
        th = self.th
        if th["icon"] == "spark":
            sprite = Image.new("RGBA", (size, size), th["icon_color"] + (255,))
            sprite.putalpha(self._spark(size))
            return sprite
        # chunky outlined star with drop shadow
        ss = 4
        S = size * ss
        im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)

        def star(cx, cy, r, inner=0.5):
            return [(cx + (r if i % 2 == 0 else r * inner) * math.cos(-math.pi / 2 + math.pi * i / 5),
                     cy + (r if i % 2 == 0 else r * inner) * math.sin(-math.pi / 2 + math.pi * i / 5)) for i in range(10)]
        r = S * 0.43
        d.polygon(star(S / 2, S / 2 + S * 0.05, r), fill=(16, 12, 24, 255))
        d.polygon(star(S / 2, S / 2, r), fill=th["icon_color"] + (255,), outline=(16, 12, 24, 255), width=round(S * 0.05))
        d.polygon(star(S / 2 - S * 0.03, S / 2 - S * 0.04, r * 0.45), fill=(255, 250, 210, 255))
        return im.resize((size, size), Image.LANCZOS)

    def _text_sprite(self, text, icon, fill):
        """Returns (RGBA sprite, (anchor_x, anchor_y) on the canvas) for a title card."""
        th, k = self.th, self.k
        fpath = next((f for f in self.fonts if covers(f, text)), self.fonts[-1])
        ref = ImageFont.truetype(self.fonts[0], 100)
        ref_w = sum(ref.getlength(ch) for ch in th["ref_text"]) + th["tracking"] * 100 * (len(th["ref_text"]) - 1)
        size = 100 * th["ref_width"] * k / ref_w
        icon_d = round(th["icon_size"] * k) if icon else 0
        gap = round(th["icon_gap"] * k) if icon else 0
        max_w = 670 * k
        while True:
            font = ImageFont.truetype(fpath, round(size))
            track = th["tracking"] * size
            widths = [font.getlength(ch) for ch in text]
            text_w = sum(widths) + track * (len(text) - 1)
            if icon_d + gap + text_w <= max_w or size < 10:
                break
            scale = max_w / (icon_d + gap + text_w)
            size *= scale
            icon_d, gap = round(icon_d * scale), round(gap * scale)
        stroke = round(th["stroke"] * size)
        shadow = round(th["shadow"] * size)
        total = icon_d + gap + text_w
        pad = stroke + shadow + round(20 * k)
        asc, desc = font.getmetrics()
        sw, sh = round(total + 2 * pad), round(asc + desc + 2 * pad)
        base = pad + asc
        lay = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        for dy, col in ((shadow, (16, 12, 24)), (0, fill)) if shadow else ((0, fill),):
            x = pad + icon_d + gap
            for ch, w in zip(text, widths):
                d.text((x, base + dy), ch, font=font, fill=col + (255,), anchor="ls",
                       stroke_width=stroke, stroke_fill=(16, 12, 24, 255))
                x += w + track
        if icon:
            sp = self._icon(icon_d)
            cy = base - th["cap"] * k * (size / (100 * th["ref_width"] * k / ref_w)) / 2 - 1 * k
            lay.alpha_composite(sp, (pad, round(cy - icon_d / 2)))
        # canvas position of the sprite's anchor (centre of the text, on the baseline)
        return lay, (self.W / 2, TEXT_BASELINE * self.k), (sw / 2, base)

    def _paste_title(self, out, spr, t0, t):
        lay, (ax, ay), (lx, ly) = spr
        s = 1.0
        if self.th["pop"]:
            s = max(0.05, 0.35 + 0.65 * ease_out_back((t - t0) / 0.28))
        if abs(s - 1) > 1e-3:
            lay = lay.resize((max(1, round(lay.width * s)), max(1, round(lay.height * s))), Image.BICUBIC)
            lx, ly = lx * s, ly * s
        out.alpha_composite(lay, (round(ax - lx), round(ay - ly)))

    # -------------------------------------------------------------- frame
    def frame(self, t):
        im = self.blank
        for a, b, s in SCHEDULE:
            if a - 1e-6 <= t < b - 1e-6:
                im = self.blank if s is None else self.sets[s]
                break
        arr = np.asarray(im).astype(np.float32)

        # arc visibility window in x (pixels)
        if ARC_IN[0] <= t < ARC_OUT[1]:
            p_in = ease((t - ARC_IN[0]) / (ARC_IN[1] - ARC_IN[0]))
            p_out = ease((t - ARC_OUT[0]) / (ARC_OUT[1] - ARC_OUT[0])) if t >= ARC_OUT[0] else 0.0
            lo, hi = p_out * (self.W + 4) - 2, p_in * (self.W + 4) - 2
            if hi > lo:
                xm = np.clip(self.arc_x - lo, 0, 1) * np.clip(hi - self.arc_x, 0, 1)
                a = (self.arc_a * xm[None, :])[..., None]
                arr = arr * (1 - a) + self.arc_rgb * a

        out = Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8)).convert("RGBA")
        if TITLE1[0] <= t < TITLE1[1]:
            self._paste_title(out, self.title1, TITLE1[0], t)
        elif TITLE2[0] <= t < TITLE2[1]:
            self._paste_title(out, self.title2, TITLE2[0], t)
        return out.convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--theme", choices=sorted(THEMES), default="claude")
    ap.add_argument("--out", default=None, help="output .mp4 (default: <theme>.mp4 next to this script)")
    ap.add_argument("--title", default=None, help="first title card (theme default if omitted)")
    ap.add_argument("--brand", default=None, help="second title card, shown with the icon")
    ap.add_argument("--width", type=int, default=1080)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--loops", type=int, default=1, help="repeat the 10.75 s cycle N times")
    ap.add_argument("--seed", type=int, default=7, help="texture variation seed")
    ap.add_argument("--font", default=None, help="path to a .ttf font to use for both titles")
    ap.add_argument("--still", type=float, default=None, help="save a single PNG frame at this time instead")
    ap.add_argument("--sound", action=argparse.BooleanOptionalAction, default=None,
                    help="add the synthesised soundtrack (default: on for brawl, off for claude)")
    args = ap.parse_args()
    out_path = args.out or os.path.join(HERE, "promo.mp4" if args.theme == "claude" else f"{args.theme}.mp4")

    r = Renderer(args.width, args.theme, args.title, args.brand, args.seed, args.font)
    if args.still is not None:
        out = os.path.splitext(out_path)[0] + f"_{args.still:.2f}s.png"
        r.frame(args.still).save(out)
        print(out)
        return

    frames = round(DURATION * args.fps)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{r.W}x{r.H}", "-r", str(args.fps), "-i", "-"]
    sound = THEMES[args.theme]["sound"] if args.sound is None else args.sound
    if sound:
        import sound as snd
        wav = os.path.join(tempfile.mkdtemp(), "track.wav")
        snd.render(wav, DURATION, [(a, s) for a, _, s in SCHEDULE if s is not None], SCHEDULE[8][0],
                   (TITLE1[0], TITLE2[0]), ARC_IN, ARC_OUT, loops=args.loops)
        cmd += ["-i", wav, "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for _ in range(args.loops):
        for i in range(frames):
            proc.stdin.write(r.frame(i / args.fps).tobytes())
    proc.stdin.close()
    if proc.wait():
        sys.exit("ffmpeg failed")
    print(out_path)


if __name__ == "__main__":
    main()
