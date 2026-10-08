"""Synthesised soundtrack synced to the clip's cuts (no samples, numpy only).

kick + clap on every tile cut, hats between cuts, a boom when the tiles
disappear, a soft pad under the titles, a whoosh for the arc, and a bright
"pop" chime on each title card.
"""
import wave

import numpy as np

SR = 48000


def _env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = np.random.default_rng(1).normal(0, 1, n) * np.exp(-t / 0.004) * 0.3
    return gain * (np.sin(ph) * np.exp(-t / 0.16) + click)


def clap(gain=0.5):
    n = int(0.25 * SR)
    rng = np.random.default_rng(2)
    x = rng.normal(0, 1, n)
    x = x - np.concatenate([[0], x[:-1]]) * 0.6  # brighten
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        i = int(d * SR)
        e[i:] += _env(n - i, 0.001, 0.05)
    return gain * x * e * 0.5


def hat(gain=0.18):
    n = int(0.08 * SR)
    x = np.random.default_rng(3).normal(0, 1, n)
    x = np.diff(np.concatenate([[0], x]))
    return gain * x * _env(n, 0.0005, 0.018)


def boom(gain=1.0):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = 38 + 90 * np.exp(-t / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    noise = np.random.default_rng(4).normal(0, 1, n) * np.exp(-t / 0.25) * 0.25
    return gain * (body + _lowpass(noise, 0.08))


def whoosh(dur, gain=0.35, rising=True):
    n = int(dur * SR)
    x = np.random.default_rng(5).normal(0, 1, n)
    t = np.linspace(0, 1, n)
    a = (0.02 + 0.25 * (t if rising else 1 - t))
    y = _lowpass_var(x, a)
    return gain * y * np.sin(np.pi * t) ** 1.5


def chime(freqs, gain=0.28):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    y = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs)
    return gain * y / len(freqs) * _env(n, 0.002, 0.28)


def pop(gain=0.5):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 900 * np.exp(-t / 0.03) + 250
    return gain * np.sin(2 * np.pi * np.cumsum(f) / SR) * _env(n, 0.001, 0.035)


def pad(dur, freqs, gain=0.12):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in freqs:
        for det in (-0.6, 0.6):
            ph = 2 * np.pi * (f + det) * t
            y += np.sign(np.sin(ph)) * 0.3 + np.sin(ph)
    y = _lowpass(y, 0.04)
    fade = np.minimum(1, t / 0.4) * np.minimum(1, (dur - t) / 0.4)
    return gain * y / (len(freqs) * 2) * fade


def bass(dur, f, gain=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    return gain * y * _env(n, 0.005, dur * 0.6)


def _lowpass(x, a):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc)
        y[i] = acc
    return y / max(a ** 0.5, 1e-3) * 0.3


def _lowpass_var(x, a):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a[i] * (v - acc)
        y[i] = acc
    return y * 2.0


def render(path, duration, cuts, tiles_off, titles, arc_in, arc_out, loops=1):
    """cuts: times of tile changes; tiles_off: time tiles vanish; titles: [t1, t2]."""
    n = int(duration * SR)
    mix = np.zeros(n)

    def put(sig, t):
        i = int(round(t * SR))
        if i >= n:
            return
        j = min(n, i + len(sig))
        mix[i:j] += sig[:j - i]

    notes = [65.41, 55.0, 43.65, 49.0]  # C2 A1 F1 G1, one per texture set
    for k, (t, s) in enumerate(cuts):
        put(kick(0.9), t)
        put(bass(0.45, notes[s]), t)
        if k % 2 == 1:
            put(clap(), t)
        put(hat(), t + 0.25)
    put(boom(), tiles_off)
    t1, t2 = titles
    put(pad(t2 + 1.75 - tiles_off, [261.63, 329.63, 392.0]), tiles_off)
    tt = tiles_off + 0.25
    while tt < t2 + 1.7:
        put(hat(0.08), tt)
        tt += 0.25
    put(pop(), t1)
    put(chime([523.25, 659.25, 783.99]), t1)
    put(pop(), t2)
    put(chime([659.25, 783.99, 1046.5]), t2)
    put(whoosh(arc_in[1] - arc_in[0] + 0.15), arc_in[0] - 0.05)
    put(whoosh(arc_out[1] - arc_out[0] + 0.15, rising=False), arc_out[0] - 0.05)

    mix = np.tanh(mix * 1.1) * 0.85
    left = mix
    right = np.concatenate([np.zeros(int(0.004 * SR)), mix[:-int(0.004 * SR)]])  # tiny stereo width
    st = np.stack([left, right], 1)
    st = np.tile(st, (loops, 1))
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype("<i2").tobytes())
    return path
