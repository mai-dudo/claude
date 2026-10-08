"""Procedural collage textures for the tile slideshow.

Each texture is a square RGB float array (0..255) that imitates a scanned
paper / paint / photo swatch. Four sets of three tiles (top, middle, bottom).
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 3  # supersampling for vector strokes


# ---------------------------------------------------------------- helpers

def noise(rng, n, cell, h=None):
    """Smooth value noise in [0,1], cell = feature size in px."""
    h = h or n
    gh, gw = int(h / cell) + 3, int(n / cell) + 3
    g = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((int(gw * cell), int(gh * cell)), Image.BICUBIC)
    a = np.asarray(im)[:h, :n]
    return np.clip(a, 0, 1)


def fbm(rng, n, cell, octaves=4, h=None):
    out = np.zeros((h or n, n), np.float32)
    amp, tot = 1.0, 0.0
    for _ in range(octaves):
        out += amp * noise(rng, n, max(cell, 1.0), h)
        tot += amp
        amp *= 0.5
        cell /= 2
    return out / tot


def streaks(rng, n, sx, sy):
    """Anisotropic noise: long in x (sx) and short in y (sy)."""
    gh, gw = int(n / sy) + 3, int(n / sx) + 3
    g = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((int(gw * sx), int(gh * sy)), Image.BICUBIC)
    return np.clip(np.asarray(im)[:n, :n], 0, 1)


def blur(a, r):
    """Separable gaussian blur for float arrays (2D or HxWxC)."""
    k = np.arange(-int(3 * r) - 1, int(3 * r) + 2, dtype=np.float32)
    k = np.exp(-0.5 * (k / r) ** 2)
    k /= k.sum()
    p = len(k) // 2
    pad = [(p, p), (p, p)] + [(0, 0)] * (a.ndim - 2)
    b = np.pad(a.astype(np.float32), pad, mode="edge")
    h, w = a.shape[:2]
    b = sum(k[i] * b[i:i + h] for i in range(len(k)))
    b = sum(k[i] * b[:, i:i + w] for i in range(len(k)))
    return b


def grain(rng, n, amt):
    return (rng.random((n, n)).astype(np.float32) - 0.5) * amt


def fill(n, color):
    return np.ones((n, n, 3), np.float32) * np.array(color, np.float32)


def mix(a, b, m):
    m = np.clip(m, 0, 1)[..., None] if m.ndim == 2 else m
    return a * (1 - m) + b * m


def lerp_color(stops, t):
    """stops: list of (pos, rgb). t: array -> HxWx3."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    pos = [s[0] for s in stops]
    cols = [np.array(s[1], np.float32) for s in stops]
    for i in range(len(stops) - 1):
        a, b = pos[i], pos[i + 1]
        m = (t >= a) & (t <= b)
        k = ((t - a) / max(b - a, 1e-6))[..., None]
        out = np.where(m[..., None], cols[i] * (1 - k) + cols[i + 1] * k, out)
    out = np.where((t < pos[0])[..., None], cols[0], out)
    out = np.where((t > pos[-1])[..., None], cols[-1], out)
    return out


def stroke_mask(n, draw_fn, blur_r=0):
    """Render vector strokes at SS x and return a soft 0..1 mask."""
    im = Image.new("L", (n * SS, n * SS), 0)
    draw_fn(ImageDraw.Draw(im), SS)
    im = im.resize((n, n), Image.LANCZOS)
    if blur_r:
        im = im.filter(ImageFilter.GaussianBlur(blur_r))
    return np.asarray(im).astype(np.float32) / 255.0


def paper(rng, n, color, var=10, g=8):
    base = fill(n, color)
    base += ((fbm(rng, n, n / 3) - 0.5) * var)[..., None]
    base += grain(rng, n, g)[..., None]
    return base


def yy_xx(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    return y / n, x / n


def wobble_line(rng, pts, amp, steps=60):
    """Polyline through pts with small hand-drawn wobble."""
    out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        for i in range(steps):
            t = i / steps
            out.append((x0 + (x1 - x0) * t + rng.normal(0, amp), y0 + (y1 - y0) * t + rng.normal(0, amp)))
    out.append(pts[-1])
    return out


# ---------------------------------------------------------------- set A

def a_top(rng, n):
    y, x = yy_xx(n)
    img = paper(rng, n, (243, 196, 52), var=14, g=10)
    kraft = paper(rng, n, (214, 195, 158), var=16, g=14)
    edge = 0.73 + (noise(rng, n, n / 8)[0] - 0.5) * 0.008
    img = mix(img, kraft, (y > edge[None, :]).astype(np.float32))

    def lines(d, s):
        for (x0, y0, x1, y1) in [(0, .38, .36, 0), (0, .25, .25, 0)]:
            pts = wobble_line(rng, [(x0 * n * s, y0 * n * s), (x1 * n * s, y1 * n * s)], 0.25 * s, 40)
            d.line(pts, fill=255, width=int(1.6 * s))
        d.line(wobble_line(rng, [(0, edge[0] * n * s), (n * s, edge[-1] * n * s)], 0.3 * s, 80), fill=200, width=int(1.4 * s))
        pts = [(0, .86 * n * s), (.2 * n * s, .9 * n * s), (.5 * n * s, .99 * n * s)]
        d.line(wobble_line(rng, pts, 0.3 * s, 40), fill=255, width=int(1.4 * s))
    m = stroke_mask(n, lines)
    img = mix(img, fill(n, (45, 35, 25)), m * 0.9)
    return img


def a_mid(rng, n):
    y, x = yy_xx(n)
    st = streaks(rng, n, n / 2, 1.6)
    st2 = streaks(rng, n, n / 5, 0.9)
    dark = fill(n, (30, 28, 33)) + ((st - 0.5) * 30 + (st2 - 0.5) * 18)[..., None]
    # vertical drips of lighter paint above the horizon
    drips = streaks(rng, n, 1.8, n / 4)  # vertical drips
    drip_zone = np.clip((y - 0.34) / 0.26, 0, 1) ** 1.8
    dark = mix(dark, fill(n, (120, 105, 140)), np.clip((drips - 0.55) * 3, 0, 1) * drip_zone * 0.7)
    purple = fill(n, (112, 92, 140)) + ((st2 - 0.5) * 30)[..., None]
    gold = lerp_color([(0, (150, 108, 70)), (0.3, (196, 150, 92)), (0.7, (176, 128, 78)), (1, (160, 112, 70))], (y - 0.62) / 0.38)
    gold += ((streaks(rng, n, n / 1.5, 2.2) - 0.5) * 55)[..., None]
    gold += ((streaks(rng, n, n / 4, 1.0) - 0.5) * 25)[..., None]
    h1 = 0.6 + (noise(rng, n, n / 4)[0] - 0.5) * 0.012
    h2 = 0.655 + (noise(rng, n, n / 7)[0] - 0.5) * 0.03
    img = mix(dark, purple, np.clip((y - h1[None, :]) * n / 3, 0, 1))
    img = mix(img, gold, np.clip((y - h2[None, :]) * n / 4, 0, 1))
    img += grain(rng, n, 10)[..., None]
    return img


def chalk(rng, d, pts, s, n, density=5, size=(1.2, 3.2)):
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        k = int(L * density)
        for i in range(k):
            if rng.random() < 0.18:
                continue
            t = rng.random()
            px = (x0 + (x1 - x0) * t + rng.normal(0, 1.4)) * s
            py = (y0 + (y1 - y0) * t + rng.normal(0, 1.4)) * s
            r = rng.uniform(*size) * s
            d.ellipse([px - r, py - r * rng.uniform(0.6, 1), px + r, py + r], fill=int(rng.uniform(170, 255)))


def a_bot(rng, n):
    img = paper(rng, n, (47, 89, 150), var=16, g=10)
    img += ((fbm(rng, n, 10) - 0.5) * 12)[..., None]

    def draw(d, s):
        chalk(rng, d, [(0, .67 * n), (.45 * n, .655 * n), (n, .665 * n)], s, n)
        chalk(rng, d, [(.27 * n, .63 * n), (.285 * n, n)], s, n)
        chalk(rng, d, [(.02 * n, .7 * n), (.03 * n, n)], s, n, density=2)
    m = stroke_mask(n, draw)
    return mix(img, fill(n, (232, 236, 245)), m)


# ---------------------------------------------------------------- set B

def crayon(rng, n, pts, w, color, base):
    """Wax crayon band along pts (fractions), w = width in px."""
    def f(d, s):
        for _ in range(30):
            off = rng.uniform(-0.5, 0.5) * w
            a, b = rng.uniform(-0.04, 0.05), rng.uniform(-0.06, 0.03)
            p = [(px * n, py * n + off) for px, py in pts]
            p[0] = (p[0][0] + a * n, p[0][1])
            p[-1] = (p[-1][0] + b * n, p[-1][1])
            d.line([(x * s, y * s) for x, y in wobble_line(rng, p, 0.8, 30)],
                   fill=int(rng.uniform(120, 255)), width=max(1, int(w * rng.uniform(0.12, 0.3) * s)))
    m = stroke_mask(n, f, blur_r=0.6)
    tex = 0.6 * streaks(rng, n, 6, 1.2) + 0.4 * fbm(rng, n, 2.5, 2)
    waxy = np.clip(m * 1.6 - (1 - tex) * 0.9, 0, 1)
    return mix(base, fill(n, color), waxy)


def b_top(rng, n):
    img = paper(rng, n, (247, 166, 186), var=10, g=8)
    img = crayon(rng, n, [(0, .27), (.5, .37), (1.0, .5)], 30, (228, 34, 74), img)
    img = crayon(rng, n, [(0, .53), (.55, .56)], 28, (226, 30, 70), img)
    img = crayon(rng, n, [(0, .71), (.55, .72)], 22, (222, 28, 66), img)
    return img


def b_mid(rng, n):
    y, x = yy_xx(n)
    img = paper(rng, n, (248, 240, 232), var=6, g=5)
    cy = lambda px: 0.66 + 0.035 * ((px - 0.5) / 0.5) ** 2  # arc horizon (frac)

    def lattice(d, s):
        for k in np.arange(-1.0, 1.3, 0.21):
            for sgn in (1, -1):
                x0 = k + 0.5
                pts = []
                for t in np.linspace(0, 1, 30):
                    px = x0 + sgn * t * 0.6
                    py = cy(px) + t * 0.75
                    pts.append((px * n * s, py * n * s))
                d.line(pts, fill=255, width=int(2.2 * s))
        d.line([(.52 * n * s, cy(.52) * n * s), (.52 * n * s, n * s)], fill=255, width=int(2.2 * s))

    below = (y > (0.66 + 0.035 * ((x - 0.5) / 0.5) ** 2)).astype(np.float32)
    m = stroke_mask(n, lattice) * below
    img = mix(img, fill(n, (40, 38, 40)), m * 0.9)

    def pink(d, s):
        for pts in ([(.18, 1.02), (.5, cy(.5))], [(.5, cy(.5)), (.86, 1.02)]):
            d.line([(px * n * s, py * n * s) for px, py in pts], fill=255, width=int(9 * s))
    pm = stroke_mask(n, pink, blur_r=0.8) * (0.75 + 0.25 * fbm(rng, n, 4, 2))
    img = mix(img, fill(n, (232, 96, 110)), pm * 0.85)

    def horizon(d, s):
        pts = [(px * n * s, cy(px) * n * s) for px in np.linspace(-0.02, 1.02, 80)]
        d.line(pts, fill=255, width=int(3.2 * s))
    hm = stroke_mask(n, horizon, blur_r=0.6)
    img = mix(img, fill(n, (196, 176, 72)), hm)
    return img


def b_bot(rng, n):
    y, x = yy_xx(n)
    curve = 0.03 * ((x - 0.5) / 0.5) ** 2
    t = (y - 0.68 - curve) / 0.32
    band = lerp_color([
        (-0.12, (6, 4, 6)), (0.0, (120, 30, 10)), (0.08, (238, 96, 20)), (0.2, (250, 150, 40)),
        (0.32, (246, 186, 120)), (0.45, (180, 196, 190)), (0.55, (110, 196, 214)), (0.66, (128, 150, 214)),
        (0.78, (70, 80, 226)), (0.9, (98, 52, 214)), (1.0, (60, 30, 150)),
    ], t)
    band = blur(band, 1.2)
    img = np.where((t < -0.12)[..., None], fill(n, (4, 3, 5)), band)
    img += ((streaks(rng, n, n / 3, 3) - 0.5) * 14)[..., None] * (t > 0)[..., None]
    img += grain(rng, n, 5)[..., None]
    return img


# ---------------------------------------------------------------- set C

def sphere(rng, n, cx, cy, r, c_light, c_dark, rough):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    dx, dy = (x - cx) / r, (y - cy) / r
    d2 = dx * dx + dy * dy
    inside = np.clip((1 - np.sqrt(d2)) * r / 1.2, 0, 1)
    z = np.sqrt(np.clip(1 - d2, 0, 1))
    light = np.clip(-dx * 0.45 - dy * 0.55 + z * 0.7, 0, 1)
    tex = fbm(rng, n, rough, 4)
    rings = 0.5 + 0.5 * np.sin((np.sqrt(d2) * 9 + tex * 6))
    shade = np.clip(light * 0.75 + (tex - 0.5) * 0.7 + (rings - 0.5) * 0.25, 0, 1)
    col = mix(fill(n, c_dark), fill(n, c_light), shade)
    return col, inside


def c_top(rng, n):
    y, x = yy_xx(n)
    img = fill(n, (4, 3, 4)) + grain(rng, n, 4)[..., None]
    s1, m1 = sphere(rng, n, 0.13 * n, 0.83 * n, 0.165 * n, (190, 80, 50), (60, 10, 10), 9)
    img = mix(img, s1, m1)
    s2, m2 = sphere(rng, n, 0.58 * n, 0.86 * n, 0.17 * n, (236, 104, 44), (150, 30, 14), 5)
    img = mix(img, s2, m2)
    hill = 0.9 - 0.05 * np.exp(-((x - 0.25) / 0.18) ** 2)
    gm = np.clip((y - hill) * n / 3, 0, 1)
    ground = lerp_color([(0, (196, 70, 120)), (1, (120, 30, 60))], (y - 0.85) / 0.15)
    ground += ((fbm(rng, n, 3, 3) - 0.5) * 70)[..., None]
    img = mix(img, ground, gm)
    return img


def c_mid(rng, n):
    y, x = yy_xx(n)
    img = paper(rng, n, (184, 182, 180), var=10, g=10)
    img += ((fbm(rng, n, 2.5, 2) - 0.5) * 10)[..., None]
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    blots = np.zeros((n, n), np.float32)
    for _ in range(26):
        cx = rng.uniform(0.35, 0.9) * n
        cy = rng.uniform(0.08, 0.55) * n
        r = rng.choice([1.2, 2, 3, 4, 6, 9], p=[.3, .25, .2, .12, .08, .05]) * n / 273
        dd = np.sqrt((xx - cx) ** 2 + ((yy - cy) * rng.uniform(0.8, 1.3)) ** 2)
        blots = np.maximum(blots, np.clip((r - dd) / 1.2 + 0.3, 0, 1))
    img = mix(img, fill(n, (92, 90, 92)), blots * 0.85)
    # pale pink disc with scribble
    disc = np.clip((0.13 * n - np.sqrt((xx - 0.16 * n) ** 2 + (yy - 0.43 * n) ** 2)) / 1.2, 0, 1)
    img = mix(img, fill(n, (246, 208, 214)) + grain(rng, n, 6)[..., None], disc)

    def scrib(d, s):
        cx, cy = 0.16 * n, 0.43 * n
        pts = []
        for i in range(70):
            pts.append(((cx + rng.normal(0, 0.035 * n)) * s, (cy + rng.normal(0, 0.05 * n)) * s))
        for p in pts:
            r = rng.uniform(0.6, 1.4) * s
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=230)
    img = mix(img, fill(n, (120, 70, 80)), stroke_mask(n, scrib) * disc)
    edge = 0.67 + (noise(rng, n, n / 6)[0] - 0.5) * 0.01
    pink = paper(rng, n, (246, 202, 208), var=6, g=6)
    img = mix(img, pink, np.clip((y - edge[None, :]) * n / 1.5, 0, 1))
    return img


def c_bot(rng, n):
    y, x = yy_xx(n)
    img = fill(n, (6, 4, 4))
    stars = rng.random((n, n)) ** 26
    stars = blur(stars.astype(np.float32), 0.7) * 6
    zone = np.clip(1 - np.abs(y - 0.25) / 0.3, 0, 1) * 0.8 + np.clip(1 - np.abs(y - 0.62) / 0.08, 0, 1) * 1.4
    img = mix(img, fill(n, (236, 128, 60)), np.clip(stars * zone * (0.6 + fbm(rng, n, 30, 3)), 0, 1))
    haze = np.exp(-((y - 0.52) / 0.045) ** 2)
    haze *= 0.8 + 0.2 * streaks(rng, n, n / 3, 4)
    img = mix(img, fill(n, (170, 164, 168)), haze * 0.85)
    band = np.exp(-((y - 0.62) / 0.06) ** 2) * 0.35
    img = mix(img, fill(n, (130, 50, 20)), band * fbm(rng, n, 6, 3))
    line = np.exp(-((y - 0.705 - 0.01 * x) / 0.006) ** 2)
    img = mix(img, fill(n, (230, 110, 40)), line * 0.8)
    low = np.clip((y - 0.72) / 0.28, 0, 1)
    img = mix(img, fill(n, (2, 2, 2)), low * 0.8)
    img += grain(rng, n, 4)[..., None]
    return img


# ---------------------------------------------------------------- set D

def d_top(rng, n):
    y, x = yy_xx(n)
    t = y + (fbm(rng, n, n / 4, 2) - 0.5) * 0.03
    img = lerp_color([(0, (196, 92, 40)), (0.5, (190, 86, 42)), (0.68, (176, 62, 44)),
                      (0.82, (120, 30, 46)), (0.94, (52, 18, 40)), (1.0, (40, 16, 36))], t)
    img += ((streaks(rng, n, n / 2, 3) - 0.5) * 10)[..., None]
    img += grain(rng, n, 9)[..., None]
    return img


def d_mid(rng, n):
    y, x = yy_xx(n)
    img = fill(n, (18, 14, 14)) + grain(rng, n, 5)[..., None]
    edge = 0.58 + (fbm(rng, n, n / 10, 4)[0] - 0.5) * 0.08
    fib = streaks(rng, n, 2.2, n / 3)  # vertical fibres
    fib2 = streaks(rng, n, 5, n / 6)
    ridge = lerp_color([(0, (238, 170, 80)), (0.05, (214, 112, 40)), (0.4, (196, 84, 30)), (1, (120, 40, 14))],
                       (y - edge[None, :]) / (1 - edge[None, :]))
    shade = np.clip(0.35 + fib * 0.9 + (fib2 - 0.5) * 0.4, 0, 1.2)
    ridge = ridge * shade[..., None]
    rim = np.exp(-((y - edge[None, :]) * n / 3.0) ** 2)
    ridge = mix(ridge, fill(n, (250, 214, 130)), rim * 0.8)
    m = np.clip((y - edge[None, :]) * n / 1.5 + 0.5, 0, 1)
    return mix(img, ridge, m)


def d_bot(rng, n):
    y, x = yy_xx(n)
    img = paper(rng, n, (226, 202, 160), var=14, g=10)
    e1 = 0.36 + (fbm(rng, n, n / 3, 2)[0] - 0.5) * 0.06 - 0.04 * (x[0] - 0.5)
    olive = paper(rng, n, (168, 164, 104), var=14, g=10)
    img = mix(img, olive, np.clip((y - e1[None, :]) * n / 4, 0, 1))
    e2 = 0.6 + 0.01 * np.sin(x[0] * 6)

    def hatch(d, s):
        d.line([(px * n * s, (0.6 + 0.01 * math.sin(px * 6)) * n * s) for px in np.linspace(0, 1, 50)], fill=255, width=int(2 * s))
        d.line([(px * n * s, (0.635 + 0.01 * math.sin(px * 6)) * n * s) for px in np.linspace(0, 1, 50)], fill=160, width=int(1.2 * s))
        for row, yb in enumerate([0.65, 0.68, 0.71]):
            for k in np.arange(rng.uniform(0, 0.02), 1, 0.022):
                x0 = k * n
                y0 = (yb + 0.01 * math.sin(k * 6)) * n
                d.line([(x0 * s, y0 * s), ((x0 + 9) * s, (y0 + 6) * s)], fill=int(rng.uniform(140, 230)), width=int(1.1 * s))
    img = mix(img, fill(n, (48, 46, 34)), stroke_mask(n, hatch))
    kraft = paper(rng, n, (222, 196, 150), var=12, g=12)
    img = mix(img, kraft, np.clip((y - 0.74) * n / 2, 0, 1))
    return img


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
