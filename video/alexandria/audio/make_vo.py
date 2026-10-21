"""Russian voice-over with Silero TTS, plus the subtitle timeline.

usage: python make_vo.py MODEL.pt [speaker]
Writes build/vo/line_N.wav (48 kHz mono) and build/timeline.json.
"""
import json
import os
import re
import sys

import numpy as np
import scipy.io.wavfile as wavfile
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "vo")
SR = 48000

# text, start time (s), prosody rate
LINES = [
    ("А что, если человечество никогда не потеряло величайшую библиотеку в истории?", 0.30, "medium"),
    ("Представь, если бы каждое открытие сохранялось…", 4.25, "medium"),
    ("И каждое поколение продолжало дело предыдущего.", 7.45, "medium"),
    ("Как далеко мы могли бы зайти, если бы прогресс никогда не прерывался?", 11.45, "medium"),
    ("Могла ли Александрия стать научной столицей всего мира?", 16.75, "medium"),
    ("Насколько другим был бы наш мир сегодня?", 23.30, "slow"),
    ("Какое открытие человечество сделало бы следующим?", 26.40, "medium"),
]


# Manual stress marks (Silero reads "+" before the stressed vowel).
STRESS = {
    2: "Предст+авь, если бы к+аждое откр+ытие сохран+ялось…",
    4: "Как далек+о, мы могл+и бы зайт+и, если бы прогр+есс никогд+а не прерыв+ался?",
    7: "Как+ое откр+ытие челов+ечество сд+елало бы сл+едующим?",
}


def trim(a, thr=0.004):
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx) == 0:
        return a
    s = max(0, idx[0] - int(0.01 * SR))
    e = min(len(a), idx[-1] + int(0.06 * SR))
    return a[s:e]


def chunks(text, start, dur, max_chars=34):
    """Split a line into subtitle chunks, timed by character count."""
    words = text.split()
    parts, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if len(test) > max_chars and cur:
            parts.append(cur)
            cur = w
        else:
            cur = test
    if cur:
        parts.append(cur)
    # Avoid a dangling one-word tail
    if len(parts) > 1 and len(parts[-1]) < 14:
        parts[-2] = parts[-2] + " " + parts[-1]
        parts.pop()
    total = sum(len(p) for p in parts)
    out, t = [], start
    for p in parts:
        d = dur * len(p) / total
        out.append({"text": p, "start": round(t, 3), "end": round(t + d, 3)})
        t += d
    return out


def main():
    model_path = sys.argv[1]
    speaker = sys.argv[2] if len(sys.argv) > 2 else "eugene"
    os.makedirs(OUT, exist_ok=True)
    model = torch.package.PackageImporter(model_path).load_pickle("tts_models", "model")
    model.to(torch.device("cpu"))
    torch.manual_seed(7)
    timeline = {"speaker": speaker, "vo": []}
    for i, (text, start, rate) in enumerate(LINES, 1):
        spoken = STRESS.get(i, text).replace("…", ".")
        ssml = f'<speak><prosody rate="{rate}">{spoken}</prosody></speak>'
        audio = model.apply_tts(ssml_text=ssml, speaker=speaker, sample_rate=SR, put_accent=True, put_yo=True).numpy()
        audio = trim(audio)
        dur = len(audio) / SR
        path = os.path.join(OUT, f"line_{i}.wav")
        wavfile.write(path, SR, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
        timeline["vo"].append({
            "text": text, "start": start, "end": round(start + dur, 3), "file": f"build/vo/line_{i}.wav",
            "chunks": chunks(text, start, dur),
        })
        print(f"{i}: {start:5.2f} -> {start + dur:5.2f} ({dur:.2f}s) {text}")
    with open(os.path.join(ROOT, "build", "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)
    write_srt(timeline, os.path.join(ROOT, "build", "subtitles.srt"))


def write_srt(timeline, path):
    def ts(t):
        ms = int(round(t * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for line in timeline["vo"]:
            for ch in line["chunks"]:
                n += 1
                f.write(f"{n}\n{ts(ch['start'])} --> {ts(ch['end'])}\n{ch['text']}\n\n")


if __name__ == "__main__":
    main()
