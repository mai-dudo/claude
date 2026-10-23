# Turns the rendered portraits into pixel art: 5× downscale, one shared palette per
# character (so mouth and blink frames match), dark 1-px outline, 5× nearest upscale,
# then one sprite sheet per character: scene/sprites/<who>.png, frames in file-name order.
# Usage: python3 tools/pixelate.py out/portraits/ scene/sprites/ [--preview]
import os, sys
from PIL import Image, ImageEnhance

SRC, DST = sys.argv[1], sys.argv[2]
PREVIEW = '--preview' in sys.argv
FACTOR, COLORS = 5, 44
os.makedirs(DST, exist_ok=True)

files = sorted(f for f in os.listdir(SRC) if f.endswith('.png'))
by_who = {}
for f in files:
    by_who.setdefault(f.split('-')[0], []).append(f)

def small(path):
    im = Image.open(os.path.join(SRC, path)).convert('RGBA')
    w, h = im.size
    im = im.resize((w // FACTOR, h // FACTOR), Image.BOX)
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(im.convert('RGB')).enhance(1.12)).enhance(1.06)
    alpha = im.getchannel('A').point(lambda a: 255 if a >= 110 else 0)
    return rgb, alpha

for who, names in by_who.items():
    frames = [small(n) for n in names]
    w, h = frames[0][0].size
    # one palette from all frames of this character
    strip = Image.new('RGB', (w * len(frames), h))
    for i, (rgb, _) in enumerate(frames):
        strip.paste(rgb, (i * w, 0))
    pal = strip.quantize(colors=COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    outs = []
    for name, (rgb, alpha) in zip(names, frames):
        q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
        q.putalpha(alpha)
        a = alpha.load()
        out = q.copy()
        po = out.load()
        for y in range(h):
            for x in range(w):
                if a[x, y]:
                    continue
                if any(0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    po[x, y] = (28, 22, 24, 255)
        outs.append(out.resize((w * FACTOR, h * FACTOR), Image.NEAREST))
    sheet = Image.new('RGBA', (w * FACTOR * len(outs), h * FACTOR))
    for i, im in enumerate(outs):
        sheet.paste(im, (i * w * FACTOR, 0))
    sheet.save(os.path.join(DST, f'{who}.png'), optimize=True)
    print(who, f'{len(names)} кадров, {w}×{h} пикселей')

if PREVIEW:
    # side-by-side sheet of the neutral frames for a quick look
    neutral = [Image.open(os.path.join(DST, f'{k}.png')).crop((0, 0, 600, 720)) for k in by_who]
    sheet = Image.new('RGBA', (600 * len(neutral), 720), (238, 238, 245, 255))
    for i, im in enumerate(neutral):
        sheet.alpha_composite(im, (600 * i, 0))
    sheet.convert('RGB').save(os.path.join(os.path.dirname(os.path.normpath(SRC)), 'sprites-preview.png'))
