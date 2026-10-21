"""Original score and sound design, mixed with the voice-over.

Orchestral parts are written as MIDI and rendered with FluidSynth (FluidR3 GM);
impacts, risers, the page turn, clockwork and shimmer are synthesised here.

usage: python make_music.py [soundfont.sf2]
Writes build/audio/mix.wav (48 kHz stereo).
"""
import json
import os
import subprocess
import sys

import mido
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as sg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "audio")
SF2 = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/sounds/sf2/FluidR3_GM.sf2"
SR = 48000
DUR = 30.0
N = int(SR * DUR)
TPB = 960  # ticks per beat; tempo 60 bpm so one beat is one second
rng = np.random.default_rng(11)

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def m(name):
    """'D3' -> MIDI number."""
    pitch, octv = name[:-1], int(name[-1])
    return 12 * (octv + 1) + NOTE[pitch]


CHORDS = {
    "Dm": ["D2", "A2", "D3", "F3", "A3", "D4", "F4", "A4"],
    "Bb": ["Bb1", "F2", "Bb2", "D3", "F3", "Bb3", "D4", "F4"],
    "Gm": ["G1", "D2", "G2", "Bb2", "D3", "G3", "Bb3", "D4"],
    "F": ["F1", "C2", "F2", "A2", "C3", "F3", "A3", "C4"],
    "Eb": ["Eb2", "Bb2", "Eb3", "G3", "Bb3", "Eb4", "G4", "Bb4"],
    "C": ["C2", "G2", "C3", "E3", "G3", "C4", "E4", "G4"],
    "A": ["A1", "E2", "A2", "C#3", "E3", "A3", "C#4", "E4"],
    "D": ["D2", "A2", "D3", "F#3", "A3", "D4", "F#4", "A4"],
}


class Part:
    """One instrument on its own MIDI file so it renders as a separate stem."""

    def __init__(self, name, program, ch=0):
        self.name, self.program, self.ch = name, program, ch
        self.events = []  # (time, msg)
        self.cc(0.0, 7, 110)
        self.cc(0.0, 11, 100)
        self.cc(0.0, 91, 70)

    def note(self, t, dur, pitch, vel=80):
        p = m(pitch) if isinstance(pitch, str) else pitch
        self.events.append((t, mido.Message("note_on", channel=self.ch, note=p, velocity=int(vel))))
        self.events.append((t + dur, mido.Message("note_off", channel=self.ch, note=p, velocity=0)))

    def chord(self, t, dur, notes, vel=70):
        for n in notes:
            self.note(t, dur, n, vel)

    def cc(self, t, num, val):
        self.events.append((t, mido.Message("control_change", channel=self.ch, control=num, value=int(max(0, min(127, val))))))

    def ramp(self, t0, t1, v0, v1, num=11, steps=24):
        for i in range(steps + 1):
            k = i / steps
            self.cc(t0 + (t1 - t0) * k, num, v0 + (v1 - v0) * k)

    def save(self, path):
        mid = mido.MidiFile(ticks_per_beat=TPB)
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        tr.append(mido.MetaMessage("set_tempo", tempo=1_000_000))
        tr.append(mido.Message("program_change", channel=self.ch, program=self.program))
        ev = sorted(self.events, key=lambda e: (e[0], 0 if e[1].type == "note_off" else 1))
        last = 0
        for t, msg in ev:
            tick = int(round(t * TPB))
            tr.append(msg.copy(time=max(0, tick - last)))
            last = max(last, tick)
        tr.append(mido.MetaMessage("end_of_track", time=int(TPB * 0.5)))
        mid.save(path)


def compose():
    strings = Part("strings", 48)  # String Ensemble 1
    slow = Part("slowstrings", 49)  # String Ensemble 2
    low = Part("low", 42)  # Cello
    bass = Part("bass", 43)  # Contrabass
    choir = Part("choir", 52)  # Choir Aahs
    brass = Part("brass", 60)  # French horn
    brass2 = Part("brass2", 61)  # Brass section
    timp = Part("timp", 47)  # Timpani
    harp = Part("harp", 46)
    cel = Part("celesta", 8)

    motif = ["A4", "D5", "F5", "E5"]
    # Book opens: the motif on celesta, a low drone
    for i, n in enumerate(motif):
        cel.note(0.95 + i * 0.27, 1.2, n, 92)
    low.chord(0.9, 2.2, ["D2", "A2"], 55)
    bass.note(0.9, 2.2, "D2", 60)
    low.ramp(0.9, 3.0, 50, 100)
    choir.chord(1.4, 1.75, ["D4", "F4", "A4"], 52)
    choir.ramp(1.4, 3.0, 30, 105)
    arp = ["D4", "F4", "A4", "D5", "F5", "A5", "D6", "F6", "A6"]
    for i, n in enumerate(arp):
        harp.note(1.5 + i * 0.13, 1.4, n, 70 + i * 3)

    # 3.0-7.0 the library awakens
    strings.chord(3.0, 2.0, CHORDS["Dm"][2:7], 72)
    strings.chord(5.0, 2.05, CHORDS["Bb"][2:7], 74)
    strings.ramp(3.0, 7.0, 70, 105)
    bass.note(3.0, 2.0, "D2", 72)
    bass.note(5.0, 2.05, "Bb1", 72)
    choir.chord(3.0, 4.05, ["D4", "F4", "A4"], 60)
    pat = ["D4", "A4", "D5", "F5", "A5", "F5", "D5", "A4"]
    for k in range(16):
        harp.note(3.0 + k * 0.25, 0.6, pat[k % 8] if k < 8 else ["Bb3", "F4", "Bb4", "D5", "F5", "D5", "Bb4", "F4"][k % 8], 68)

    # 7.0-11.2 two thousand years: one chord per era, cello ostinato
    eras = [(7.02, "Gm"), (8.08, "F"), (9.16, "Eb"), (10.24, "A")]
    for i, (t, c) in enumerate(eras):
        d = 1.08 if i < 3 else 0.98
        strings.chord(t, d, CHORDS[c][2:7], 82)
        bass.note(t, d, CHORDS[c][0], 82)
        timp.note(t, 0.8, CHORDS[c][1] if c != "Eb" else "Bb1", 88)
        root = CHORDS[c][2]
        for k in range(4):
            low.note(t + k * 0.27, 0.22, root if k % 2 == 0 else CHORDS[c][3], 84)
    strings.ramp(7.0, 11.2, 90, 115)
    choir.chord(7.02, 4.2, ["D4", "G4", "Bb4"], 58)

    # 11.2-16.0 the moment history changes
    prog = [(11.2, 1.2, "Bb"), (12.4, 0.6, "C"), (13.0, 1.5, "Dm"), (14.5, 0.5, "Bb"), (15.0, 1.0, "A")]
    for t, d, c in prog:
        strings.chord(t, d, CHORDS[c][2:8], 88)
        slow.chord(t, d, CHORDS[c][3:8], 70)
        bass.note(t, d, CHORDS[c][0], 88)
        for k in range(int(d / 0.25)):
            low.note(t + k * 0.25, 0.2, CHORDS[c][2], 88)
    for i, n in enumerate(["A3", "D4", "F4", "E4"]):
        brass.note(13.0 + i * 0.35, 0.5 if i < 3 else 1.2, n, 92)
    brass2.chord(14.5, 0.45, ["Bb2", "F3", "Bb3", "D4"], 96)
    timp.note(13.0, 1.0, "D2", 105)
    timp.note(14.5, 0.8, "Bb1", 110)
    for k in range(20):  # timpani roll into the city
        timp.note(15.0 + k * 0.05, 0.06, "A1", 50 + k * 3.5)
    strings.ramp(11.2, 16.0, 95, 127)
    choir.chord(13.0, 3.0, ["D4", "F4", "A4", "D5"], 72)
    choir.ramp(13.0, 16.0, 80, 120)

    # 16.0-24.6 Alexandria: the full orchestra, climax, then a hard stop
    big = [(16.0, 1.5, "Dm"), (17.5, 1.5, "Bb"), (19.0, 1.5, "F"), (20.5, 1.5, "C"), (22.0, 1.0, "Bb"), (23.0, 0.8, "C"), (23.8, 0.8, "D")]
    for t, d, c in big:
        notes = CHORDS[c]
        strings.chord(t, d, notes[2:8], 100)
        strings.chord(t, d, [n[:-1] + str(int(n[-1]) + 1) for n in notes[5:8]], 92)
        slow.chord(t, d, notes[3:8], 90)
        bass.note(t, d, notes[0], 100)
        low.chord(t, d, notes[1:3], 98)
        brass2.chord(t, d, notes[2:6], 92 if t < 22 else 108)
        brass.chord(t, d, notes[4:7], 90)
        choir.chord(t, d, notes[4:8], 96 if t < 22 else 112)
    for k in range(12):  # heroic horn line
        brass.note(16.0 + k * 0.5, 0.45, ["D4", "F4", "A4", "D5", "C5", "Bb4", "A4", "F4", "G4", "A4", "C5", "E5"][k], 100)
    for i, n in enumerate(motif):
        brass.note(22.0 + i * 0.4, 0.38 if i < 3 else 1.0, n.replace("4", "4").replace("5", "5"), 112)
    t = 16.0
    while t < 24.5:
        timp.note(t, 0.4, "D2" if int((t - 16) / 0.75) % 2 == 0 else "A1", 112 if t >= 22 else 96)
        t += 0.75
    for k in range(16):
        timp.note(23.8 + k * 0.05, 0.06, "D2", 70 + k * 3)
    for k in range(32):
        harp.note(16.0 + k * 0.1875, 0.3, ["D5", "F5", "A5", "D6"][k % 4], 72)
    for p in (strings, slow, choir, brass, brass2):
        p.ramp(16.0, 24.55, 110, 127)

    # 26.0-30.0 the question: hushed choir, motif when the symbol lights up
    choir.chord(26.0, 3.7, ["D4", "F4", "A4"], 50)
    choir.ramp(26.0, 27.0, 40, 90)
    choir.ramp(28.8, 29.85, 90, 0)
    slow.chord(26.1, 3.6, ["D3", "A3", "F4"], 45)
    slow.ramp(26.1, 27.0, 30, 80)
    slow.ramp(28.8, 29.85, 80, 0)
    bass.note(26.1, 3.6, "D2", 50)
    for i, n in enumerate(motif):
        cel.note(28.15 + i * 0.27, 1.4, n, 95)
    for i, n in enumerate(arp[:7]):
        harp.note(28.0 + i * 0.1, 1.4, n, 60 + i * 4)
    return [strings, slow, low, bass, choir, brass, brass2, timp, harp, cel]


def render(part):
    mid = os.path.join(OUT, f"{part.name}.mid")
    wav = os.path.join(OUT, f"{part.name}.wav")
    part.save(mid)
    subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.9", "-r", str(SR), "-R", "1", "-C", "0", "-F", wav, SF2, mid], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sr, a = wavfile.read(wav)
    a = a.astype(np.float32) / 32768.0
    if a.ndim == 1:
        a = np.stack([a, a], 1)
    out = np.zeros((N, 2), np.float32)
    k = min(N, len(a))
    out[:k] = a[:k]
    return out


# ------------------------------------------------------------------ synthesis
def env_exp(n, decay):
    return np.exp(-np.arange(n) / SR / decay).astype(np.float32)


def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        buf[i : i + len(sig), 0] += sig * gain * l * 1.414
        buf[i : i + len(sig), 1] += sig * gain * r * 1.414
    else:
        buf[i : i + len(sig)] += sig * gain


def bandpass(x, lo, hi, order=2):
    sos = sg.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sg.sosfilt(sos, x).astype(np.float32)


def lowpass(x, f, order=2):
    return sg.sosfilt(sg.butter(order, f, btype="low", fs=SR, output="sos"), x).astype(np.float32)


def highpass(x, f, order=2):
    return sg.sosfilt(sg.butter(order, f, btype="high", fs=SR, output="sos"), x).astype(np.float32)


def page_turn():
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    body = bandpass(noise, 900, 6500)
    envl = (np.exp(-((t - 0.12) / 0.07) ** 2) * 0.8 + np.exp(-((t - 0.26) / 0.05) ** 2) + np.exp(-((t - 0.36) / 0.08) ** 2) * 0.6).astype(np.float32)
    crack = np.zeros(n, np.float32)
    for _ in range(26):
        i = rng.integers(int(0.05 * SR), int(0.45 * SR))
        crack[i : i + 60] += rng.standard_normal(min(60, n - i)).astype(np.float32) * 0.6
    crack = highpass(crack, 2500)
    swish = bandpass(noise, 300, 1500) * np.exp(-((t - 0.28) / 0.1) ** 2).astype(np.float32)
    return (body * envl * 0.5 + crack * 0.35 + swish * 0.4).astype(np.float32)


def boom(size=1.0):
    n = int((1.5 + size * 1.5) * SR)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t * 9)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * np.exp(-t / (0.5 + size * 0.7))
    noise = lowpass(rng.standard_normal(n).astype(np.float32), 900) * np.exp(-t / 0.18)
    click = highpass(rng.standard_normal(n).astype(np.float32), 3000) * np.exp(-t / 0.01)
    return (sub * 0.9 + noise * 0.35 + click * 0.15).astype(np.float32)


def riser(dur, f0=200, f1=5000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n).astype(np.float32)
    out = np.zeros(n, np.float32)
    seg = int(0.05 * SR)
    for s in range(0, n, seg):
        k = s / n
        fc = f0 * (f1 / f0) ** k
        part = bandpass(noise[max(0, s - 400) : s + seg], fc * 0.7, min(fc * 1.4, SR / 2 - 100))
        out[s : s + seg] = part[-min(seg, n - s):]
    amp = (t / dur) ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(80 + 340 * (t / dur) ** 2) / SR) * 0.25
    return ((out + tone) * amp).astype(np.float32)


def whoosh(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = bandpass(rng.standard_normal(n).astype(np.float32), 400, 3500)
    return (x * np.sin(np.pi * t / dur) ** 2).astype(np.float32)


def tick(hi=True):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    f = 3200 if hi else 2100
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) + highpass(rng.standard_normal(n).astype(np.float32), 4000) * np.exp(-t / 0.002) * 0.5
    return s.astype(np.float32)


def sparkle():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = rng.uniform(2200, 5200)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.12) + np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.05) * 0.3).astype(np.float32)


def sound_design():
    fx = np.zeros((N, 2), np.float32)
    place(fx, page_turn(), 0.05, 0.8, -0.1)
    place(fx, page_turn(), 29.42, 0.7, 0.1)
    for t, s, g in [(0.92, 0.6, 0.7), (2.98, 0.9, 0.9), (11.18, 0.8, 0.8), (14.5, 0.8, 0.85), (16.0, 1.4, 1.2), (22.0, 1.0, 0.9), (24.58, 1.2, 0.0)]:
        if g:
            place(fx, boom(s), t, g)
    place(fx, riser(1.1, 300, 7000), 1.9, 0.35)
    place(fx, riser(1.9, 150, 6000), 14.1, 0.45)
    for t in (6.95, 11.1, 26.05, 27.6):
        place(fx, whoosh(0.7), t - 0.35, 0.35, rng.uniform(-0.4, 0.4))
    # Clockwork through the eras and the mechanism
    t = 7.0
    k = 0
    while t < 15.9:
        place(fx, tick(k % 2 == 0), t, 0.18 if t < 11.2 else 0.22, -0.3 if k % 2 else 0.3)
        t += 0.27 if t < 11.2 else 0.135
        k += 1
    for _ in range(28):
        place(fx, sparkle(), rng.uniform(1.3, 3.0), 0.06, rng.uniform(-0.8, 0.8))
    for _ in range(22):
        place(fx, sparkle(), rng.uniform(28.0, 29.5), 0.05, rng.uniform(-0.8, 0.8))
    # Low pulse at the very start and end to tie the loop together
    n = int(1.2 * SR)
    tt = np.arange(n) / SR
    pulse = (np.sin(2 * np.pi * 41 * tt) * np.exp(-tt / 0.35)).astype(np.float32)
    place(fx, pulse, 0.6, 0.5)
    place(fx, pulse, 28.15, 0.45)
    return fx


def reverb_ir(seconds=2.6, predelay=0.02):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32)
    for c in range(2):
        noise = rng.standard_normal(n).astype(np.float32)
        noise = lowpass(noise, 7000)
        ir[:, c] = noise * np.exp(-t / (seconds / 6.9)).astype(np.float32)
    ir[: int(predelay * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def convolve(x, ir):
    return np.stack([sg.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1).astype(np.float32)


def load_vo():
    vo = np.zeros((N, 2), np.float32)
    with open(os.path.join(ROOT, "build", "timeline.json"), encoding="utf-8") as f:
        tl = json.load(f)
    for line in tl["vo"]:
        sr, a = wavfile.read(os.path.join(ROOT, line["file"]))
        a = a.astype(np.float32) / 32768.0
        if sr != SR:
            a = sg.resample_poly(a, SR, sr).astype(np.float32)
        a = highpass(a, 85)
        # Gentle presence lift around 3 kHz
        a = a + bandpass(a, 2200, 4500) * 0.35
        place(vo, a, line["start"], 1.0)
    return vo


def compress(x, thr=0.25, ratio=3.0, att=0.004, rel=0.12):
    lvl = np.abs(x).max(1)
    a_att, a_rel = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    env = np.zeros_like(lvl)
    e = 0.0
    for i in range(len(lvl)):  # simple peak follower
        v = lvl[i]
        e = a_att * e + (1 - a_att) * v if v > e else a_rel * e + (1 - a_rel) * v
        env[i] = e
    gain = np.where(env > thr, (thr + (env - thr) / ratio) / np.maximum(env, 1e-9), 1.0)
    return (x * gain[:, None]).astype(np.float32)


def main():
    os.makedirs(OUT, exist_ok=True)
    parts = compose()
    gains = {"strings": 0.9, "slowstrings": 0.6, "low": 0.8, "bass": 0.8, "choir": 0.55, "brass": 0.7, "brass2": 0.6, "timp": 0.9, "harp": 0.55, "celesta": 0.8}
    music = np.zeros((N, 2), np.float32)
    for p in parts:
        music += render(p) * gains[p.name]
        print("rendered", p.name)
    fx = sound_design()
    rev = convolve(music * 0.5 + fx * 0.35, reverb_ir(2.8))
    bed = music + fx + rev * 0.45

    # The hard stop at 24.6: music and its tail drop out, back at 26.0
    t = np.arange(N) / SR
    gate = np.ones(N, np.float32)
    gate[(t >= 24.6) & (t < 26.0)] = 0
    fade = (t >= 24.55) & (t < 24.6)
    gate[fade] = 1 - (t[fade] - 24.55) / 0.05
    rise = (t >= 25.95) & (t < 26.0)
    gate[rise] = (t[rise] - 25.95) / 0.05
    bed *= gate[:, None]
    # Room tone in the silence so it is not digital black
    air = lowpass(rng.standard_normal(N).astype(np.float32), 400) * 0.004
    bed += np.stack([air, air], 1) * (1 - gate[:, None])

    vo = load_vo()
    # Duck the bed under the voice
    venv = np.abs(vo).max(1)
    venv = sg.sosfiltfilt(sg.butter(1, 4, fs=SR, output="sos"), venv)
    duck = 1 - 0.5 * np.clip(venv / (venv.max() * 0.25 + 1e-9), 0, 1)
    bed *= duck[:, None]
    vo_rev = convolve(vo, reverb_ir(1.4, 0.015)) * 0.12
    peak_bed = np.abs(bed).max()
    mix = bed / peak_bed * 0.55 + (vo + vo_rev) / (np.abs(vo).max() + 1e-9) * 0.62
    mix = compress(mix, thr=0.45, ratio=4)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= 0.95 / np.abs(mix).max()
    # Fade the very edges so the loop point is clean
    edge = int(0.01 * SR)
    mix[:edge] *= np.linspace(0, 1, edge)[:, None]
    mix[-int(0.15 * SR):] *= np.linspace(1, 0, int(0.15 * SR))[:, None]
    wavfile.write(os.path.join(OUT, "mix_raw.wav"), SR, (mix * 32767).astype(np.int16))
    print("wrote mix_raw.wav")


if __name__ == "__main__":
    main()
