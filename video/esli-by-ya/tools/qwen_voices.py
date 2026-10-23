# Voices the video with Qwen3-TTS on CPU. VoiceDesign invents four teenage boys' voices from a
# text description (nobody's real voice is copied), then the Base model clones each designed
# voice for all of that student's lines, so every character sounds the same throughout.
# Every take is checked with faster-whisper: garbled takes are regenerated, and babble after the
# last word is cut.
#
#   .venv-qwen/bin/python tools/qwen_voices.py design              # → voice/_ref/<who>.wav
#   .venv-qwen/bin/python tools/qwen_voices.py lines [--only A1]   # → voice/<id>.wav
#
# Then bash tools/build.sh picks voice/*.wav up as usual.
import argparse, difflib, json, os, re, time
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
VOICE = os.path.join(ROOT, 'voice')
REF = os.path.join(VOICE, '_ref')

BROKEN = "a teenage boy whose voice has already broken (not a child's voice)"
VOICES = {
    'A': dict(  # Гутко
        pitch=150,
        instruct="A 17-year-old young man whose male voice has fully broken, medium-low pitch, not childish. "
                 "Lively and friendly, speaks briskly and with a smile. Clear Russian pronunciation.",
        text="Привет! Я учусь в десятом классе и люблю свою махаллю. Сегодня я расскажу, как не попасться мошенникам."),
    'M': dict(  # Бурханов
        pitch=130,
        instruct=f"A 16-year-old {BROKEN}. Calm, warm and kind, speaks steadily and confidently, "
                 "like the most responsible boy in class. Medium-low pitch, clear Russian pronunciation.",
        text="Здравствуйте. Я учусь в десятом классе. Мне не всё равно, какой будет наша махалля, поэтому я начну с порядка во дворе."),
    'T': dict(  # Усманов
        pitch=112,
        instruct=f"A 17-year-old {BROKEN}, with a low, deep voice for his age. Serious and confident, "
                 "speaks slowly and firmly, like a young leader. Clear Russian pronunciation.",
        text="Добрый день. Я учусь в десятом классе. Если бы я был хокимом, я бы начал с того, чем мы дышим каждый день."),
    'N': dict(  # Тропачев
        pitch=140,
        instruct="A 17-year-old young man whose male voice has fully broken, medium-low pitch, not childish. "
                 "Crisp, articulate and businesslike, like a young news presenter. Very clear Russian pronunciation.",
        text="Добрый день. Я учусь в десятом классе. Сегодня я расскажу о воде: откуда она берётся и почему её становится меньше."),
}

ap = argparse.ArgumentParser()
ap.add_argument('stage', choices=['design', 'lines'])
ap.add_argument('--only', help='comma-separated ids: characters for design (A,M), lines for lines (A1,M2)')
ap.add_argument('--tries', type=int, default=4)
ap.add_argument('--seed', type=int, default=7)
args = ap.parse_args()
only = set(args.only.split(',')) if args.only else None

import torch, soundfile as sf, parselmouth
from parselmouth.praat import call
from scipy.signal import resample_poly
from faster_whisper import WhisperModel
from qwen_tts import Qwen3TTSModel

torch.set_num_threads(os.cpu_count() or 4)
asr = WhisperModel('small', device='cpu', compute_type='int8')

def norm(s):
    s = s.lower().replace('ё', 'е')
    return re.sub(r'[^0-9a-zа-я ]+', ' ', s).split()

def similarity(heard, texts):
    # half word level (extra or garbled words cost a lot), half letter level (a misheard
    # Uzbek word like «махали» for «махалли» costs little)
    h = norm(heard)
    def one(t):
        e = norm(t)
        return (difflib.SequenceMatcher(None, h, e).ratio() + difflib.SequenceMatcher(None, ' '.join(h), ' '.join(e)).ratio()) / 2
    return max(one(t) for t in texts)

def for_tts(text):
    """Quotes and ellipses make TTS stumble."""
    t = text.replace('«', '').replace('»', '').replace('...', '.').replace('…', '.')
    return re.sub(r'^[\s.,]+', '', t).strip()

def listen(wav, sr):
    a = resample_poly(wav, 16000, sr).astype(np.float32)
    segs, _ = asr.transcribe(a, language='ru', beam_size=1, word_timestamps=True)
    return [(w.word, w.end) for seg in segs for w in (seg.words or [])]

def cut_tail(wav, sr, words, text):
    """Cut right after the last expected word if anything was said after it."""
    said = [' '.join(norm(w)) for w, _ in words]
    exp = norm(text)
    if not exp or not said:
        return wav, words
    close = [i for i, w in enumerate(said) if difflib.SequenceMatcher(None, w, exp[-1]).ratio() >= 0.6 and i + 1 >= 0.6 * len(exp)]
    if close and close[-1] + 1 < len(words):
        keep = close[-1] + 1
        return wav[: int(min(len(wav), (words[keep - 1][1] + 0.15) * sr))], words[:keep]
    return wav, words

def pitch_of(wav, sr):
    f0 = parselmouth.Sound(wav.astype(np.float64), sampling_frequency=sr).to_pitch(pitch_floor=60, pitch_ceiling=500).selected_array['frequency']
    return float(np.median(f0[f0 > 0])) if (f0 > 0).any() else 0.0

def save(path, wav, sr):
    sf.write(path, np.clip(wav, -1, 1), sr, subtype='PCM_16')

def take(gen, texts_for_check, text):
    """Runs gen(seed) up to --tries times and keeps the clearest take."""
    best = None
    for k in range(args.tries):
        torch.manual_seed(args.seed + 101 * k)
        wav, sr = gen()
        wav, words = cut_tail(wav, sr, listen(wav, sr), text)
        heard = ' '.join(w for w, _ in words)
        score = similarity(heard, texts_for_check)
        if not best or score > best[0]:
            best = (score, wav, sr, heard)
        if score >= 0.9:
            break
    return best

os.makedirs(REF, exist_ok=True)

if args.stage == 'design':
    model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign', device_map='cpu', dtype=torch.bfloat16)
    for who, v in VOICES.items():
        if only and who not in only:
            continue
        cands = []
        for k in range(args.tries):
            torch.manual_seed(args.seed + 101 * k)
            wavs, sr = model.generate_voice_design(text=v['text'], language='Russian', instruct=v['instruct'])
            wav = np.asarray(wavs[0], dtype=np.float32)
            wav, words = cut_tail(wav, sr, listen(wav, sr), v['text'])
            score = similarity(' '.join(w for w, _ in words), [v['text']])
            f0 = pitch_of(wav, sr)
            print(f'{who} вариант {k + 1}: высота {f0:.0f} Гц (нужно ~{v["pitch"]}), чёткость {score:.2f}', flush=True)
            cands.append((score >= 0.88, -abs(f0 - v['pitch']), score, wav, sr, f0))
        _, _, score, wav, sr, f0 = max(cands, key=lambda c: c[:3])
        # nudge the pitch to the target if the best take is off by more than ~8 %
        if abs(f0 - v['pitch']) > 0.08 * v['pitch']:
            s = parselmouth.Sound(wav.astype(np.float64), sampling_frequency=sr)
            wav = call(s, 'Change gender', 60, 500, 1.0, v['pitch'], 1.0, 1.0).values[0].astype(np.float32)
            print(f'{who}: высота подвинута {f0:.0f} → {v["pitch"]} Гц')
        save(os.path.join(REF, f'{who}.wav'), wav, sr)
        json.dump({'text': v['text']}, open(os.path.join(REF, f'{who}.json'), 'w'), ensure_ascii=False)
        print(f'{who}: голос готов, чёткость {score:.2f}', flush=True)

else:
    story = json.load(open(os.path.join(ROOT, 'story.json')))
    lines = []
    for sc in story['scenes']:
        lines += sc.get('lines', [])
        for p in sc.get('parts', []):
            lines += p['lines']
    if only:
        lines = [l for l in lines if l['id'] in only]
    model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-1.7B-Base', device_map='cpu', dtype=torch.bfloat16)
    prompts = {}
    for who in VOICES:
        ref_wav, ref_sr = sf.read(os.path.join(REF, f'{who}.wav'), dtype='float32')
        ref_text = json.load(open(os.path.join(REF, f'{who}.json')))['text']
        prompts[who] = model.create_voice_clone_prompt(ref_audio=(ref_wav, ref_sr), ref_text=ref_text, x_vector_only_mode=False)
    report, t0 = [], time.time()
    for l in lines:
        text = for_tts(l.get('say', l['text']))
        def gen():
            wavs, sr = model.generate_voice_clone(text=text, language='Russian', voice_clone_prompt=prompts[l['who']])
            return np.asarray(wavs[0], dtype=np.float32), sr
        score, wav, sr, heard = take(gen, [l['text'], l.get('say', l['text'])], text)
        save(os.path.join(VOICE, f"{l['id']}.wav"), wav, sr)
        mark = 'ок' if score >= 0.88 else 'ПРОВЕРИТЬ'
        print(f"{l['id']:>3} {len(wav) / sr:5.1f} с  чёткость {score:.2f} {mark}  «{heard.strip()[:80]}»  [{time.time() - t0:.0f} с]", flush=True)
        report.append({'id': l['id'], 'score': round(score, 3), 'heard': heard.strip()})
    json.dump(report, open(os.path.join(REF, 'report.json'), 'w'), ensure_ascii=False, indent=1)
    bad = [r['id'] for r in report if r['score'] < 0.88]
    print('готово' + (f'; послушать внимательнее: {", ".join(bad)}' if bad else ', все реплики распознаются чётко'))
