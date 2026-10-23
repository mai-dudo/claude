# Builds the soundtrack: a light procedural music bed, UI sound effects and,
# when voice/timing.json exists, the voice-overs placed on the timeline.
# Usage: python3 tools/audio.py   (needs out/timeline.json from tools/render.js)
import json, os, subprocess, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'out')
SR = 48000

tl = json.load(open(os.path.join(OUT, 'timeline.json')))
timing_path = os.path.join(ROOT, 'voice', 'timing.json')
timing = json.load(open(timing_path)) if os.path.exists(timing_path) else None
DUR = tl['duration'] + 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)

def note(m):  # MIDI -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)

def env(n, a, d, sustain=0.0, r=0.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * (sustain + (1 - sustain) * np.exp(-t / d))
    if r:
        e *= np.clip((n / SR - t) / r, 0, 1)
    return e

def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain

# ---------- music ----------
BPM = 96
beat = 60 / BPM
bar = 4 * beat
# I–V–vi–IV in C: C G Am F
CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]]
music_l = np.zeros(N); music_r = np.zeros(N)

scenes = tl['scenes']
blocks = [s for s in scenes if s['type'] == 'block']
drums_from = blocks[0]['start'] if blocks else 0
drums_to = next((s['start'] for s in scenes if s['type'] == 'outro'), DUR)

def pad_tone(freq, n):
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t) + 0.1 * np.sin(2 * np.pi * 3.01 * freq * t)
    return s

nbars = int(DUR / bar) + 1
for b in range(nbars):
    t0 = b * bar
    ch = CHORDS[b % 4]
    n = int(bar * SR) + int(0.6 * SR)
    e = env(n, 0.35, 99, 1.0, 0.6)
    for k, m in enumerate(ch + [ch[0] + 12]):
        tone = pad_tone(note(m + 12), n) * e * 0.035
        add(music_l, t0, tone * (0.8 if k % 2 else 1.0))
        add(music_r, t0 + 0.012, tone * (1.0 if k % 2 else 0.8))
    # arpeggio pluck, 8th notes
    arp = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36, ch[2] + 24, ch[1] + 24, ch[2] + 24]
    for i, m in enumerate(arp):
        n2 = int(0.5 * SR)
        t = np.arange(n2) / SR
        f = note(m)
        s = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05)) * env(n2, 0.003, 0.18)
        pan = 0.35 if i % 2 else -0.35
        add(music_l, t0 + i * beat / 2, s, 0.05 * (1 - pan))
        add(music_r, t0 + i * beat / 2, s, 0.05 * (1 + pan))
    # bass
    for pos in (0, 1.5, 2):
        n3 = int(0.6 * SR)
        t = np.arange(n3) / SR
        f = note(ch[0] - 12)
        s = np.tanh(2.2 * np.sin(2 * np.pi * f * t)) * env(n3, 0.005, 0.28)
        add(music_l, t0 + pos * beat, s, 0.09); add(music_r, t0 + pos * beat, s, 0.09)
    # drums in the main part only
    if drums_from - bar <= t0 < drums_to:
        for i in range(8):
            tt = t0 + i * beat / 2
            if not (drums_from <= tt < drums_to): continue
            if i in (0, 4):
                n4 = int(0.35 * SR); t = np.arange(n4) / SR
                f = 45 + 80 * np.exp(-t / 0.04)
                s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n4, 0.001, 0.12)
                add(music_l, tt, s, 0.16); add(music_r, tt, s, 0.16)
            if i in (2, 6):
                n5 = int(0.2 * SR)
                s = rng.standard_normal(n5) * env(n5, 0.001, 0.05)
                s = s - np.concatenate([[0], s[:-1]]) * 0.6
                add(music_l, tt, s, 0.035); add(music_r, tt + 0.006, s, 0.035)
            n6 = int(0.06 * SR)
            hh = rng.standard_normal(n6); hh = hh - np.concatenate([[0], hh[:-1]])
            add(music_l, tt, hh * env(n6, 0.0005, 0.012), 0.012 * (1.3 if i % 2 else 0.8))
            add(music_r, tt, hh * env(n6, 0.0005, 0.012), 0.012 * (0.8 if i % 2 else 1.3))

# fade in/out
fade = np.ones(N)
fi = int(1.0 * SR); fo = int(3.0 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[-fo:] = np.linspace(1, 0, fo)
music_l *= fade; music_r *= fade

# ---------- sound effects ----------
sfx = np.zeros(N)
for s in blocks:  # whoosh under each title card
    n = int(0.8 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = np.sin(np.pi * np.clip(t / 0.8, 0, 1)) ** 2
    w = np.convolve(noise, np.ones(24) / 24, mode='same') * sweep
    add(sfx, s['start'] - 0.05, w, 0.25)
for l in tl['lines']:  # soft pop when the chosen solution lights up
    if l.get('pickAt'):
        n = int(0.14 * SR); t = np.arange(n) / SR
        f = 660 + 660 * np.minimum(1, t / 0.05)
        pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.04)
        add(sfx, l['pickAt'] + 0.05, pop, 0.12)

# ---------- voices ----------
voice = np.zeros(N)
if timing:
    for l in tl['lines']:
        info = timing['lines'].get(l['id'])
        if not info: continue
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'voice', info['file']), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             capture_output=True, check=True).stdout
        add(voice, l['start'], np.frombuffer(raw, dtype=np.float32).astype(np.float64))
    # duck the music under speech
    speaking = np.zeros(N)
    for l in tl['lines']:
        if l['id'] in timing['lines']:
            speaking[int((l['start'] - 0.15) * SR): int((l['end'] + 0.25) * SR)] = 1
    k = int(0.25 * SR)
    duck = 1 - 0.62 * np.convolve(speaking, np.ones(k) / k, mode='same')
    music_l *= duck; music_r *= duck
    music_gain = 1.0
else:
    music_gain = 1.6  # preview without voices: music a bit louder

L = music_l * music_gain + sfx + voice
R = music_r * music_gain + sfx + voice
mix = np.stack([L, R], axis=1)
peak = np.max(np.abs(mix)) or 1
mix = np.tanh(mix / peak * 1.2) / np.tanh(1.2) * 0.89

wav = os.path.join(OUT, 'audio.wav')
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes()
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', wav], input=pcm, check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '192k', os.path.join(OUT, 'audio.m4a')], check=True)
print('out/audio.wav', f'{DUR:.1f} s', 'with voices' if timing else 'music only (no voice/timing.json yet)')
