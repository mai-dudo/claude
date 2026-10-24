# Prepares the voice-overs: put files into voice/ and run python3 tools/voices.py
#  - one file per line, named by its id: A1.mp3, I2.ogg, M4.m4a ...
#  - or one file per character (Гутко.mp3, Бурханов.ogg, Усманов.wav, Тропачев.m4a) with
#    the lines read in order and a pause between them; it is cut on the pauses.
# Writes voice/_norm/<id>.wav (trimmed, levelled, 48 kHz mono) and voice/timing.json
# (duration of each line plus a mouth-opening envelope for the lip-sync).
import json, os, re, subprocess, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE = os.path.join(ROOT, 'voice')
NORM = os.path.join(VOICE, '_norm')
SR = 48000
AUDIO = ('.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.flac', '.webm', '.mp4')

story = json.load(open(os.path.join(ROOT, 'story.json')))
FPS = story['fps']
lines = []
for sc in story['scenes']:
    lines += sc.get('lines', [])
    for p in sc.get('parts', []):
        lines += p['lines']
ids = [l['id'] for l in lines]
by_who = {k: [l['id'] for l in lines if l['who'] == k] for k in story['cast']}
norm = lambda s: s.strip().lower().replace('ё', 'е')
name_to_who = {norm(c['name']): k for k, c in story['cast'].items()}

TEMPO = float(story.get('voiceTempo', 1.0))  # e.g. 1.03 reads 3 % faster, pitch unchanged

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-af', f'atempo={TEMPO}', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

def frame_rms(x, hop):
    n = len(x) // hop
    return np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)

def trim(x):
    hop = SR // 100
    r = frame_rms(x, hop)
    thr = max(np.percentile(r, 95) * 0.06, 1e-4)
    on = np.where(r > thr)[0]
    if not len(on):
        return x
    a = max(0, on[0] * hop - int(0.06 * SR))
    b = min(len(x), (on[-1] + 1) * hop + int(0.12 * SR))
    return x[a:b]

def split(x, count):
    """Cuts a whole-character recording on its pauses into `count` pieces."""
    hop = SR // 100
    r = frame_rms(x, hop)
    loud = r > max(np.percentile(r, 95) * 0.06, 1e-4)
    gaps = []  # (length, start, end) of silent runs, in frames
    i = 0
    while i < len(loud):
        if not loud[i]:
            j = i
            while j < len(loud) and not loud[j]:
                j += 1
            if i > 0 and j < len(loud):
                gaps.append((j - i, i, j))
            i = j
        else:
            i += 1
    if len(gaps) < count - 1:
        sys.exit(f'нашёл только {len(gaps) + 1} фраз(ы), а нужно {count}: сделайте паузы между репликами длиннее')
    cuts = sorted(sorted(gaps, reverse=True)[: count - 1], key=lambda g: g[1])
    pieces, prev = [], 0
    for _, a, b in cuts:
        mid = (a + b) // 2
        pieces.append(x[prev * hop: mid * hop])
        prev = mid
    pieces.append(x[prev * hop:])
    return pieces

def level(x):
    hop = SR // 100
    r = frame_rms(x, hop)
    active = r[r > np.percentile(r, 95) * 0.1]
    rms = np.sqrt(np.mean(active ** 2)) if len(active) else 1e-3
    y = x * (10 ** (-18 / 20) / rms)
    peak = np.max(np.abs(y))
    if peak > 0.95:
        y = np.tanh(y / peak * 1.5) / np.tanh(1.5) * 0.95
    return y

def envelope(x):
    hop = SR // FPS
    r = frame_rms(x, hop)
    ref = np.percentile(r, 92) or 1
    e = np.clip((r / ref - 0.12) / 0.88, 0, 1)
    e = np.convolve(e, [0.25, 0.5, 0.25], mode='same')
    return [round(float(v), 2) for v in e]

found = {}
for f in sorted(os.listdir(VOICE)):
    stem, ext = os.path.splitext(f)
    if ext.lower() not in AUDIO:
        continue
    key = stem.strip().upper()
    if key in ids:
        found[key] = trim(decode(os.path.join(VOICE, f)))
    elif norm(stem) in name_to_who:
        who = name_to_who[norm(stem)]
        pieces = split(decode(os.path.join(VOICE, f)), len(by_who[who]))
        for lid, piece in zip(by_who[who], pieces):
            found.setdefault(lid, trim(piece))
        print(f'{f}: разрезал на {len(pieces)} реплик')
    else:
        print(f'пропускаю {f}: имя не похоже на номер реплики или имя персонажа')

os.makedirs(NORM, exist_ok=True)
timing = {'lines': {}}
for lid in ids:
    if lid not in found:
        continue
    y = level(found[lid])
    out = os.path.join(NORM, f'{lid}.wav')
    pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', out], input=pcm, check=True)
    timing['lines'][lid] = {'file': f'_norm/{lid}.wav', 'dur': round(len(y) / SR, 3), 'env': envelope(y)}

missing = [i for i in ids if i not in timing['lines']]
json.dump(timing, open(os.path.join(VOICE, 'timing.json'), 'w'))
print(f'готово: {len(timing["lines"])} из {len(ids)} реплик', f'— нет: {", ".join(missing)}' if missing else '')
