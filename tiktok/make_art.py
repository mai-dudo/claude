#!/usr/bin/env python3
"""Картинки для рисованных сцен (type: "art").

  python make_art.py stories/metro-art-1.json                  # промпты для ChatGPT → out/<имя>/prompts.md
  python make_art.py stories/metro-art-1.json --api            # нарисовать недостающие через OpenAI API
  python make_art.py stories/metro-art-1.json --add a.png b.png # разложить свои картинки по кадрам

Картинки лежат в art/<имя>/ под именами кадров (01.jpg, 01a.jpg, 01b.jpg …), make_video.py берёт их оттуда.
Для --api нужен ключ OpenAI в переменной OPENAI_API_KEY (это не подписка ChatGPT, а отдельный платный доступ).
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API = 'https://api.openai.com/v1/images'
NO_TEXT = 'No text, letters, numbers, captions, logos or watermarks anywhere in the image.'
SHEET = ('Character reference sheet for an animated film: the same character shown three times side by side — '
         'full body front view, full body side view and a close-up portrait. Neutral pose, plain light-grey background.')


def scene_frames(sc, i):
    """Картинки одной сцены: [{name, draw, who, at}]. Одна картинка — 05.jpg, несколько — 05a.jpg, 05b.jpg …"""
    if sc.get('type') != 'art':
        return []
    items = sc.get('images') or [{k: sc[k] for k in ('draw', 'image', 'who') if k in sc}]
    res = []
    for j, it in enumerate(items):
        suffix = chr(ord('a') + j) if len(items) > 1 else ''
        res.append({'name': it.get('image') or f'{i:02d}{suffix}.jpg', 'draw': it.get('draw', ''),
                    'who': it.get('who', sc.get('who', [])), 'at': it.get('at')})
    return res


def all_frames(story):
    return [{**fr, 'scene': i} for i, sc in enumerate(story['scenes'], 1) for fr in scene_frames(sc, i)]


def orientation(size):
    w, h = (int(x) for x in size.split('x'))
    return 'vertical 2:3' if h > w else 'horizontal 3:2' if w > h else 'square'


def frame_prompt(story, fr, size):
    cast = story.get('cast', {})
    who = [w for w in fr['who'] if cast.get(w, {}).get('look')]
    parts = [f'Style: {story.get("style", "")}', f'{orientation(size).capitalize()} image. Scene: {fr["draw"]}']
    if who:
        parts.append('Characters: ' + ' '.join(cast[w]['look'] for w in who)
                     + ' Keep every character exactly as in the reference images.')
    parts.append(NO_TEXT)
    return '\n'.join(parts)


def sheet_prompt(story, name):
    return f'Style: {story.get("style", "")}\n{SHEET}\nCharacter: {story["cast"][name]["look"]}\n{NO_TEXT}'


def say_of(story, scene):
    text = re.sub(r'[\[\]{}]', '', story['scenes'][scene - 1].get('say', ''))
    return text if len(text) < 110 else text[:107].rsplit(' ', 1)[0] + '…'


def write_prompts(story, out, size):
    cast = {k: v for k, v in story.get('cast', {}).items() if v.get('look')}
    used = [k for k in cast if any(k in fr['who'] for fr in all_frames(story))]
    lines = [f'# Картинки для «{story.get("title", out.name)}»', '',
             'Как сделать в ChatGPT:', '',
             '1. Откройте новый чат и отправьте сообщение из шага 1: ChatGPT запомнит стиль и героев и нарисует их.',
             '2. Потом отправляйте по одному сообщению из шага 2 — каждое даёт один кадр. Не нравится — попросите перерисовать.',
             '3. Скачайте картинки и пришлите их в чат по порядку. Или положите в '
             f'`tiktok/art/{out.name}/` под именами из заголовков и запустите `python make_art.py … --add`.', '',
             '## Шаг 1. Первое сообщение', '', '```text',
             'We are making a series of illustrations for one short animated story. '
             'Every image must use exactly the same style and the same characters.',
             f'Style: {story.get("style", "")}']
    if used:
        lines.append('Characters:')
        lines += [f'- {cast[k]["look"]}' for k in used]
        lines.append(f'First, draw a character reference sheet: {SHEET} {NO_TEXT}')
    lines += ['```', '', '## Шаг 2. Кадры', '']
    for fr in all_frames(story):
        lines += [f'### {fr["name"]} — {say_of(story, fr["scene"])}', '', '```text',
                  f'Frame {Path(fr["name"]).stem}. {orientation(size).capitalize()} image, same style and characters as before. '
                  f'{fr["draw"]} {NO_TEXT}', '```', '']
    path = out / 'prompts.md'
    path.write_text('\n'.join(lines), encoding='utf-8')
    return path


def write_batch(story, out, size, done):
    """Один текст для ChatGPT на все недостающие кадры: вставить в чат, где уже нарисован первый кадр."""
    cast = {k: v for k, v in story.get('cast', {}).items() if v.get('look')}
    todo = [fr for fr in all_frames(story) if Path(fr['name']).stem not in done]
    lines = ['КАК ПОЛЬЗОВАТЬСЯ', '',
             '1. Откройте в ChatGPT тот же чат, где уже нарисован первый кадр.',
             '2. Скопируйте всё, что ниже линии, и отправьте одним сообщением.',
             f'3. ChatGPT нарисует {len(todo)} картинок по очереди. Если остановится после одной — пишите «next», '
             'пока не будут готовы все.',
             '4. Скачайте все картинки (и самую первую тоже) и пришлите мне в чат по порядку.', '',
             'Что будет на картинках:']
    lines += [f'  Кадр {n}: {say_of(story, fr["scene"])}' for n, fr in enumerate(todo, 1)]
    lines += ['', '─' * 60, '',
              'Great. Keep exactly this style' + (' and the same character' if cast else '') + ' in every image. '
              + (f'The character: {" ".join(c["look"] for c in cast.values())} ' if cast else '')
              + f'Now draw the next {len(todo)} frames of the same story, one image per frame, in this order. '
              f'Every image: {orientation(size)}, same style as the previous image. {NO_TEXT} '
              'Draw them one after another without asking me questions. If you can only draw one image per reply, '
              'draw the next frame every time I write "next".', '']
    lines += [f'Frame {n}: {fr["draw"]}' for n, fr in enumerate(todo, 1)]
    path = out / 'chatgpt.txt'
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return path, todo


def save_jpeg(data, dst):
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
        f.write(data)
    try:
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f.name, '-q:v', '2', str(dst)], check=True)
    finally:
        os.unlink(f.name)


def call(path, body, files=None):
    """Запрос к OpenAI Images API, возвращает байты картинки. files — картинки-образцы для /edits."""
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        sys.exit('Нет OPENAI_API_KEY. Без ключа сделайте картинки в ChatGPT по out/<имя>/prompts.md')
    if files:
        boundary = uuid.uuid4().hex
        chunks = []
        for k, v in body.items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for fp in files:
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="{fp.name}"\r\n'
                          f'Content-Type: image/jpeg\r\n\r\n'.encode() + fp.read_bytes() + b'\r\n')
        data, ctype = b''.join(chunks) + f'--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'
    else:
        data, ctype = json.dumps(body).encode(), 'application/json'
    for attempt in range(4):
        req = urllib.request.Request(f'{API}/{path}', data=data, method='POST',
                                     headers={'Authorization': f'Bearer {key}', 'Content-Type': ctype})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return base64.b64decode(json.load(r)['data'][0]['b64_json'])
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            sys.exit(f'OpenAI ответил {e.code}: {msg}')
        except urllib.error.URLError as e:
            if attempt < 3:
                time.sleep(5)
                continue
            sys.exit(f'Не удалось связаться с OpenAI: {e}')


def generate(story, art, size, a):
    cast = story.get('cast', {})
    gen = {'model': a.model or story.get('artModel', 'gpt-image-2.5-flare'), 'size': size, 'quality': a.quality}
    edit = {**gen, 'model': a.edit_model or story.get('artEditModel', 'gpt-image-2.5-sunburst')}
    frames = all_frames(story)
    for name in dict.fromkeys(w for fr in frames for w in fr['who'] if cast.get(w, {}).get('look')):
        dst = art / f'cast-{name}.jpg'
        if dst.exists() and name not in a.force:
            continue
        print(f'  образец героя: {name}')
        save_jpeg(call('generations', {**gen, 'size': '1536x1024', 'prompt': sheet_prompt(story, name)}), dst)
    for fr in frames:
        dst = art / fr['name']
        if dst.exists() and Path(fr['name']).stem not in a.force:
            continue
        print(f'  кадр {fr["name"]}: {fr["draw"][:70]}…')
        refs = [art / f'cast-{w}.jpg' for w in fr['who'] if (art / f'cast-{w}.jpg').exists()]
        prompt = frame_prompt(story, fr, size)
        data = call('edits', {**edit, 'prompt': prompt}, refs) if refs else call('generations', {**gen, 'prompt': prompt})
        save_jpeg(data, dst)


def add(story, art, files):
    """Раскладывает присланные картинки по кадрам: файл, чьё имя начинается с имени кадра (05, 01a), идёт в этот кадр,
    остальные — по порядку в оставшиеся."""
    frames = [fr['name'] for fr in all_frames(story)]
    left = list(frames)
    plan = {}
    for f in files:
        stem = Path(f).stem.lower()
        hit = next((n for n in left if stem == Path(n).stem or stem.startswith(Path(n).stem + '_')), None)
        if hit:
            plan[hit] = f
            left.remove(hit)
    for f in files:
        if f not in plan.values() and left:
            plan[left.pop(0)] = f
    for name in frames:
        if name in plan:
            save_jpeg(Path(plan[name]).read_bytes(), art / name)
            print(f'  {name} ← {plan[name]}')
    if left:
        print(f'  ещё нет: {", ".join(left)}')


def main():
    ap = argparse.ArgumentParser(description='Картинки для рисованных сцен')
    ap.add_argument('story')
    ap.add_argument('--api', action='store_true', help='нарисовать недостающие картинки через OpenAI API')
    ap.add_argument('--add', nargs='+', metavar='ФАЙЛ', help='свои картинки (из ChatGPT, от художника) по кадрам')
    ap.add_argument('--force', nargs='*', default=[], metavar='КАДР', help='перерисовать эти кадры (05, 01a, имя героя)')
    ap.add_argument('--done', nargs='*', default=[], metavar='КАДР',
                    help='кадры, уже нарисованные в ChatGPT (не попадут в chatgpt.txt), например 01a')
    ap.add_argument('--quality', default='medium', help='low | medium | high (дороже и дольше)')
    ap.add_argument('--model', help='модель для новых картинок (по умолчанию gpt-image-2.5-flare)')
    ap.add_argument('--edit-model', help='модель для кадров с героями по образцам (по умолчанию gpt-image-2.5-sunburst)')
    a = ap.parse_args()
    story = json.loads(Path(a.story).read_text(encoding='utf-8'))
    slug = story.get('slug') or Path(a.story).stem
    art, out = ROOT / 'art' / (story.get('art') or slug), ROOT / 'out' / slug
    art.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    size = story.get('artSize', '1024x1536')
    print(f'Промпты для ChatGPT: {write_prompts(story, out, size)}')
    done = set(a.done) | {Path(fr['name']).stem for fr in all_frames(story) if (art / fr['name']).exists()}
    batch, todo = write_batch(story, out, size, done)
    print(f'Всё одним сообщением: {batch} (кадров: {len(todo)})')
    if a.add:
        add(story, art, a.add)
    if a.api:
        generate(story, art, size, a)
    missing = [fr['name'] for fr in all_frames(story) if not (art / fr['name']).exists()]
    print(f'Картинки: {art}  (готово {len(all_frames(story)) - len(missing)} из {len(all_frames(story))})')


if __name__ == '__main__':
    main()
