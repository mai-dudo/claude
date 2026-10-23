# Voices every line with a local voice-cloning model (Coqui XTTS-v2) from one reference
# recording, then gives each student his own teen voice by shifting pitch and formants (Praat).
# Each line is checked with speech recognition (faster-whisper) and re-generated if it came out garbled.
#
#   COQUI_TOS_AGREED=1 .venv-tts/bin/python tools/ai_voices.py voice/ref/<запись>.ogg [--only I1,A1] [--seed 1]
#
# Writes voice/<id>.wav, which tools/voices.py and tools/build.sh then pick up as usual.
import argparse, difflib, json, os, re, subprocess, sys, time
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE = os.path.join(ROOT, 'voice')
SR = 24000  # XTTS output rate

# Teen voices made from one speaker: target pitch median (Hz), formant shift relative to the
# speaker, pitch range, speaking speed.
TEENS = {
    'A': dict(pitch=150, formant=+0.05, range=1.15, speed=1.08),  # Гутко — бодрый, быстрее
    'M': dict(pitch=126, formant=+0.00, range=1.00, speed=1.00),  # Бурханов — спокойный
    'T': dict(pitch=108, formant=-0.03, range=0.90, speed=0.94),  # Усманов — ниже и медленнее
    'N': dict(pitch=138, formant=+0.03, range=1.05, speed=1.02),  # Тропачев — чёткий
}

ap = argparse.ArgumentParser()
ap.add_argument('ref', help='recording of the voice to copy, 10–60 s of clear speech')
ap.add_argument('--only', help='comma-separated line ids')
ap.add_argument('--seed', type=int, default=1)
ap.add_argument('--tries', type=int, default=3)
ap.add_argument('--out', default=VOICE, help='folder for the finished lines (default voice/)')
args = ap.parse_args()

story = json.load(open(os.path.join(ROOT, 'story.json')))
lines = []
for sc in story['scenes']:
    lines += sc.get('lines', [])
    for p in sc.get('parts', []):
        lines += p['lines']
if args.only:
    keep = set(args.only.split(','))
    lines = [l for l in lines if l['id'] in keep]

import torch, parselmouth
from parselmouth.praat import call
from TTS.api import TTS
from faster_whisper import WhisperModel

torch.set_num_threads(os.cpu_count() or 4)

# XTTS reads the reference through torchaudio/torchcodec, whose pip build wants CUDA
# libraries; decode with ffmpeg instead.
import TTS.tts.models.xtts as xtts_module
def _load_audio(path, sampling_rate):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(sampling_rate), '-'],
                         capture_output=True, check=True).stdout
    return torch.from_numpy(np.frombuffer(raw, dtype=np.float32).copy()).clamp(-1, 1).unsqueeze(0)
xtts_module.load_audio = _load_audio

# ---------- reference ----------
os.makedirs(os.path.join(VOICE, '_ref'), exist_ok=True)
ref = os.path.join(VOICE, '_ref', 'ref.wav')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', args.ref, '-ac', '1', '-ar', '22050',
                '-af', 'highpass=f=70,silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_threshold=-45dB:stop_duration=0.6,loudnorm',
                ref], check=True)
snd = parselmouth.Sound(ref)
f0 = snd.to_pitch(pitch_floor=60, pitch_ceiling=500).selected_array['frequency']
src_pitch = float(np.median(f0[f0 > 0])) if (f0 > 0).any() else 120.0
# A high source voice is moved down to a young male range, a low one is brightened a little.
base_formant = 0.90 if src_pitch > 165 else 1.04
print(f'эталон: {snd.duration:.1f} с, высота голоса ~{src_pitch:.0f} Гц')

t0 = time.time()
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2').to('cpu')
xtts = tts.synthesizer.tts_model
latent, embedding = xtts.get_conditioning_latents(audio_path=[ref], gpt_cond_len=30, max_ref_length=60)
asr = WhisperModel('small', device='cpu', compute_type='int8')
print(f'модели загружены за {time.time() - t0:.0f} с')

def chunks(text):
    """XTTS reads at most ~180 characters of Russian at once."""
    out = []
    for s in re.split(r'(?<=[.!?…])\s+', text.strip()):
        while len(s) > 170:
            cut = max(s.rfind(', ', 0, 170), s.rfind(' — ', 0, 170), s.rfind(': ', 0, 170))
            if cut < 40:
                cut = s.rfind(' ', 0, 170)
            out.append(s[:cut + 1].strip())
            s = s[cut + 1:].strip(' —')
        if s:
            out.append(s)
    return out

def norm(s):
    s = s.lower().replace('ё', 'е')
    return re.sub(r'[^0-9a-zа-я ]+', ' ', s).split()

def similarity(heard, line):
    # half word level (extra or garbled words cost a lot), half letter level (a misheard
    # ending like «мухали» for «махалли» costs little)
    h = norm(heard)
    def one(t):
        e = norm(t)
        return (difflib.SequenceMatcher(None, h, e).ratio() + difflib.SequenceMatcher(None, ' '.join(h), ' '.join(e)).ratio()) / 2
    return max(one(t) for t in (line['text'], line.get('say', line['text'])))

def for_tts(text):
    """Quotes and ellipses make XTTS stumble; dashes read better as commas."""
    t = text.replace('«', '').replace('»', '').replace('...', '.').replace('…', '.')
    t = re.sub(r'\s+—\s+', ', ', t)
    return re.sub(r'^[\s.,]+', '', t).strip()

def speak(text, speed, seed):
    torch.manual_seed(seed)
    parts = []
    for c in chunks(text):
        out = xtts.inference(c, 'ru', latent, embedding, temperature=0.65, top_p=0.85, top_k=50,
                             repetition_penalty=5.0, speed=speed, enable_text_splitting=False)
        parts += [np.asarray(out['wav'], dtype=np.float32), np.zeros(int(0.16 * SR), np.float32)]
    return np.concatenate(parts[:-1])

def teen(wav, who):
    p = TEENS[who]
    s = parselmouth.Sound(wav.astype(np.float64), sampling_frequency=SR)
    formant = min(1.2, max(0.85, base_formant + p['formant']))
    s = call(s, 'Change gender', 60, 500, formant, p['pitch'], p['range'], 1.0)
    return s.values[0]

def heard(wav):
    segs, _ = asr.transcribe(wav.astype(np.float32), language='ru', beam_size=1, vad_filter=False, word_timestamps=True)
    return [(w.word, w.end) for seg in segs for w in (seg.words or [])]

def cut_tail(wav, words, line):
    """XTTS sometimes babbles after the last word of a short line: cut right after the last
    expected word. Matching is fuzzy because recognition often bends Uzbek words (махалли)."""
    said = [' '.join(norm(w)) for w, _ in words]
    exp = norm(line.get('say', line['text']))
    if not exp or not said:
        return wav, words
    close = [i for i, w in enumerate(said) if difflib.SequenceMatcher(None, w, exp[-1]).ratio() >= 0.6]
    close = [i for i in close if i + 1 >= 0.6 * len(exp)]
    if close and close[-1] + 1 < len(words):
        keep = close[-1] + 1
        end = int(min(len(wav), (words[keep - 1][1] + 0.15) * SR))
        return wav[:end], words[:keep]
    return wav, words

report = []
for l in lines:
    text = for_tts(l.get('say', l['text']))
    p = TEENS[l['who']]
    expect = len(re.findall(r'[аеёиоуыэюя]', text.lower())) / 5.4 / p['speed']
    best = None
    for k in range(args.tries):
        wav = speak(text, p['speed'], args.seed + k * 101)
        wav, words = cut_tail(wav, heard(wav), l)
        dur = len(wav) / SR
        h = ' '.join(w for w, _ in words)
        score = similarity(h, l) - (0.3 if dur > expect * 1.9 + 1 else 0)
        if not best or score > best[0]:
            best = (score, wav, h)
        if score >= 0.88:
            break
    score, wav, h = best
    out = teen(wav, l['who'])
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"{l['id']}.wav")
    pcm = (np.clip(out, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', path], input=pcm, check=True)
    mark = 'ок' if score >= 0.88 else 'ПРОВЕРИТЬ'
    print(f"{l['id']:>3} {len(out) / SR:5.1f} с  совпадение {score:.2f} {mark}  «{h.strip()[:70]}»", flush=True)
    report.append({'id': l['id'], 'score': round(score, 3), 'heard': h.strip()})

json.dump(report, open(os.path.join(VOICE, '_ref', 'report.json'), 'w'), ensure_ascii=False, indent=1)
bad = [r['id'] for r in report if r['score'] < 0.88]
print('готово' + (f'; послушать внимательнее: {", ".join(bad)}' if bad else ', все реплики распознаются'))
