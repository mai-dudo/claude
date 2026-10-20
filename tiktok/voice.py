"""Озвучка и субтитры по таймингам слов: Edge TTS (бесплатно, без ключа) или ElevenLabs (ключ ELEVENLABS_API_KEY).

Разметка в тексте сцены: [слово] — подсветить жёлтым, {слово} — красным. В голос скобки не попадают.
Список голосов ElevenLabs (свои и русские из библиотеки): python voice.py voices
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
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


ELEVEN = 'https://api.elevenlabs.io/v1'


def eleven_key():
    return os.environ.get('ELEVENLABS_API_KEY') or os.environ.get('XI_API_KEY')


def eleven_get(path):
    req = urllib.request.Request(f'{ELEVEN}/{path}', headers={'xi-api-key': eleven_key() or ''})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def _eleven(text, cfg, mp3, prev, nxt):
    """ElevenLabs: озвучка с таймингом каждой буквы, из букв собираем слова."""
    body = {'text': text, 'model_id': cfg.get('model') or 'eleven_multilingual_v2',
            'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True,
                               **(cfg.get('settings') or {})}}
    if prev:
        body['previous_text'] = prev
    if nxt:
        body['next_text'] = nxt
    req = urllib.request.Request(f'{ELEVEN}/text-to-speech/{cfg["voiceId"]}/with-timestamps?output_format=mp3_44100_128',
                                 data=json.dumps(body).encode(), method='POST',
                                 headers={'xi-api-key': eleven_key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            res = json.load(r)
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors='replace')
        if e.code in (400, 401, 402, 403, 404, 422):  # ключ, деньги, голос или текст — повтор не поможет
            raise SystemExit(f'ElevenLabs ответил {e.code}: {msg}')
        raise RuntimeError(f'ElevenLabs ответил {e.code}: {msg}')
    mp3.write_bytes(base64.b64decode(res['audio_base64']))
    al = res.get('alignment') or res.get('normalized_alignment') or {}
    words, cur = [], None
    for ch, st, en in zip(al.get('characters', []), al.get('character_start_times_seconds', []),
                          al.get('character_end_times_seconds', [])):
        if ch.isspace():
            if cur:
                words.append(cur)
            cur = None
        elif cur is None:
            cur = {'t': ch, 's': st, 'e': en}
        else:
            cur['t'] += ch
            cur['e'] = en
    if cur:
        words.append(cur)
    return [w for w in words if norm(w['t'])]


def config(story, engine=None, voice_id=None):
    """Настройки голоса из сценария: tts ('edge' | 'elevenlabs'), voice/rate/pitch для Edge,
    voiceId/voiceModel/voiceSettings для ElevenLabs. Без ключа или голоса ElevenLabs — Edge с предупреждением."""
    engine = engine or story.get('tts', 'edge')
    vid = voice_id or story.get('voiceId')
    if engine == 'elevenlabs' and not (eleven_key() and vid):
        print(f'  ! ElevenLabs: нет {"ключа ELEVENLABS_API_KEY" if not eleven_key() else "voiceId"} — озвучиваю бесплатным голосом Edge')
        engine = 'edge'
    return {'engine': engine, 'voice': story.get('voice', 'ru-RU-DmitryNeural'), 'rate': story.get('rate', '+0%'),
            'pitch': story.get('pitch', '+0Hz'), 'voiceId': vid, 'model': story.get('voiceModel'),
            'settings': story.get('voiceSettings')}


def speak(text, cfg, cache_dir, prev='', nxt=''):
    """Озвучивает текст (с кэшем) и возвращает (путь к mp3, границы слов в секундах).
    prev и nxt — соседние фразы: ElevenLabs по ним держит интонацию между сценами."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    eleven = cfg['engine'] == 'elevenlabs'
    sig = (f'11|{cfg["voiceId"]}|{cfg.get("model")}|{json.dumps(cfg.get("settings") or {}, sort_keys=True)}|{text}' if eleven
           else f'{cfg["voice"]}|{cfg["rate"]}|{cfg["pitch"]}|{text}')
    key = hashlib.sha1(sig.encode()).hexdigest()[:16]
    mp3, meta = cache_dir / f'{key}.mp3', cache_dir / f'{key}.json'
    if mp3.exists() and meta.exists():
        return mp3, json.loads(meta.read_text())
    err = None
    need = len([w for w in text.split() if norm(w)])
    for _ in range(4):
        try:
            if eleven:
                bounds = _eleven(text, cfg, mp3, prev, nxt)
            else:
                bounds = asyncio.run(_speak(text, cfg['voice'], cfg['rate'], cfg['pitch'], mp3))
            # Сервис иногда обрывает поток на середине фразы — такую озвучку не берём.
            if len(split(bounds)) < need * 0.8:
                raise RuntimeError(f'озвучено {len(bounds)} слов из {need}')
            meta.write_text(json.dumps(bounds, ensure_ascii=False))
            return mp3, bounds
        except Exception as e:  # сервис иногда обрывает соединение — пробуем ещё раз
            err = e
    mp3.unlink(missing_ok=True)
    raise RuntimeError(f'{"ElevenLabs" if eleven else "Edge TTS"} не ответил: {err}')


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


def list_voices():
    """Голоса ElevenLabs: свои и популярные русские из библиотеки (их voice_id ставится в сценарий как voiceId)."""
    if not eleven_key():
        sys.exit('Нет ключа ELEVENLABS_API_KEY')
    print('Ваши голоса:')
    for v in eleven_get('voices').get('voices', []):
        print(f'  {v["voice_id"]}  {v["name"]}')
    print('\nРусские голоса для рассказов из библиотеки (сначала добавьте понравившийся в свои на elevenlabs.io):')
    lib = eleven_get('shared-voices?language=ru&page_size=20&use_cases=narrative_story&sort=usage_character_count_1y')
    for v in lib.get('voices', []):
        print(f'  {v["voice_id"]}  {v.get("name")} — {v.get("gender", "")}, {v.get("age", "")}; {(v.get("description") or "")[:80]}')


if __name__ == '__main__' and sys.argv[1:2] == ['voices']:
    list_voices()
