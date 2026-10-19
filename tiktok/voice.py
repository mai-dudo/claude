"""Озвучка через Edge TTS (бесплатно, без ключа) и субтитры по таймингам слов.

Разметка в тексте сцены: [слово] — подсветить жёлтым, {слово} — красным. В голос скобки не попадают.
"""
import asyncio
import hashlib
import json
import os
import re
from pathlib import Path

MARK = re.compile(r'\[([^\]]+)\]|\{([^}]+)\}')
EDGE = '«»"“”()…,.!?;:—–-'


def norm(s):
    return re.sub(r'[^0-9a-zа-я]', '', s.lower().replace('ё', 'е'))


def parse(text):
    """Текст со скобками → (текст для голоса, слова [{w, hl, brk}])."""
    words = []
    pos = 0
    parts = []
    for m in MARK.finditer(text):
        parts.append((text[pos:m.start()], None))
        parts.append((m.group(1) or m.group(2), 'y' if m.group(1) else 'r'))
        pos = m.end()
    parts.append((text[pos:], None))
    for chunk, hl in parts:
        for raw in re.findall(r'\S+', chunk):
            shown = raw.strip(EDGE)
            if not norm(shown):
                if words and re.search(r'[.!?;:—–,]', raw):
                    words[-1]['brk'] = True
                continue
            words.append({'w': shown, 'hl': hl, 'brk': bool(re.search(r'[.!?;:—–,…]$', raw))})
    return MARK.sub(lambda m: m.group(1) or m.group(2), text), words


async def _speak(text, voice, rate, pitch, mp3):
    import edge_tts
    from edge_tts import communicate
    # За прокси с собственным сертификатом (SSL_CERT_FILE) Edge TTS иначе не доверяет соединению.
    if os.environ.get('SSL_CERT_FILE'):
        communicate._SSL_CTX.load_verify_locations(os.environ['SSL_CERT_FILE'])
    bounds = []
    tts = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')
    with open(mp3, 'wb') as f:
        async for ch in tts.stream():
            if ch['type'] == 'audio':
                f.write(ch['data'])
            elif ch['type'] == 'WordBoundary':
                bounds.append({'t': ch['text'], 's': ch['offset'] / 1e7, 'e': (ch['offset'] + ch['duration']) / 1e7})
    return bounds


def speak(text, voice, rate, pitch, cache_dir):
    """Озвучивает текст (с кэшем) и возвращает (путь к mp3, границы слов в секундах)."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f'{voice}|{rate}|{pitch}|{text}'.encode()).hexdigest()[:16]
    mp3, meta = cache_dir / f'{key}.mp3', cache_dir / f'{key}.json'
    if mp3.exists() and meta.exists():
        return mp3, json.loads(meta.read_text())
    err = None
    for _ in range(3):
        try:
            bounds = asyncio.run(_speak(text, voice, rate, pitch, mp3))
            meta.write_text(json.dumps(bounds, ensure_ascii=False))
            return mp3, bounds
        except Exception as e:  # сервис иногда обрывает соединение — пробуем ещё раз
            err = e
    raise RuntimeError(f'Edge TTS не ответил: {err}')


def split(bounds):
    """TTS иногда отдаёт несколько слов одной границей («825 вольт») — делим время по длине слов."""
    res = []
    for b in bounds:
        parts = b['t'].split()
        if len(parts) < 2:
            res.append(b)
            continue
        total, t = sum(len(p) for p in parts), b['s']
        for p in parts:
            d = (b['e'] - b['s']) * len(p) / total
            res.append({'t': p, 's': t, 'e': t + d})
            t += d
    return res


def align(words, bounds):
    """Сопоставляет слова сценария (с подсветкой) с таймингами из TTS."""
    out, j = [], 0
    for b in split(bounds):
        nb = norm(b['t'])
        hit = None
        for k in range(j, min(j + 6, len(words))):
            nw = norm(words[k]['w'])
            if nw and nb and (nw == nb or nw.startswith(nb) or nb.startswith(nw)):
                hit = k
                break
        if hit is None:
            out.append({'w': b['t'].strip(EDGE), 'hl': None, 'brk': False, 's': b['s'], 'e': b['e']})
            continue
        # Если TTS разбил одно слово на части, показываем слово целиком один раз.
        if out and out[-1].get('_k') == hit:
            out[-1]['e'] = b['e']
            continue
        out.append({**words[hit], 's': b['s'], 'e': b['e'], '_k': hit})
        j = hit + 1
    for w in out:
        w.pop('_k', None)
    return out


def find(words, target):
    """Время начала фразы target среди слов сцены, или None."""
    want = [norm(x) for x in target.split() if norm(x)]
    for i in range(len(words)):
        if all(i + k < len(words) and norm(words[i + k]['w']).startswith(want[k]) for k in range(len(want))):
            return words[i]['s']
    return None


# Короткие служебные слова не оставляем в конце субтитра — они уходят в следующий.
CARRY = set('в во на и а но к ко с со у о об от до по под над за из без для не ни что как'.split())


def chunks(words, max_words=3, max_chars=17):
    """Режет поток слов на субтитры по 1–3 слова, рвёт на знаках препинания и паузах."""
    res, cur = [], []

    def push(carry=False):
        tail = []
        if carry and len(cur) > 1 and cur[-1]['w'].lower() in CARRY:
            tail = [cur.pop()]
        if cur:
            res.append({'s': round(cur[0]['s'], 3), 'e': round(cur[-1]['e'], 3),
                        'words': [{'w': w['w'], 'hl': w['hl']} for w in cur]})
            cur.clear()
        cur.extend(tail)

    for w in words:
        if cur:
            length = sum(len(x['w']) for x in cur) + len(cur) + len(w['w'])
            if w['s'] - cur[-1]['e'] > 0.45:
                push()
            elif len(cur) >= max_words or length > max_chars:
                push(carry=True)
        cur.append(w)
        if w['brk']:
            push()
    push()
    return res
