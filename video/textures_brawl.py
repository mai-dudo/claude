"""Cartoon game-style textures for the Brawl Stars themed clip.

Same contract as textures.py: make_set(i, n, seed) -> three HxWx3 uint8 tiles
(top, middle, bottom). Everything is drawn in code: flat colours, thick black
outlines, a bit of shading, like mobile game UI art. No game assets are used.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from textures import fbm, grain, lerp_color, mix, yy_xx

SS = 3
OUT = (16, 12, 24)
HERE = os.path.dirname(os.path.abspath(__file__))


class Canvas:
    """Supersampled RGB drawing surface with fractional coordinates (0..1)."""

    def __init__(self, n, bg):
        self.n = n
        self.S = n * SS
        if isinstance(bg, np.ndarray):
            im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8)).resize((self.S, self.S), Image.BICUBIC)
        else:
            im = Image.new("RGB", (self.S, self.S), bg)
        self.im = im
        self.d = ImageDraw.Draw(im)

    def p(self, pts):
        return [(x * self.S, y * self.S) for x, y in pts]

    def w(self, px):  # line width given in output pixels
        return max(1, round(px * SS))

    def poly(self, pts, fill, ow=4.5):
        self.d.polygon(self.p(pts), fill=fill, outline=OUT if ow else None, width=self.w(ow) if ow else 1)

    def circle(self, cx, cy, r, fill, ow=4.5):
        S = self.S
        self.d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=fill,
                       outline=OUT if ow else None, width=self.w(ow) if ow else 1)

    def line(self, pts, fill, w):
        self.d.line(self.p(pts), fill=fill, width=self.w(w), joint="curve")

    def rect(self, x0, y0, x1, y1, fill, ow=4.5, r=0):
        S = self.S
        box = [x0 * S, y0 * S, x1 * S, y1 * S]
        if r:
            self.d.rounded_rectangle(box, radius=r * S, fill=fill, outline=OUT if ow else None, width=self.w(ow) if ow else 1)
        else:
            self.d.rectangle(box, fill=fill, outline=OUT if ow else None, width=self.w(ow) if ow else 1)

    def array(self):
        return np.asarray(self.im.resize((self.n, self.n), Image.LANCZOS)).astype(np.float32)


def star_pts(cx, cy, r, rot=-math.pi / 2, inner=0.48, k=5):
    pts = []
    for i in range(2 * k):
        rr = r if i % 2 == 0 else r * inner
        a = rot + math.pi * i / k
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def sparkle(c, cx, cy, r, fill=(255, 255, 255)):
    pts = []
    for i in range(8):
        rr = r if i % 2 == 0 else r * 0.22
        a = -math.pi / 2 + math.pi * i / 4
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    c.poly(pts, fill, ow=0)


def shade(img, strength=0.22):
    """Soft top-left light / bottom-right shadow so flat art feels less flat."""
    n = img.shape[0]
    y, x = yy_xx(n)
    v = 1 + strength * (0.5 - (x * 0.4 + y * 0.6))
    return img * v[..., None]


def finish(rng, img, g=5):
    return shade(img) + grain(rng, img.shape[0], g)[..., None]


# ---------------------------------------------------------------- set A

def a_top(rng, n):  # sunburst + big star
    y, x = yy_xx(n)
    cx, cy = 0.32, 0.36
    ang = np.arctan2(y - cy, x - cx)
    rays = (np.floor((ang + math.pi) / (2 * math.pi) * 18) % 2).astype(np.float32)
    img = mix(np.ones((n, n, 3), np.float32) * np.array((255, 196, 0), np.float32),
              np.ones((n, n, 3), np.float32) * np.array((255, 150, 0), np.float32), rays)
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    img = mix(img, img * 0.55 + np.array((120, 30, 140), np.float32) * 0.45, np.clip((r - 0.35) / 0.6, 0, 1)[..., None])
    c = Canvas(n, img)
    c.poly(star_pts(cx + 0.012, cy + 0.02, 0.24), (40, 20, 40), ow=0)  # drop shadow
    c.poly(star_pts(cx, cy, 0.24), (255, 236, 90), ow=6)
    c.poly(star_pts(cx - 0.02, cy - 0.03, 0.12, inner=0.5), (255, 250, 200), ow=0)
    return finish(rng, c.array(), 4)


def a_mid(rng, n):  # purple gem
    y, x = yy_xx(n)
    r = np.sqrt((x - 0.5) ** 2 + (y - 0.45) ** 2)
    bg = lerp_color([(0, (150, 70, 220)), (0.45, (70, 20, 130)), (1, (30, 8, 60))], r / 0.75)
    c = Canvas(n, bg)
    cx, cy, w, h = 0.5, 0.47, 0.27, 0.36
    top, mid, bot = cy - h * 0.55, cy - h * 0.12, cy + h * 0.6
    outer = [(cx - w * 0.55, top), (cx + w * 0.55, top), (cx + w, mid), (cx, bot), (cx - w, mid)]
    c.poly([(px + 0.015, py + 0.02) for px, py in outer], (25, 6, 45), ow=0)
    c.poly(outer, (150, 70, 230), ow=6)
    c.poly([(cx - w * 0.55, top), (cx - w * 0.2, mid), (cx - w, mid)], (205, 140, 255), ow=2.5)
    c.poly([(cx - w * 0.55, top), (cx + w * 0.55, top), (cx + w * 0.2, mid), (cx - w * 0.2, mid)], (225, 175, 255), ow=2.5)
    c.poly([(cx + w * 0.55, top), (cx + w, mid), (cx + w * 0.2, mid)], (170, 95, 240), ow=2.5)
    c.poly([(cx - w, mid), (cx - w * 0.2, mid), (cx, bot)], (130, 55, 210), ow=2.5)
    c.poly([(cx - w * 0.2, mid), (cx + w * 0.2, mid), (cx, bot)], (155, 80, 235), ow=2.5)
    c.poly([(cx + w * 0.2, mid), (cx + w, mid), (cx, bot)], (100, 35, 175), ow=2.5)
    c.poly([(cx - w * 0.35, top + 0.025), (cx - w * 0.05, top + 0.025), (cx - w * 0.22, mid - 0.03)], (255, 245, 255), ow=0)
    for (sx, sy, sr) in [(0.17, 0.2, 0.05), (0.83, 0.3, 0.04), (0.78, 0.78, 0.055), (0.2, 0.75, 0.035)]:
        sparkle(c, sx, sy, sr)
    return finish(rng, c.array(), 4)


def a_bot(rng, n):  # grass tiles + bushes
    c = Canvas(n, (120, 200, 70))
    k = 8
    for i in range(k):
        for j in range(k):
            if (i + j) % 2:
                c.rect(i / k, j / k, (i + 1) / k, (j + 1) / k, (108, 186, 62), ow=0)
    bushes = [(0.08, 0.62), (0.2, 0.55), (0.3, 0.66), (0.14, 0.8), (0.28, 0.86), (0.45, 0.82), (0.6, 0.9),
              (0.74, 0.8), (0.88, 0.86), (0.05, 0.95), (0.42, 0.98), (0.95, 0.68), (0.8, 0.97)]
    for bx, by in bushes:
        c.circle(bx + 0.01, by + 0.02, 0.085, (30, 70, 30), ow=0)
    for bx, by in bushes:
        c.circle(bx, by, 0.085, (40, 150, 60), ow=4.5)
    for bx, by in bushes:
        c.circle(bx - 0.025, by - 0.03, 0.035, (90, 205, 95), ow=0)
    return finish(rng, c.array(), 4)


# ---------------------------------------------------------------- set B

def b_top(rng, n):  # wooden crate
    c = Canvas(n, (60, 30, 12))
    planks = 5
    for i in range(planks):
        y0, y1 = 0.02 + i * 0.96 / planks, 0.02 + (i + 1) * 0.96 / planks
        col = (206, 134, 62) if i % 2 == 0 else (190, 118, 50)
        c.rect(0.02, y0, 0.98, y1, col, ow=4)
        for _ in range(3):
            gy = rng.uniform(y0 + 0.03, y1 - 0.03)
            gx = rng.uniform(0.05, 0.6)
            c.line([(gx, gy), (gx + rng.uniform(0.15, 0.3), gy + rng.uniform(-0.01, 0.01))], (150, 88, 36), 2.5)
    c.poly([(0.02, 0.86), (0.12, 0.98), (0.98, 0.14), (0.88, 0.02)], (176, 106, 44), ow=4.5)
    for (px, py) in [(0.02, 0.02), (0.98, 0.02), (0.02, 0.98), (0.98, 0.98)]:
        c.rect(px - 0.09, py - 0.09, px + 0.09, py + 0.09, (150, 156, 170), ow=4.5)
        c.circle(px + (0.035 if px < 0.5 else -0.035), py + (0.035 if py < 0.5 else -0.035), 0.016, (90, 92, 104), ow=2)
    return finish(rng, c.array(), 6)


def b_mid(rng, n):  # glowing power cube
    y, x = yy_xx(n)
    r = np.sqrt((x - 0.5) ** 2 + (y - 0.48) ** 2)
    bg = lerp_color([(0, (120, 255, 120)), (0.22, (30, 150, 70)), (0.6, (10, 50, 40)), (1, (6, 26, 24))], r / 0.8)
    c = Canvas(n, bg)
    cx, cy, s = 0.5, 0.5, 0.2
    top = [(cx, cy - s * 1.15), (cx + s, cy - s * 0.58), (cx, cy), (cx - s, cy - s * 0.58)]
    left = [(cx - s, cy - s * 0.58), (cx, cy), (cx, cy + s * 1.15), (cx - s, cy + s * 0.58)]
    right = [(cx, cy), (cx + s, cy - s * 0.58), (cx + s, cy + s * 0.58), (cx, cy + s * 1.15)]
    c.poly(top, (150, 255, 120), ow=5)
    c.poly(left, (60, 200, 70), ow=5)
    c.poly(right, (30, 150, 50), ow=5)
    bolt = [(0.0, -0.5), (0.25, -0.5), (0.08, -0.05), (0.3, -0.05), (-0.12, 0.55), (0.0, 0.08), (-0.2, 0.08)]
    for face, (ox, oy) in ((left, (cx - s * 0.5, cy + s * 0.29)), (right, (cx + s * 0.5, cy + s * 0.29))):
        c.poly([(ox + px * s * 0.55, oy + py * s * 0.75) for px, py in bolt], (230, 255, 200), ow=2.5)
    for (sx, sy, sr) in [(0.2, 0.22, 0.04), (0.8, 0.25, 0.05), (0.18, 0.82, 0.05), (0.85, 0.8, 0.035)]:
        sparkle(c, sx, sy, sr, (210, 255, 200))
    return finish(rng, c.array(), 4)


def b_bot(rng, n):  # trophy on blue stripes
    y, x = yy_xx(n)
    stripes = (np.floor((x + y) * 9) % 2).astype(np.float32)
    bg = mix(np.ones((n, n, 3), np.float32) * np.array((40, 110, 230), np.float32),
             np.ones((n, n, 3), np.float32) * np.array((30, 92, 205), np.float32), stripes)
    c = Canvas(n, bg)
    cx, cy = 0.32, 0.6
    S = c.S
    for box, a0, a1 in (([cx - 0.33, cy - 0.24, cx - 0.07, cy + 0.02], 90, 270),
                        ([cx + 0.07, cy - 0.24, cx + 0.33, cy + 0.02], 270, 90)):
        c.d.arc([v * S for v in box], a0, a1, fill=OUT, width=c.w(15))
        c.d.arc([v * S for v in box], a0, a1, fill=(255, 190, 30), width=c.w(7))
    cup = [(cx - 0.2, cy - 0.27), (cx + 0.2, cy - 0.27)] + [(cx + 0.2 * math.cos(a), cy - 0.27 + 0.34 * math.sin(a))
                                                           for a in np.linspace(0, math.pi, 30)]
    c.poly(cup, (255, 196, 30), ow=5.5)
    c.poly([(cx - 0.13, cy - 0.24), (cx - 0.06, cy - 0.24), (cx - 0.1, cy - 0.02)], (255, 240, 160), ow=0)
    c.rect(cx - 0.045, cy + 0.06, cx + 0.045, cy + 0.18, (230, 160, 20), ow=5)
    c.rect(cx - 0.16, cy + 0.17, cx + 0.16, cy + 0.27, (120, 70, 40), ow=5, r=0.02)
    c.poly(star_pts(cx, cy - 0.12, 0.07), (255, 245, 200), ow=3)
    return finish(rng, c.array(), 4)


# ---------------------------------------------------------------- set C

def cloud(c, cx, cy, s):
    parts = [(-0.12, 0.02, 0.08), (0.0, -0.04, 0.11), (0.13, 0.0, 0.085), (0.05, 0.05, 0.08), (-0.06, 0.06, 0.07)]
    for dx, dy, r in parts:
        c.circle(cx + dx * s, cy + dy * s + 0.012, r * s, (60, 120, 200), ow=0)
    for dx, dy, r in parts:
        c.circle(cx + dx * s, cy + dy * s, r * s, (255, 255, 255), ow=4.5)
    for dx, dy, r in parts:
        c.circle(cx + dx * s, cy + dy * s, r * s - 0.012, (255, 255, 255), ow=0)


def c_top(rng, n):  # sky with clouds and a star
    y, x = yy_xx(n)
    bg = lerp_color([(0, (40, 140, 240)), (1, (130, 215, 255))], y)
    c = Canvas(n, bg)
    c.poly(star_pts(0.72, 0.24, 0.13, rot=-math.pi / 2 + 0.2), (255, 220, 40), ow=5)
    cloud(c, 0.28, 0.3, 1.25)
    cloud(c, 0.22, 0.8, 1.1)
    cloud(c, 0.95, 0.42, 0.9)
    return finish(rng, c.array(), 4)


def c_mid(rng, n):  # football pitch with ball
    y, x = yy_xx(n)
    stripes = (np.floor(y * 8) % 2).astype(np.float32)
    bg = mix(np.ones((n, n, 3), np.float32) * np.array((96, 190, 70), np.float32),
             np.ones((n, n, 3), np.float32) * np.array((80, 170, 56), np.float32), stripes)
    c = Canvas(n, bg)
    W = (250, 255, 245)
    c.line([(0, 0.655), (1, 0.655)], W, 5)
    S = c.S
    c.d.ellipse([0.28 * S, 0.435 * S, 0.72 * S, 0.875 * S], outline=W, width=c.w(5))
    c.circle(0.5, 0.655, 0.02, W, ow=0)
    c.line([(0.04, 0), (0.04, 1)], W, 5)
    bx, by, br = 0.5, 0.37, 0.15
    c.circle(bx + 0.015, by + 0.025, br, (40, 90, 30), ow=0)
    c.circle(bx, by, br, (255, 255, 255), ow=5)
    c.poly([(bx + br * 0.42 * math.cos(-math.pi / 2 + 2 * math.pi * i / 5),
             by + br * 0.42 * math.sin(-math.pi / 2 + 2 * math.pi * i / 5)) for i in range(5)], (30, 30, 40), ow=0)
    for i in range(5):
        a = -math.pi / 2 + 2 * math.pi * i / 5 + math.pi / 5
        px, py = bx + br * 0.92 * math.cos(a), by + br * 0.92 * math.sin(a)
        c.circle(px, py, br * 0.2, (30, 30, 40), ow=0)
    c.circle(bx, by, br, None, ow=5)
    return finish(rng, c.array(), 4)


def c_bot(rng, n):  # VS split screen
    y, x = yy_xx(n)
    split = x + (y - 0.5) * 0.35 - 0.52
    red = np.array((235, 50, 60), np.float32)
    blue = np.array((40, 100, 245), np.float32)
    img = np.where((split < 0)[..., None], red, blue)
    # halftone dots
    g = 0.045
    dx = (x % g) / g - 0.5
    dy = (y % g) / g - 0.5
    dots = (dx * dx + dy * dy) < (0.06 + 0.12 * y)
    img = np.where(dots[..., None], img * 0.82, img)
    c = Canvas(n, img)
    bolt = [(0.6, -0.02), (0.45, 0.45), (0.56, 0.45), (0.4, 1.02), (0.68, 0.35), (0.56, 0.35), (0.7, -0.02)]
    c.poly(bolt, (255, 220, 40), ow=6)
    font_path = os.path.join(HERE, "fonts", "LilitaOne.ttf")
    if os.path.exists(font_path):
        font = ImageFont.truetype(font_path, int(0.32 * c.S))
        c.d.text((0.3 * c.S, 0.78 * c.S), "VS", font=font, fill=(255, 255, 255), anchor="mm",
                 stroke_width=c.w(7), stroke_fill=OUT)
    return finish(rng, c.array(), 4)


# ---------------------------------------------------------------- set D

def d_top(rng, n):  # magenta-purple glow with sparkles
    y, x = yy_xx(n)
    img = lerp_color([(0, (255, 90, 200)), (0.5, (170, 50, 220)), (1, (70, 20, 150))], y * 0.8 + x * 0.2)
    ang = np.arctan2(y - 0.1, x - 0.1)
    beams = (np.sin(ang * 14) > 0.6).astype(np.float32) * 0.18
    img = mix(img, np.ones_like(img) * 255, beams[..., None])
    c = Canvas(n, img)
    for _ in range(9):
        sx, sy = rng.uniform(0.05, 0.95), rng.uniform(0.05, 0.95)
        if sx > 0.5 and sy > 0.5:
            sx -= 0.45
        sparkle(c, sx, sy, rng.uniform(0.025, 0.07))
    c.poly(star_pts(0.25, 0.3, 0.1, rot=-math.pi / 2 - 0.25), (255, 230, 80), ow=5)
    return finish(rng, c.array(), 4)


def d_mid(rng, n):  # showdown poison clouds
    y, x = yy_xx(n)
    bg = lerp_color([(0, (40, 20, 70)), (0.6, (70, 40, 110)), (1, (90, 160, 60))], y)
    c = Canvas(n, bg)
    for (sx, sy, sr) in [(0.15, 0.15, 0.03), (0.4, 0.1, 0.02), (0.7, 0.2, 0.035), (0.88, 0.08, 0.02), (0.55, 0.35, 0.025)]:
        sparkle(c, sx, sy, sr, (230, 220, 255))
    rows = [(0.66, 0.11, (70, 170, 40)), (0.78, 0.12, (110, 210, 50)), (0.93, 0.13, (150, 235, 70))]
    for yy, r, col in rows:
        xs = np.arange(-0.05, 1.1, r * 1.3) + rng.uniform(0, r * 0.6)
        for xx in xs:
            c.circle(xx, yy + rng.uniform(-0.02, 0.02), r * rng.uniform(0.9, 1.15), col, ow=4.5)
    return finish(rng, c.array(), 4)


def d_bot(rng, n):  # brick wall
    c = Canvas(n, (60, 30, 30))
    rows, bw = 7, 0.3
    for j in range(rows):
        y0, y1 = j / rows, (j + 1) / rows
        off = -bw / 2 if j % 2 else 0
        xx = off
        while xx < 1:
            base = np.array((226, 150, 100)) * rng.uniform(0.85, 1.05)
            c.rect(xx + 0.006, y0 + 0.006, xx + bw - 0.006, y1 - 0.006, tuple(int(v) for v in base), ow=4, r=0.012)
            c.rect(xx + 0.03, y0 + 0.025, xx + bw * 0.55, y0 + 0.045, tuple(int(min(255, v * 1.15)) for v in base), ow=0)
            xx += bw
    c.line([(0.12, 0.45), (0.17, 0.52), (0.14, 0.6), (0.2, 0.68)], OUT, 3)
    return finish(rng, c.array(), 7)


SETS = [
    (a_top, a_mid, a_bot),
    (b_top, b_mid, b_bot),
    (c_top, c_mid, c_bot),
    (d_top, d_mid, d_bot),
]


def make_set(i, n, seed=7):
    out = []
    for j, fn in enumerate(SETS[i]):
        rng = np.random.default_rng(seed * 100 + i * 10 + j)
        out.append(np.clip(fn(rng, n), 0, 255).astype(np.uint8))
    return out
