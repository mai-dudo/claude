#!/usr/bin/env python3
"""Делает вертикальный ролик для TikTok из сценария: python make_video.py stories/metro-tupik.json

Что получается в out/<имя>/: video.mp4 (1080×1920, 30 к/с), cover.jpg, post.txt (название ролика и хэштеги одной строкой),
audio.wav и timeline.json (для просмотра в браузере с --preview).
"""
import argparse
import asyncio
import base64
import functools
import hashlib
import http.server
import json
import math
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

import audio
import make_art
import voice

ROOT = Path(__file__).resolve().parent
# Поля, где время можно задать словом из текста сцены («at»: «гул») или секундами от начала сцены.
VOICE_KEYS = ('tts', 'voiceId', 'voiceModel', 'voiceSettings', 'voice', 'rate', 'pitch')
TIME_KEYS = {'at', 'from', 'until', 'rail', 'lightsOff', 'lightOff', 'handle', 'phantoms', 'glowFrom', 'wind'}


def resolve_time(value, words, dur, where):
    if isinstance(value, bool):
        return 0.0 if value else None
    if isinstance(value, (int, float)):
        return float(value) if value >= 0 else max(0.0, dur + value)
    m = re.match(r'^(.*?)\s*([+-]\d+(?:\.\d+)?)$', value)
    word, shift = (m.group(1), float(m.group(2))) if m and m.group(1) else (value, 0.0)
    t = voice.find(words, word)
    if t is None:
        print(f'  ! {where}: слово «{word}» не найдено в тексте сцены, ставлю на начало')
        t = 0.0
    return max(0.0, t + shift)


def resolve(obj, words, dur, where):
    if isinstance(obj, dict):
        return {k: (resolve_time(v, words, dur, where) if k in TIME_KEYS and not isinstance(v, (dict, list)) and v is not None
                    else resolve(v, words, dur, where)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [resolve(v, words, dur, where) for v in obj]
    return obj


def split_narration(path, texts, cache):
    """Своя озвучка всего ролика одним файлом → куски по сценам. Распознаём речь, сопоставляем со сценарием
    и режем посередине пауз между сценами. Возвращает {номер сцены: (кусок, тайминги слов от начала куска)}."""
    flat, owner = [], []
    for i, t in enumerate(texts):
        for w in t.split():
            if voice.norm(w):
                flat.append(w)
                owner.append(i)
    print(f'  распознаю свою озвучку: {path}')
    timed = voice.asr_align(' '.join(flat), voice.transcribe(path))
    spans = {}
    for w, i in zip(timed, owner):
        a, b = spans.get(i, (w['s'], w['e']))
        spans[i] = (min(a, w['s']), max(b, w['e']))
    order, total = sorted(spans), audio.duration(path)
    tag = hashlib.sha1(Path(path).read_bytes()).hexdigest()[:10]
    res = {}
    for k, i in enumerate(order):
        start = 0.0 if k == 0 else (spans[order[k - 1]][1] + spans[i][0]) / 2
        end = total if k == len(order) - 1 else (spans[i][1] + spans[order[k + 1]][0]) / 2
        clip = cache / f'narration-{tag}-{i}.wav'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', str(path),
                        '-ac', '1', '-ar', '48000', str(clip)], check=True)
        res[i] = (clip, [{'t': w['t'], 's': w['s'] - start, 'e': w['e'] - start} for w, o in zip(timed, owner) if o == i])
    return res


def build(story, out, tts=(None, None), narration=None):
    """Озвучка всех сцен, монтажный лист (timeline.json) и звуковая дорожка (audio.wav).
    narration — своя озвучка всего текста одним файлом (вместо синтеза по сценам)."""
    cfg = voice.config(story, *tts) if not narration else None
    texts = [voice.parse(sc.get('say', '').strip())[0] for sc in story['scenes']]
    cache = ROOT / '.cache' / 'tts'
    cache.mkdir(parents=True, exist_ok=True)
    pieces = split_narration(narration, texts, cache) if narration else None
    scenes, caps, clips, effects, missing = [], [], [], [], []
    T = float(story.get('lead', 0.25))
    for i, sc in enumerate(story['scenes'], 1):
        say = sc.get('say', '').strip()
        words, spoken = [], 0.0
        if say:
            text, marked = voice.parse(say)
            if pieces is not None:
                mp3, bounds = pieces[i - 1]
            else:
                own = {k: sc[k] for k in VOICE_KEYS if k in sc}  # свой голос у сцены: например, реплика героя
                scfg = voice.config({**story, **own}, *tts) if own else cfg
                mp3, bounds = voice.speak(text, scfg, cache, prev=texts[i - 2] if i > 1 else '',
                                          nxt=texts[i] if i < len(texts) else '')
            spoken = audio.duration(mp3)
            words = voice.align(marked, bounds)
            clips.append((T, mp3))
        # В своей озвучке паузы между сценами уже есть — лишних не добавляем.
        dur = float(sc.get('dur') or spoken + sc.get('pause', 0.0 if pieces is not None else story.get('pause', 0.3)))
        dur = max(dur, spoken + 0.05, 0.5)
        where = f'сцена {i}'
        body = {k: v2 for k, v2 in sc.items() if k not in ('say', 'sfx', 'images', 'draw', 'image', 'who')}
        if sc.get('type') == 'art':
            body['frames'] = []
            art = story.get('art') or out.name
            for fr in make_art.scene_frames(sc, i):
                ok = (ROOT / 'art' / art / fr['name']).exists()
                body['frames'].append({'src': f'art/{art}/{fr["name"]}' if ok else None, 'name': fr['name'],
                                       'draw': fr['draw'], 'at': fr['at']})
                if not ok:
                    missing.append(fr['name'])
        body = resolve(body, words, dur, where)
        scenes.append({**body, 'start': round(T, 3), 'dur': round(dur, 3)})
        for e in sc.get('sfx', []):
            effects.append({**e, 'at': T + resolve_time(e.get('at', 0), words, dur, where)})
        for c in voice.chunks(words):
            caps.append({**c, 's': round(c['s'] + T, 3), 'e': round(c['e'] + T, 3)})
        print(f'  сцена {i:>2}: {sc.get("type", "blank"):<7} {dur:5.1f} с  {say[:60]}')
        T += dur
    if missing:
        print(f'  ! нет картинок ({len(missing)}): {", ".join(missing)} — вместо них заглушки; см. python make_art.py')
    total = round(T + float(story.get('tail', 0.0)), 3)
    timeline = {'duration': total, 'hero': story.get('hero', {}), 'cast': story.get('cast', {}), 'scenes': scenes, 'captions': caps,
                'captionY': story.get('captionY', 1400), 'captionSize': story.get('captionSize', 86)}
    (out / 'timeline.json').write_text(json.dumps(timeline, ensure_ascii=False, indent=1))
    music = story.get('music')
    audio.mix(total, clips, effects, out / 'audio.wav', ambient=story.get('ambient', 'drone'),
              ambient_db=story.get('ambientDb', -27), music=(ROOT / music) if music else None,
              music_db=story.get('musicDb', -20))
    return timeline


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port=0):
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


FRAME_JS = "t => { draw(t); return document.getElementById('c').toDataURL('image/jpeg', 0.94); }"


async def frames(timeline, times, scale, workers, sink):
    """Рисует кадры в Chromium (несколько вкладок параллельно) и отдаёт их в sink(номер, jpeg) по порядку."""
    from playwright.async_api import async_playwright
    httpd = serve()
    url = f'http://127.0.0.1:{httpd.server_port}/render/index.html'
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        pages = []
        for _ in range(max(1, min(workers, len(times)))):
            ctx = await browser.new_context(viewport={'width': round(1080 * scale), 'height': round(1920 * scale)})
            page = await ctx.new_page()
            page.on('pageerror', lambda e: print(f'  ! ошибка на странице: {e}'))
            await page.goto(url)
            await page.evaluate('([tl, s]) => setup(tl, { scale: s })', [timeline, scale])
            pages.append(page)
        ready, nxt = {}, 0

        async def work(k, page):
            nonlocal nxt
            for i in range(k, len(times), len(pages)):
                data = await page.evaluate(FRAME_JS, times[i])
                ready[i] = base64.b64decode(data.split(',', 1)[1])
                while nxt in ready:
                    sink(nxt, ready.pop(nxt))
                    nxt += 1

        await asyncio.gather(*(work(k, pg) for k, pg in enumerate(pages)))
        await browser.close()
    httpd.shutdown()


def render(timeline, out, fps, scale, workers, until=None):
    n = math.ceil(min(timeline['duration'], until or timeline['duration']) * fps)
    times = [i / fps for i in range(n)]
    tmp = out / 'video.tmp.mp4'
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', str(fps), '-i', '-',
           '-i', str(out / 'audio.wav'), '-map', '0:v', '-map', '1:a',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
           '-vf', 'scale=1080:1920:flags=lanczos', '-r', str(fps),
           '-af', 'highpass=f=40,loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k',
           '-movflags', '+faststart', '-shortest', str(tmp)]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    start = time.time()

    def sink(i, jpg):
        ff.stdin.write(jpg)
        if i % (fps * 5) == 0 or i == n - 1:
            el = time.time() - start
            print(f'\r  кадры: {i + 1}/{n}  ({(i + 1) / max(el, 0.01):.1f} к/с)', end='', flush=True)

    asyncio.run(frames(timeline, times, scale, workers, sink))
    ff.stdin.close()
    if ff.wait():
        sys.exit('ffmpeg не смог собрать видео')
    tmp.replace(out / 'video.mp4')
    print()


def stills(timeline, out, times, scale=0.5):
    """Отдельные кадры в out/<имя>/stills/ и лист с ними (sheet.jpg) — быстро посмотреть, как выглядят сцены."""
    d = out / 'stills'
    d.mkdir(exist_ok=True)
    for f in d.glob('*.jpg'):
        f.unlink()
    asyncio.run(frames(timeline, times, scale, 4, lambda i, jpg: (d / f'{i:03d}_{times[i]:06.2f}.jpg').write_bytes(jpg)))
    cols = min(len(times), 5)
    rows = math.ceil(len(times) / cols)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-pattern_type', 'glob', '-i', str(d / '*.jpg'),
                    '-vf', f'scale=270:480,tile={cols}x{rows}:padding=6', '-frames:v', '1', str(out / 'sheet.jpg')], check=True)
    print(f'  кадры: {d}\n  лист:  {out / "sheet.jpg"}')


def main():
    ap = argparse.ArgumentParser(description='Ролик для TikTok из сценария')
    ap.add_argument('story', help='путь к сценарию .json')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--draft', action='store_true', help='черновик: 540×960 и 15 к/с, в 4–6 раз быстрее')
    ap.add_argument('--workers', type=int, default=3, help='сколько вкладок Chromium рисуют кадры одновременно')
    ap.add_argument('--stills', type=int, metavar='N', help='только N кадров по одному из середины каждой сцены (или равномерно)')
    ap.add_argument('--at', help='только кадры в эти секунды, через запятую: --at 3,12.5')
    ap.add_argument('--preview', action='store_true', help='не рендерить, а открыть просмотр в браузере')
    ap.add_argument('--until', type=float, metavar='СЕК', help='собрать только начало ролика, до этой секунды')
    ap.add_argument('--tts', choices=['edge', 'elevenlabs', 'fish'], help='чем озвучивать (по умолчанию — как в сценарии)')
    ap.add_argument('--voice-id', help='голос: voice_id ElevenLabs (python voice.py voices) или id голоса Fish Audio')
    ap.add_argument('--narration', help='своя озвучка всего текста одним аудиофайлом (mp3, wav, m4a…)')
    a = ap.parse_args()

    story = json.loads(Path(a.story).read_text(encoding='utf-8'))
    out = ROOT / 'out' / (story.get('slug') or Path(a.story).stem)
    out.mkdir(parents=True, exist_ok=True)
    print(f'«{story.get("title", out.name)}»: озвучка и монтаж')
    narration = a.narration or (str(ROOT / story['narration']) if story.get('narration') else None)
    tl = build(story, out, (a.tts, a.voice_id), narration)
    print(f'  длина: {tl["duration"]:.1f} с, субтитров: {len(tl["captions"])}')
    post = story.get('post', {})
    caption, tags = post.get('caption', story.get('title', out.name)), ' '.join(post.get('hashtags', []))
    # С описанием — как у больших каналов: заголовок, абзацы, хэштеги в конце; без него — одна строка.
    text = f'{caption}\n\n{post["description"].strip()}\n\n{tags}' if post.get('description') else f'{caption} {tags}'.strip()
    (out / 'post.txt').write_text(text + '\n', encoding='utf-8')
    print(f'  подпись: {caption}')

    if a.preview:
        httpd = serve(8090)
        print(f'Просмотр: http://127.0.0.1:{httpd.server_port}/render/index.html?preview=/out/{out.name}/  (Ctrl+C — выход)')
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            return
    if a.at or a.stills:
        if a.at:
            times = [float(x) for x in a.at.split(',')]
        elif a.stills >= len(tl['scenes']):
            times = [s['start'] + s['dur'] * 0.6 for s in tl['scenes']]
        else:
            times = [tl['duration'] * (i + 0.5) / a.stills for i in range(a.stills)]
        stills(tl, out, times)
        return

    fps, scale = (15, 0.5) if a.draft else (a.fps, 1.0)
    render(tl, out, fps, scale, a.workers, a.until)
    cover_at = story.get('cover', 1.2)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(cover_at), '-i', str(out / 'video.mp4'), '-frames:v', '1',
                    '-q:v', '2', str(out / 'cover.jpg')], check=True)
    print(f'Готово: {out / "video.mp4"}\n  обложка: {out / "cover.jpg"}\n  подпись: {out / "post.txt"}')


if __name__ == '__main__':
    main()
