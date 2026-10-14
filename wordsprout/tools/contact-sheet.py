#!/usr/bin/env python3
"""Контактный лист WordSprout: склеивает картинки (скриншоты, эмодзи) в одну сетку с подписями.

Запуск (из корня репозитория):
  python3 -I wordsprout/tools/contact-sheet.py <out.png> <картинка|папка>… [--cols N] [--width W]
      [--max-height H] [--title T] [--bg #rrggbb] [--gap G] [--no-size]

  <out.png>        куда сохранить лист (.png; .jpg и .webp тоже можно)
  <картинка|папка> файлы PNG / WebP / JPEG / GIF / BMP; папка разворачивается в свои картинки
                   по алфавиту; шаблон в кавычках ('shots/*.png') раскрывается здесь же
  --cols N         столбцов (по умолчанию подбирается по числу картинок, от 1 до 10)
  --width W        ширина одной миниатюры в пикселях (по умолчанию 320)
  --max-height H   миниатюра не выше H пикселей (по умолчанию 3 × W, 0 — без ограничения);
                   длинный скриншот обрезается снизу, обрез отмечается пунктиром и в подписи
  --title T        заголовок над сеткой
  --bg #rrggbb     цвет фона листа (по умолчанию #f4f1ea)
  --gap G          расстояние между ячейками (по умолчанию 16)
  --no-size        не подписывать исходный размер картинки

Под каждой миниатюрой — имя файла (если имена повторяются — вместе с папкой) и исходный размер.
Нечитаемый или отсутствующий файл — серая ячейка с пометкой и предупреждение в stderr.
Код выхода: 0 — лист записан, 1 — не прочиталось ни одной картинки или запись не удалась,
2 — неверные аргументы. Только Pillow и стандартная библиотека Python.
"""

import argparse
import glob
import math
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:  # pragma: no cover - зависит от окружения
    sys.stderr.write('contact-sheet: нужен Pillow (python3 -m pip install Pillow)\n')
    sys.exit(1)

IMAGE_EXT = ('.png', '.webp', '.jpg', '.jpeg', '.gif', '.bmp')
FONT_DIRS = (
    '/usr/share/fonts/truetype/dejavu',
    '/usr/share/fonts/dejavu',
    '/usr/local/share/fonts',
    '/Library/Fonts',
    'C:\\Windows\\Fonts',
)
MAX_PIXELS = 250_000_000  # предохранитель: лист больше ~250 Мпикс не собираем

COLOR_CELL = (255, 255, 255)
COLOR_BORDER = (214, 207, 192)
COLOR_TEXT = (40, 38, 34)
COLOR_MUTED = (120, 114, 104)
COLOR_BAD = (190, 60, 50)
COLOR_PLACEHOLDER = (226, 222, 214)


# ---------------------------------------------------------------------------------------------------------
# Аргументы
# ---------------------------------------------------------------------------------------------------------

def parse_color(text):
    """'#rgb' / '#rrggbb' → (r, g, b)."""
    s = text.strip().lstrip('#')
    if len(s) == 3:
        s = ''.join(ch * 2 for ch in s)
    if len(s) != 6:
        raise argparse.ArgumentTypeError(f'цвет должен быть #rgb или #rrggbb, а не {text!r}')
    try:
        return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        raise argparse.ArgumentTypeError(f'цвет должен быть #rgb или #rrggbb, а не {text!r}') from None


def positive(minimum):
    def check(text):
        try:
            value = int(text)
        except ValueError:
            raise argparse.ArgumentTypeError(f'нужно целое число, а не {text!r}') from None
        if value < minimum:
            raise argparse.ArgumentTypeError(f'нужно число не меньше {minimum}, а не {value}')
        return value
    return check


def build_parser():
    p = argparse.ArgumentParser(
        prog='contact-sheet.py',
        description='Склеивает картинки в сетку с подписями (имя файла и размер).',
        epilog='Пример: python3 -I wordsprout/tools/contact-sheet.py /tmp/sheet.png shots/*.png --cols 4',
    )
    p.add_argument('out', help='куда сохранить лист (.png, .jpg или .webp)')
    p.add_argument('images', nargs='+', help='картинки или папки с картинками')
    p.add_argument('--cols', type=positive(1), default=None, help='число столбцов (по умолчанию — авто)')
    p.add_argument('--width', type=positive(16), default=320, help='ширина миниатюры, px (320)')
    p.add_argument('--max-height', type=positive(0), default=None,
                   help='предельная высота миниатюры, px (3 × width; 0 — без предела)')
    p.add_argument('--title', default=None, help='заголовок листа')
    p.add_argument('--bg', type=parse_color, default=parse_color('#f4f1ea'), help='цвет фона (#f4f1ea)')
    p.add_argument('--gap', type=positive(0), default=16, help='расстояние между ячейками, px (16)')
    p.add_argument('--no-size', action='store_true', help='не подписывать размер картинки')
    return p


# ---------------------------------------------------------------------------------------------------------
# Файлы
# ---------------------------------------------------------------------------------------------------------

def warn(msg):
    sys.stderr.write(f'contact-sheet: {msg}\n')


def plural(n, forms):
    """plural(5, ('картинка', 'картинки', 'картинок')) → 'картинок'."""
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return forms[1]
    return forms[2]


def expand_inputs(items, out_path):
    """Папки → их картинки по алфавиту, шаблоны → совпадения. Возвращает список путей (могут не существовать)."""
    out_abs = os.path.abspath(out_path)
    result = []
    for item in items:
        if os.path.isdir(item):
            names = sorted(n for n in os.listdir(item) if n.lower().endswith(IMAGE_EXT))
            files = [os.path.join(item, n) for n in names if os.path.isfile(os.path.join(item, n))]
            if not files:
                warn(f'в папке {item} нет картинок ({", ".join(IMAGE_EXT)})')
            result.extend(files)
        elif not os.path.exists(item) and any(ch in item for ch in '*?['):
            hits = sorted(h for h in glob.glob(item) if os.path.isfile(h))
            if not hits:
                warn(f'шаблону {item} ничего не соответствует')
            result.extend(hits)
        else:
            result.append(item)
    kept = []
    seen = set()
    for path in result:
        key = os.path.abspath(path)
        if key == out_abs:
            warn(f'пропускаю {path}: это файл результата')
            continue
        if key in seen:
            continue
        seen.add(key)
        kept.append(path)
    return kept


def make_labels(paths):
    """Имя файла; при совпадении имён — с родительскими папками, пока подписи не станут разными."""
    parts = [os.path.normpath(os.path.abspath(p)).split(os.sep) for p in paths]
    depth = [1] * len(paths)
    for _ in range(8):
        labels = ['/'.join(pp[-d:]) for pp, d in zip(parts, depth)]
        counts = {}
        for lab in labels:
            counts[lab] = counts.get(lab, 0) + 1
        clash = [i for i, lab in enumerate(labels) if counts[lab] > 1]
        if not clash:
            return labels
        for i in clash:
            depth[i] = min(depth[i] + 1, len(parts[i]))
    return ['/'.join(pp[-d:]) for pp, d in zip(parts, depth)]


# ---------------------------------------------------------------------------------------------------------
# Шрифты и текст
# ---------------------------------------------------------------------------------------------------------

def load_font(size, bold=False):
    names = ('DejaVuSans-Bold.ttf',) if bold else ('DejaVuSans.ttf',)
    for name in names:
        for folder in FONT_DIRS:
            path = os.path.join(folder, name)
            if os.path.isfile(path):
                try:
                    return ImageFont.truetype(path, size)
                except OSError:
                    pass
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # старый Pillow без параметра size
        return ImageFont.load_default()


def text_width(font, text):
    try:
        return font.getlength(text)
    except AttributeError:  # растровый шрифт старого Pillow
        box = font.getbbox(text)
        return box[2] - box[0]


def line_height(font):
    box = font.getbbox('Ag—Яй')
    return max(1, box[3] - box[1])


def fit_text(font, text, width):
    """Укорачивает подпись многоточием посередине, чтобы влезла в ширину."""
    if text_width(font, text) <= width:
        return text
    lo, hi = 0, len(text)
    best = '…'
    while lo <= hi:
        keep = (lo + hi) // 2
        head = (keep + 1) // 2
        tail = keep // 2
        cand = text[:head] + '…' + (text[-tail:] if tail else '')
        if text_width(font, cand) <= width:
            best = cand
            lo = keep + 1
        else:
            hi = keep - 1
    return best


# ---------------------------------------------------------------------------------------------------------
# Миниатюры
# ---------------------------------------------------------------------------------------------------------

def load_thumb(path, width, max_height):
    """Возвращает (миниатюра RGB, исходный размер, обрезана ли) или бросает исключение."""
    with Image.open(path) as im:
        im.seek(0)
        im = ImageOps.exif_transpose(im)
        size = im.size
        if im.mode == 'I' or im.mode.startswith('I;16'):
            # 16-битные оттенки серого: сжать 0…65535 в 0…255, иначе всё станет белым
            im = im.convert('I').point(lambda v: v * (1 / 256)).convert('L')
        rgba = im.convert('RGBA')
    if size[0] < 1 or size[1] < 1:
        raise ValueError('пустая картинка')
    height = max(1, round(size[1] * width / size[0]))
    thumb = rgba.resize((width, height), Image.LANCZOS)
    cropped = False
    if max_height and height > max_height:
        thumb = thumb.crop((0, 0, width, max_height))
        cropped = True
    base = Image.new('RGB', thumb.size, COLOR_CELL)
    base.paste(thumb, (0, 0), thumb)
    return base, size, cropped


def placeholder(width, lines, font):
    """Серая квадратная ячейка с пометкой, почему картинки нет."""
    im = Image.new('RGB', (width, width), COLOR_PLACEHOLDER)
    d = ImageDraw.Draw(im)
    d.line((0, 0, width - 1, width - 1), fill=COLOR_BORDER, width=2)
    d.line((0, width - 1, width - 1, 0), fill=COLOR_BORDER, width=2)
    lh = line_height(font)
    texts = [fit_text(font, t, width - 16) for t in lines]
    y = (width - len(texts) * (lh + 6)) // 2
    for text in texts:
        w = text_width(font, text)
        d.rectangle(((width - w) / 2 - 4, y - 2, (width + w) / 2 + 4, y + lh + 4), fill=COLOR_PLACEHOLDER)
        d.text(((width - w) / 2, y), text, font=font, fill=COLOR_BAD)
        y += lh + 6
    return im


def dashed_line(draw, y, x0, x1, color, dash=8, width=2):
    x = x0
    while x < x1:
        draw.line((x, y, min(x + dash, x1), y), fill=color, width=width)
        x += dash * 2


# ---------------------------------------------------------------------------------------------------------
# Сборка листа
# ---------------------------------------------------------------------------------------------------------

def auto_cols(n):
    if n <= 4:
        return max(1, n)
    return max(3, min(10, math.ceil(math.sqrt(n))))


def main(argv):
    args = build_parser().parse_intermixed_args(argv)
    width = args.width
    max_height = 3 * width if args.max_height is None else args.max_height
    gap = args.gap

    paths = expand_inputs(args.images, args.out)
    if not paths:
        warn('нет ни одной картинки')
        return 1

    font = load_font(max(11, min(20, width // 18)))
    small = load_font(max(10, min(16, width // 22)))
    title_font = load_font(max(16, min(34, width // 10)), bold=True)

    labels = make_labels(paths)
    cells = []
    readable = 0
    for path, label in zip(paths, labels):
        try:
            thumb, size, cropped = load_thumb(path, width, max_height)
            readable += 1
            info = f'{size[0]}×{size[1]}' + (' · обрезано' if cropped else '')
            cells.append({'img': thumb, 'label': label, 'info': info, 'bad': False, 'cropped': cropped})
        except FileNotFoundError:
            warn(f'{path}: файл не найден')
            cells.append({'img': placeholder(width, ['нет файла'], small), 'label': label, 'info': 'нет файла',
                          'bad': True, 'cropped': False})
        except Exception as e:  # noqa: BLE001 — любая ошибка чтения превращается в серую ячейку
            reason = str(e).splitlines()[0] if str(e) else type(e).__name__
            warn(f'{path}: не удалось прочитать ({reason})')
            cells.append({'img': placeholder(width, ['не читается', type(e).__name__], small), 'label': label,
                          'info': 'не читается', 'bad': True, 'cropped': False})
    if not readable:
        warn('не удалось прочитать ни одной картинки')
        return 1

    n = len(cells)
    cols = min(args.cols or auto_cols(n), n)
    rows = math.ceil(n / cols)
    pad = 8
    lh = line_height(font)
    slh = line_height(small)
    label_h = pad + lh + (4 + slh if not args.no_size else 0) + pad
    cell_w = width + 2
    row_heights = []
    for r in range(rows):
        row = cells[r * cols:(r + 1) * cols]
        row_heights.append(max(c['img'].height for c in row) + 2 + label_h)

    title_h = 0
    if args.title:
        title_h = line_height(title_font) + gap + 8
    sheet_w = gap + cols * (cell_w + gap)
    sheet_h = gap + title_h + sum(h + gap for h in row_heights)
    if sheet_w * sheet_h > MAX_PIXELS:
        warn(f'лист {sheet_w}×{sheet_h} слишком большой: уменьшите --width или разбейте картинки на части')
        return 1

    sheet = Image.new('RGB', (sheet_w, sheet_h), args.bg)
    draw = ImageDraw.Draw(sheet)
    if args.title:
        draw.text((gap, gap), fit_text(title_font, args.title, sheet_w - 2 * gap), font=title_font, fill=COLOR_TEXT)

    y = gap + title_h
    for r in range(rows):
        x = gap
        row = cells[r * cols:(r + 1) * cols]
        h = row_heights[r]
        ty = y + 1 + max(c['img'].height for c in row) + pad  # подписи ряда — на одной высоте
        for c in row:
            draw.rectangle((x, y, x + cell_w - 1, y + h - 1), fill=COLOR_CELL, outline=COLOR_BORDER)
            img = c['img']
            sheet.paste(img, (x + 1, y + 1))
            if c['cropped']:
                dashed_line(draw, y + img.height - 1, x + 1, x + cell_w - 2, COLOR_BAD)
            draw.line((x + 1, ty - pad // 2, x + cell_w - 2, ty - pad // 2), fill=COLOR_BORDER)
            name = fit_text(font, c['label'], width - 2 * pad)
            draw.text((x + 1 + pad, ty), name, font=font, fill=COLOR_BAD if c['bad'] else COLOR_TEXT)
            if not args.no_size:
                info = fit_text(small, c['info'], width - 2 * pad)
                draw.text((x + 1 + pad, ty + lh + 4), info, font=small, fill=COLOR_BAD if c['bad'] else COLOR_MUTED)
            x += cell_w + gap
        y += row_heights[r] + gap

    out = args.out
    folder = os.path.dirname(os.path.abspath(out))
    try:
        os.makedirs(folder, exist_ok=True)
        ext = os.path.splitext(out)[1].lower()
        if ext in ('.jpg', '.jpeg'):
            sheet.save(out, quality=90)
        elif ext == '.webp':
            if max(sheet.size) > 16383:
                warn(f'WebP не бывает больше 16383 px (а лист {sheet_w}×{sheet_h}): сохраните в .png')
                return 1
            sheet.save(out, quality=90)
        else:
            sheet.save(out, format='PNG')
    except (OSError, ValueError) as e:
        warn(f'не удалось записать {out}: {e}')
        return 1

    bad = n - readable
    note = f', не прочитано: {bad}' if bad else ''
    print(f'contact-sheet: {out} — {sheet_w}×{sheet_h} px, {n} {plural(n, ("картинка", "картинки", "картинок"))}, '
          f'сетка {cols}×{rows}{note}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
