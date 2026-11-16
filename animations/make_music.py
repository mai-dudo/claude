"""Original background music + sound design for the Tashkent TV Tower animation.

Everything is synthesized here (no samples), timed to the events in
tashkent-tv-tower.html. Writes a 20 s stereo 48 kHz WAV.

    python3 make_music.py out.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 20.0
N = int(SR * DUR)
rng = np.random.default_rng(1985)
T = np.arange(N) / SR

# ---------------------------------------------------------------- helpers
def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)

def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)

def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)

def saw(f, n, phase=0.0):
    return 2.0 * ((phase + np.arange(n) * f / SR) % 1.0) - 1.0

class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, start, sig, gain=1.0, pan=0.0):
        i = int(round(start * SR))
        if i >= N or len(sig) == 0:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        j = min(N, i + len(sig))
        a = (pan + 1) * np.pi / 4
        self.l[i:j] += sig[: j - i] * gain * np.cos(a) * 1.41
        self.r[i:j] += sig[: j - i] * gain * np.sin(a) * 1.41

    def stereo(self):
        return np.stack([self.l, self.r])

def env_curve(points):
    """piecewise-linear automation over the whole timeline: [(t, v), ...]"""
    ts, vs = zip(*points)
    return np.interp(T, ts, vs)

# ---------------------------------------------------------------- arrangement
BEAT = 0.5
CHORDS = [  # start, end, pad voicing (midi), bass root (midi)
    (0.0, 2.0, [50, 53, 57, 62], 38),    # Dm
    (2.0, 4.0, [46, 50, 53, 58], 34),    # Bb
    (4.0, 6.0, [48, 53, 57, 60], 41),    # F
    (6.0, 8.0, [48, 52, 55, 60], 36),    # C
    (8.0, 10.0, [50, 53, 57, 62], 38),   # Dm
    (10.0, 12.0, [46, 50, 53, 58], 34),  # Bb
    (12.0, 13.0, [48, 53, 57, 60], 41),  # F
    (13.0, 14.5, [48, 52, 55, 62], 36),  # C(add9)  -> build
    (14.5, 16.95, [50, 53, 57, 64], 38), # Dm(add9) -> earthquake, dark
    (16.95, 18.0, [53, 57, 60, 65], 41), # F        -> opening day
    (18.0, 19.0, [52, 55, 60, 64], 40),  # C/E
    (19.0, 20.0, [50, 53, 57, 62], 38),  # Dm (loops back to the start)
]
KICKS = [4.0 + k * BEAT for k in range(21)] + [17.0 + k * BEAT for k in range(6)]
HEARTBEAT = [15.0, 15.22, 16.0, 16.22]

# event times taken from the animation
def inv_inout_cubic(u):
    return np.cbrt(u / 4) if u < .5 else 1 - np.cbrt(2 * (1 - u)) / 2

def cross_t(y, tA, tB, hA, hB):
    return tA + inv_inout_cubic((y - hA) / (hB - hA)) * (tB - tA)

CORE_TICKS = [cross_t(11 * k, 4.45, 6.6, 0, 121) for k in range(1, 12)]
UPPER_TICKS = [cross_t(y, 12.35, 14.45, 121, 376) for y in [121 + 12.4 * k for k in range(1, 11)] + [290, 330, 362]]
LEG_TIMES = [6.85, 7.15, 7.45]
POD_LANDINGS = [9.95, 10.2, 10.4, 10.6, 10.8]
LABEL_POPS = [0.15, 5.0, 7.65, 8.25, 10.45, 10.95, 14.05, 15.0]
CARD_POPS = [2.0, 4.15, 6.85, 9.6, 12.4, 14.85, 16.95]

music, drums, sfx, send = Bus(), Bus(), Bus(), Bus()

# ---------------------------------------------------------------- pad (supersaw, two filter states crossfaded)
pad_raw = Bus()
for (s, e, notes, _) in CHORDS:
    rel = 0.9
    n = int((e - s + rel) * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.35) * np.clip((e - s + rel - t) / rel, 0, 1) ** 1.5
    for m in notes:
        for k, det in enumerate([-9, -3, 3, 9]):
            v = saw(hz(m) * 2 ** (det / 1200), n, rng.random()) * env
            pad_raw.add(s, v, 0.05, pan=(-0.7, -0.25, 0.25, 0.7)[k])
pad = pad_raw.stereo()
bright = env_curve([(0, .32), (3.8, .62), (4.0, .7), (12.3, .7), (14.45, 1.0), (14.6, .08), (16.7, .12), (16.95, 1.0), (20, 1.0)])
pad = np.stack([lp(ch, 500, 4) * (1 - bright) + lp(ch, 3800, 2) * bright for ch in pad])
pad_gain = env_curve([(0, 1.9), (3.9, 1.9), (4, .7), (14.4, .8), (14.6, .55), (16.9, .5), (17.0, .85), (20, .85)])
pad *= pad_gain

# ---------------------------------------------------------------- arpeggio (16ths) + ping-pong delay
arp = Bus()
step = BEAT / 4
pattern = [0, 1, 2, 3, 4, 3, 2, 1]
for (s, e, notes, _) in CHORDS:
    if 14.5 <= s < 16.95:          # silent during the earthquake
        continue
    tones = [m + 12 for m in notes] + [notes[0] + 24]
    k = 0
    t0 = s
    while t0 < e - 1e-6:
        m = tones[pattern[k % len(pattern)]]
        if s >= 16.95 and k % 4 == 0:
            m += 12
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        v = (0.6 * saw(hz(m), n) + 0.4 * np.sign(np.sin(2 * np.pi * hz(m) * tt))) * np.exp(-tt / 0.11) * np.minimum(1, tt / 0.002)
        vel = 0.75 + 0.25 * (k % 4 == 0)
        arp.add(t0, v, 0.11 * vel, pan=0.35 * np.sin(k * 1.3))
        k += 1
        t0 += step
arp_s = arp.stereo()
arp_bright = env_curve([(0, .25), (4, .55), (12.4, .6), (14.45, .9), (16.95, .9), (17.0, 1.0), (20, 1.0)])
arp_s = np.stack([lp(ch, 1100, 2) * (1 - arp_bright) + lp(ch, 5200, 2) * arp_bright for ch in arp_s])
arp_s *= env_curve([(0, 1.6), (1.5, 1.9), (3.9, 2.0), (4, .9), (20, .9)])
d = int(0.375 * SR)
dl = np.zeros(N); dr = np.zeros(N)
for i in range(1, 5):
    g = 0.38 ** i
    src = arp_s[0] + arp_s[1]
    sh = np.zeros(N); sh[i * d:] = src[: N - i * d] * g
    (dl if i % 2 else dr)[:] += lp(sh, 3500 - i * 500)
arp_s += 0.5 * np.stack([dl, dr])

# ---------------------------------------------------------------- bass (8ths, from the foundation onwards)
bass = Bus()
for (s, e, notes, root) in CHORDS:
    if s < 4.0:
        continue
    t0 = s
    quake = 14.5 <= s < 16.95
    while t0 < e - 1e-6:
        n = int((0.24 if not quake else 0.6) * SR)
        tt = np.arange(n) / SR
        f = hz(root)
        v = np.sin(2 * np.pi * f * tt) + 0.35 * lp(saw(f, n), 420)
        v *= np.exp(-tt / (0.2 if not quake else 0.45)) * np.minimum(1, tt / 0.004)
        bass.add(t0, v, 0.27 if not quake else 0.18)
        t0 += BEAT / 2 if not quake else BEAT * 2
bass_s = bass.stereo()

# sidechain from the kicks
duck = np.ones(N)
for tk in KICKS + HEARTBEAT:
    i = int(tk * SR)
    n = min(N - i, int(0.45 * SR))
    tt = np.arange(n) / SR
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.6 * np.exp(-tt / 0.11))
pad *= duck; arp_s *= duck ** 0.6; bass_s *= duck ** 0.8

# ---------------------------------------------------------------- drums
def kick(dec=0.32, f0=120, f1=44, click=0.5):
    n = int(0.6 * SR); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    v = np.sin(ph) * np.exp(-tt / dec)
    v += click * hp(rng.standard_normal(n), 2500) * np.exp(-tt / 0.004)
    return np.tanh(1.6 * v)

def hat(dec=0.035, f=7500):
    n = int(0.2 * SR); tt = np.arange(n) / SR
    return hp(rng.standard_normal(n), f, 2) * np.exp(-tt / dec)

def clap():
    n = int(0.35 * SR); tt = np.arange(n) / SR
    e = sum(np.exp(-np.maximum(0, tt - o) / 0.008) * (tt >= o) for o in (0, .011, .022)) + 0.6 * np.exp(-np.maximum(0, tt - .03) / 0.12) * (tt > .03)
    return bp(rng.standard_normal(n), 900, 3200) * e * 0.6

def crash(dec=1.4):
    n = int(2.5 * SR); tt = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4200) * np.exp(-tt / dec) * 0.5

for tk in KICKS:
    drums.add(tk, kick(), 0.8 if tk < 8 else 0.95)
# soft filtered pulse through the intro (0-4 s), before the drop
for k, tk in enumerate(np.arange(0.0, 4.0, BEAT)):
    drums.add(tk, lp(kick(0.25, 100, 48, 0.0), 300), 0.3 + 0.25 * k / 8)
    drums.add(tk + BEAT / 2, hat(0.03, 6000), 0.07, pan=0.3)
for tk in HEARTBEAT:
    drums.add(tk, kick(dec=0.4, f0=90, f1=38, click=0.1), 0.75)
for b in np.arange(6.0, 14.5, BEAT):
    drums.add(b + BEAT / 2, hat(0.05), 0.16, pan=0.25)
for b in np.arange(8.0, 14.5, BEAT / 4):
    drums.add(b, hat(0.018, 9000), 0.06, pan=-0.3)
for b in np.arange(17.0, 19.75, BEAT):
    drums.add(b + BEAT / 2, hat(0.05), 0.16, pan=0.25)
for b in np.arange(8.0, 12.4, 2 * BEAT):
    drums.add(b + BEAT, clap(), 0.5)
for b in [17.5, 18.5, 19.5]:
    drums.add(b, clap(), 0.5)
# snare roll build into the top of the tower
t0 = 12.4
while t0 < 14.42:
    p = (t0 - 12.4) / 2.05
    drums.add(t0, clap(), 0.12 + 0.38 * p ** 1.5, pan=0.15 * np.sin(t0 * 9))
    t0 += BEAT / 4 if p < .5 else BEAT / 8
for tc, g in ((14.45, .3), (17.0, .45)):
    drums.add(tc, crash(0.8), g, pan=-0.2)
    drums.add(tc + .01, crash(0.55), g * .6, pan=0.3)

# ---------------------------------------------------------------- sound design
def boom(dec=1.2, gain_noise=0.6):
    n = int(3.0 * SR); tt = np.arange(n) / SR
    f = 34 + 70 * np.exp(-tt * 9)
    v = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / dec)
    v += gain_noise * lp(rng.standard_normal(n), 900) * np.exp(-tt / 0.25)
    return np.tanh(1.3 * v)

def riser(length, f_lo, f_hi, rev=False):
    n = int(length * SR); tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); chunk = 1024
    for i in range(0, n, chunk):
        p = i / n
        fc = f_lo * (f_hi / f_lo) ** p
        out[i:i + chunk] = bp(x[max(0, i - 4096):i + chunk], fc * 0.7, min(fc * 1.4, SR / 2 - 200))[-len(x[i:i + chunk]):]
    tone = np.sin(2 * np.pi * np.cumsum(220 * (2 ** (2 * tt / length))) / SR) * 0.25
    v = (out + tone) * (tt / length) ** 2
    return v[::-1] if rev else v

def whoosh(length=0.7, f_lo=300, f_hi=3000):
    n = int(length * SR); tt = np.arange(n) / SR
    w = np.sin(np.pi * np.clip(tt / length, 0, 1)) ** 2
    x = rng.standard_normal(n); out = np.zeros(n); chunk = 1024
    for i in range(0, n, chunk):
        fc = f_lo * (f_hi / f_lo) ** (i / n)
        out[i:i + chunk] = bp(x[max(0, i - 4096):i + chunk], fc * .6, fc * 1.6)[-len(x[i:i + chunk]):]
    return out * w

def bell(m, dec=1.6):
    n = int(dec * 2.5 * SR); tt = np.arange(n) / SR
    f = hz(m)
    mod = np.sin(2 * np.pi * f * 3.5 * tt) * 2.2 * np.exp(-tt / 0.25)
    v = np.sin(2 * np.pi * f * tt + mod) * np.exp(-tt / dec) + 0.3 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / (dec * .3))
    return v * np.minimum(1, tt / 0.002)

def tick(f=1600):
    n = int(0.08 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.018)

def blip(f0=1500, f1=900):
    n = int(0.12 * SR); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.045)

# intro sparkle on the pin + blueprint shimmer
sfx.add(0.0, bell(86, 1.2), 0.12, pan=0.2)
for k, m in enumerate([74, 77, 81, 86, 89, 93]):
    sfx.add(1.85 + k * 0.11, bell(m, 1.0), 0.06, pan=-0.5 + k * 0.2)
sfx.add(1.4, riser(0.6, 400, 6000), 0.05)
# foundation impact
sfx.add(4.02, boom(1.0), 0.55)
# core band ticks (rising)
for k, tc in enumerate(CORE_TICKS):
    sfx.add(tc, tick(1100 + 90 * k), 0.07, pan=0.3 * np.sin(k))
sfx.add(4.3, riser(2.3, 200, 2500), 0.035)
# legs: three whooshes and soft thuds
for k, tl in enumerate(LEG_TIMES):
    sfx.add(tl - 0.05, whoosh(0.9, 250, 2600), 0.09, pan=(-0.6, 0.0, 0.6)[k])
    sfx.add(tl + 0.85, kick(0.25, 90, 50, 0.05), 0.25)
sfx.add(8.15, whoosh(0.6, 2000, 500), 0.05)
# pod pieces land: a rising bell motif
for tl, m in zip(POD_LANDINGS, [74, 77, 81, 84, 86]):
    sfx.add(tl, bell(m, 1.3), 0.14, pan=(m - 80) / 12)
    sfx.add(tl, kick(0.12, 140, 70, 0.2), 0.12)
# upper shaft ticks + big riser into the 375 m reveal
for k, tc in enumerate(UPPER_TICKS):
    sfx.add(tc, tick(1500 + 70 * k), 0.06, pan=-0.3 * np.sin(k))
sfx.add(12.35, riser(2.1, 180, 7000), 0.09)
sfx.add(14.45, boom(1.6, 0.8), 0.7)
sfx.add(14.47, bell(86, 2.2), 0.12)
# earthquake rumble
n = int(2.4 * SR); tt = np.arange(n) / SR
brown = np.cumsum(rng.standard_normal(n)); brown -= lp(brown, 8, 1)
rum = lp(brown, 140, 4); rum /= np.abs(rum).max()
rum = rum * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * tt) ** 2) + 0.5 * np.sin(2 * np.pi * 36 * tt)
rum *= np.minimum(1, tt / 0.25) * np.clip((2.4 - tt) / 0.9, 0, 1)
sfx.add(14.75, rum, 0.55)
for k in range(6):
    sfx.add(14.95 + k * 0.32, kick(0.5, 70, 32, 0.0), 0.18)
# swell into the opening day, final chime
sfx.add(16.35, riser(0.62, 300, 8000), 0.1)
sfx.add(17.0, boom(1.4, 0.5), 0.5)
for k, m in enumerate([77, 81, 84, 89]):
    sfx.add(17.0 + k * 0.06, bell(m, 2.0), 0.08, pan=-0.4 + k * 0.27)
sfx.add(17.15, bell(93, 1.8), 0.07, pan=0.3)
# UI pops for labels and caption cards
for tl in LABEL_POPS:
    sfx.add(tl, blip(), 0.05, pan=0.3)
for tc in CARD_POPS:
    sfx.add(tc, whoosh(0.35, 1500, 5000), 0.025, pan=-0.2)

# ---------------------------------------------------------------- reverb (stereo synthetic IR) and master
def ir(seed, length=2.4, t60=2.1):
    g = np.random.default_rng(seed)
    n = int(length * SR); tt = np.arange(n) / SR
    v = g.standard_normal(n) * np.exp(-6.9 * tt / t60)
    v = lp(v, 6000)
    v[: int(0.012 * SR)] = 0
    return v / np.sqrt(np.sum(v ** 2))

sfx_s = sfx.stereo()
drums_s = drums.stereo()
wet_src = pad * 0.6 + arp_s * 0.9 + sfx_s * 0.8 + drums_s * 0.08
wet = np.stack([fftconvolve(wet_src[0], ir(1))[:N], fftconvolve(wet_src[1], ir(2))[:N]]) * 0.55

mix = pad + arp_s + bass_s + drums_s + sfx_s + wet
mix = np.stack([hp(ch, 28) for ch in mix])
fade = np.clip((DUR - T) / 0.7, 0, 1) ** 1.5
fade_in = np.minimum(1, T / 0.02)
mix *= fade * fade_in
mix = np.tanh(1.15 * mix / np.abs(mix).max() * 1.2) / np.tanh(1.15 * 1.2)
mix *= 10 ** (-1.0 / 20) / np.abs(mix).max()

out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
pcm = (mix.T * 32767).astype(np.int16)
import wave
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out, mix.shape, 'peak', np.abs(mix).max())
