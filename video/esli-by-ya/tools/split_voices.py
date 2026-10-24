# Cuts whole-person recordings (one continuous file each, e.g. from ElevenLabs) into the
# script's lines. faster-whisper finds every word with its time; the words are aligned to the
# script, and each cut is placed at the quietest moment between two lines. Also works out
# whose recording is whose from what is said, so the file names do not matter.
#
#   .venv-qwen/bin/python tools/split_voices.py voice/_src/*.mp3   # → voice/<id>.wav
import difflib, json, os, re, subprocess, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE = os.path.join(ROOT, 'voice')
SR = 44100

story = json.load(open(os.path.join(ROOT, 'story.json')))
lines = []
for sc in story['scenes']:
    lines += sc.get('lines', [])
    for p in sc.get('parts', []):
        lines += p['lines']

def norm(s):
    s = s.lower().replace('ё', 'е')
    return re.sub(r'[^0-9a-zа-я ]+', ' ', s).split()

def spoken(l):
    return l.get('say', l['text'])

from faster_whisper import WhisperModel
asr = WhisperModel('small', device='cpu', compute_type='int8')

def decode(path, sr):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def words_of(path):
    segs, _ = asr.transcribe(decode(path, 16000), language='ru', beam_size=5, word_timestamps=True)
    return [(w.word, w.start, w.end) for seg in segs for w in (seg.words or [])]

def quietest(audio, a, b):
    """Time of the quietest 30 ms window between a and b seconds."""
    hop = int(0.01 * SR)
    i, j = int(a * SR), int(b * SR)
    if j - i < 4 * hop:
        return (a + b) / 2
    seg = audio[i:j]
    n = len(seg) // hop
    rms = np.sqrt(np.convolve((seg[: n * hop].reshape(n, hop) ** 2).mean(axis=1), np.ones(3) / 3, mode='same'))
    return a + (int(np.argmin(rms)) + 0.5) * hop / SR

def save(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', path], input=pcm, check=True)

report = {}
for path in sys.argv[1:]:
    rec = words_of(path)
    heard = [' '.join(norm(w)) for w, _, _ in rec]
    # whose recording is it: the person whose lines match best
    scores = {}
    for who in story['cast']:
        exp = [w for l in lines if l['who'] == who for w in norm(spoken(l))]
        scores[who] = difflib.SequenceMatcher(None, heard, exp, autojunk=False).ratio()
    who = max(scores, key=scores.get)
    own = [l for l in lines if l['who'] == who]
    exp, line_of = [], []
    for k, l in enumerate(own):
        for w in norm(spoken(l)):
            exp.append(w)
            line_of.append(k)
    # map script words to recognised words
    hit = {}
    for b in difflib.SequenceMatcher(None, heard, exp, autojunk=False).get_matching_blocks():
        for d in range(b.size):
            hit[b.b + d] = b.a + d
    # then pair up near-misses between exact matches («водозбережение», «решение» for «решения»)
    anchors = sorted(hit.items())
    for (e0, r0), (e1, r1) in zip([(-1, -1)] + anchors, anchors + [(len(exp), len(heard))]):
        r = r0 + 1
        for e in range(e0 + 1, e1):
            for rr in range(r, r1):
                if difflib.SequenceMatcher(None, heard[rr], exp[e]).ratio() >= 0.72:
                    hit[e], r = rr, rr + 1
                    break
    first, last = [], []
    for k in range(len(own)):
        idx = [hit[e] for e in range(len(exp)) if line_of[e] == k and e in hit]
        if not idx:
            sys.exit(f'{os.path.basename(path)}: не нашёл реплику {own[k]["id"]} в записи')
        first.append(min(idx))
        last.append(max(idx))
    audio = decode(path, SR)
    total = len(audio) / SR
    # Words between two lines that the script could not match (numbers read as words but
    # written as digits, «Решения:» heard differently) are shared out: unmatched words at the
    # end of line k go with k, unmatched words at the start of line k+1 go with k+1.
    def unmatched_tail(k):
        es = [e for e in range(len(exp)) if line_of[e] == k]
        return sum(1 for e in es if e not in hit and e > max(x for x in es if x in hit))
    def unmatched_head(k):
        es = [e for e in range(len(exp)) if line_of[e] == k]
        return sum(1 for e in es if e not in hit and e < min(x for x in es if x in hit))
    cuts = [0.0]
    for k in range(len(own) - 1):
        gap = list(range(last[k] + 1, first[k + 1]))
        tail, head = unmatched_tail(k), unmatched_head(k + 1)
        split = len(gap) if not head else 0 if not tail else round(len(gap) * tail / (tail + head))
        before = gap[split - 1] if split else last[k]
        after = gap[split] if split < len(gap) else first[k + 1]
        a, b = rec[before][2], rec[after][1]
        cuts.append(quietest(audio, min(a, b), max(a, b)) if b > a + 0.03 else (a + b) / 2)
    cuts.append(total)
    name = story['cast'][who]['name']
    print(f'{os.path.basename(path)[:40]}… → {name} (совпадение {scores[who]:.2f}), {total:.1f} с, {len(own)} реплик')
    for k, l in enumerate(own):
        piece = audio[int(cuts[k] * SR): int(cuts[k + 1] * SR)]
        save(os.path.join(VOICE, f"{l['id']}.wav"), piece)
        segs, _ = asr.transcribe(decode(os.path.join(VOICE, f"{l['id']}.wav"), 16000), language='ru', beam_size=5)
        said = ' '.join(x.text for x in segs).strip()
        sim = max(difflib.SequenceMatcher(None, ' '.join(norm(said)), ' '.join(norm(t))).ratio() for t in (l['text'], spoken(l)))
        report[l['id']] = {'heard': said, 'match': round(sim, 2)}
        print(f"  {l['id']:>3} {cuts[k]:6.2f}–{cuts[k + 1]:6.2f}  {sim:.2f}  «{said[:90]}»")

json.dump(report, open(os.path.join(VOICE, '_src', 'split.json'), 'w'), ensure_ascii=False, indent=1)
missing = [l['id'] for l in lines if l['id'] not in report]
print('готово' + (f'; нет реплик: {", ".join(missing)}' if missing else ': все 37 реплик нарезаны'))
