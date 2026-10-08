#!/usr/bin/env python3
"""Vertical promo clip: collage tiles slideshow -> arc -> two title cards -> loop.

Timeline (seconds, same as the reference clip, 10.75 s, loops seamlessly):
  0.00-4.17  tiles cycle A/B/C/D every 0.5 s (arc draws in at 1.58-2.08)
  4.17-4.75  tiles cut away, only the arc
  4.75-6.50  title 1 ("Haiku 5.5")
  6.50-8.25  title 2 (spark + "Claude")
  8.25-8.80  text gone, arc wipes out left to right
  8.75-10.75 tiles cycle again A/B/C/D

Usage:
  python3 make_video.py --out promo.mp4
  python3 make_video.py --title "Haiku 5.5" --brand "Claude" --fps 30
"""
import argparse
import math
import os
import re
import subprocess
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textures import make_set  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BG = (249, 249, 247)
INK = (22, 22, 22)
SPARK = (217, 119, 87)
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
ARC_WIDTH = 2.3
TEXT_BASELINE = 652.0
CAP_HEIGHT = 58.0
REF_TEXT, REF_WIDTH = "Haiku 5.5", 324.0  # font size is fitted so this string is this wide
TRACKING = -0.018

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

FONT_URL_CSS = "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@12,500"


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return 0.5 * (u + (1 - math.cos(math.pi * u)) / 2)


def get_font(path):
    if path and os.path.exists(path):
        return path
    cached = os.path.join(HERE, "fonts", "Literata-500.ttf")
    if os.path.exists(cached):
        return cached
    try:
        css = urllib.request.urlopen(FONT_URL_CSS, timeout=20).read().decode()
        url = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
        os.makedirs(os.path.dirname(cached), exist_ok=True)
        urllib.request.urlretrieve(url, cached)
        return cached
    except Exception as e:  # offline: fall back to a system serif
        print("font download failed, using DejaVu Serif:", e, file=sys.stderr)
        return "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"


class Renderer:
    def __init__(self, width, font_path, title, brand, seed):
        self.W = width
        self.H = round(width * 16 / 9)
        self.k = width / 720.0
        self.font_path = font_path
        self.seed = seed
        self.blank = Image.new("RGB", (self.W, self.H), BG)
        self.sets = [self._tiles_frame(i) for i in range(4)]
        self.arc, self.arc_x = self._arc_layer()
        self.title1 = self._text_layer(title, spark=False)
        self.title2 = self._text_layer(brand, spark=True)

    # -------------------------------------------------------------- layers
    def _tiles_frame(self, i):
        k = self.k
        n = round(TILE * k)
        im = self.blank.copy()
        for (x, y, notch), tex in zip(TILES, make_set(i, n, self.seed)):
            tile = Image.fromarray(tex)
            mask = Image.new("L", (n, n), 255)
            h = round(n * 136 / 273)
            d = ImageDraw.Draw(mask)
            if notch == "br":
                d.rectangle([n - h, n - h, n, n], fill=0)
            elif notch == "tr":
                d.rectangle([n - h, 0, n, h - 1], fill=0)
            im.paste(tile, (round(x * k), round(y * k)), mask)
        return im

    def _arc_layer(self):
        ss = 3
        W, H, k = self.W * ss, self.H * ss, self.k * ss
        sag = ARC_EDGE_Y - ARC_PEAK_Y
        R = (360 ** 2 + sag ** 2) / (2 * sag)
        cy = ARC_PEAK_Y + R
        pts = []
        for i in range(401):
            x = -6 + (732 * i / 400)
            y = cy - math.sqrt(R * R - (x - 360) ** 2)
            pts.append((x * k, y * k))
        lay = Image.new("L", (W, H), 0)
        ImageDraw.Draw(lay).line(pts, fill=255, width=round(ARC_WIDTH * k), joint="curve")
        lay = lay.resize((self.W, self.H), Image.LANCZOS)
        a = np.asarray(lay).astype(np.float32) / 255.0
        return a, np.arange(self.W, dtype=np.float32)

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

    def _text_layer(self, text, spark):
        k = self.k
        font = ImageFont.truetype(self.font_path, 100)
        ref_w = sum(font.getlength(ch) for ch in REF_TEXT) + TRACKING * 100 * (len(REF_TEXT) - 1)
        size = round(100 * REF_WIDTH * k / ref_w)
        font = ImageFont.truetype(self.font_path, size)
        track = TRACKING * size
        widths = [font.getlength(ch) for ch in text]
        text_w = sum(widths) + track * (len(text) - 1)
        spark_d = round(66 * k) if spark else 0
        gap = round(15 * k) if spark else 0
        total = spark_d + gap + text_w
        x0 = (self.W - total) / 2
        base = TEXT_BASELINE * k
        lay = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        x = x0 + spark_d + gap
        for ch, w in zip(text, widths):
            d.text((x, base), ch, font=font, fill=INK + (255,), anchor="ls")
            x += w + track
        if spark:
            sp = self._spark(spark_d)
            cy = base - CAP_HEIGHT * k / 2 - 1 * k
            color = Image.new("RGBA", (spark_d, spark_d), SPARK + (255,))
            lay.paste(color, (round(x0), round(cy - spark_d / 2)), sp)
        return lay

    # -------------------------------------------------------------- frame
    def frame(self, t):
        im = self.blank
        for a, b, s in SCHEDULE:
            if a - 1e-6 <= t < b - 1e-6:
                im = self.blank if s is None else self.sets[s]
                break
        arr = np.asarray(im).astype(np.float32)

        # arc visibility window in x (pixels)
        lo, hi = None, None
        if ARC_IN[0] <= t < ARC_OUT[1]:
            p_in = ease((t - ARC_IN[0]) / (ARC_IN[1] - ARC_IN[0]))
            p_out = ease((t - ARC_OUT[0]) / (ARC_OUT[1] - ARC_OUT[0])) if t >= ARC_OUT[0] else 0.0
            lo, hi = p_out * (self.W + 4) - 2, p_in * (self.W + 4) - 2
        if lo is not None and hi > lo:
            xm = np.clip(self.arc_x - lo, 0, 1) * np.clip(hi - self.arc_x, 0, 1)
            a = (self.arc * xm[None, :])[..., None]
            arr = arr * (1 - a) + np.array(INK, np.float32) * a

        out = Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8))
        if TITLE1[0] <= t < TITLE1[1]:
            out.paste(self.title1, (0, 0), self.title1)
        elif TITLE2[0] <= t < TITLE2[1]:
            out.paste(self.title2, (0, 0), self.title2)
        return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(HERE, "promo.mp4"))
    ap.add_argument("--title", default="Haiku 5.5")
    ap.add_argument("--brand", default="Claude")
    ap.add_argument("--width", type=int, default=1080)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--loops", type=int, default=1, help="repeat the 10.75 s cycle N times")
    ap.add_argument("--seed", type=int, default=7, help="texture variation seed")
    ap.add_argument("--font", default=None, help="path to a .ttf serif font")
    ap.add_argument("--still", type=float, default=None, help="save a single PNG frame at this time instead")
    args = ap.parse_args()

    r = Renderer(args.width, get_font(args.font), args.title, args.brand, args.seed)
    if args.still is not None:
        out = os.path.splitext(args.out)[0] + f"_{args.still:.2f}s.png"
        r.frame(args.still).save(out)
        print(out)
        return

    frames = round(DURATION * args.fps)
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{r.W}x{r.H}", "-r", str(args.fps), "-i", "-",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-movflags", "+faststart", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for _ in range(args.loops):
        for i in range(frames):
            proc.stdin.write(r.frame(i / args.fps).tobytes())
    proc.stdin.close()
    if proc.wait():
        sys.exit("ffmpeg failed")
    print(args.out)


if __name__ == "__main__":
    main()
