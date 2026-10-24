"""Звуковая дорожка: голос по сценам, фоновый гул и простые эффекты, синтезированные на месте."""
import subprocess
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def duration(path):
    return len(decode(path)) / SR


def band(x, lo=0, hi=SR / 2):
    """Полосовой фильтр через БПФ с мягкими краями."""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi < SR / 2:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * m, len(x)).astype(np.float32)


def noise(sec):
    return rng.standard_normal(int(sec * SR)).astype(np.float32)


def env(n, attack, release):
    t = np.arange(n) / SR
    return (np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / max(release, 1e-4))).astype(np.float32)


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1
    return (x / m * peak).astype(np.float32)


def place(dst, src, at):
    i = int(at * SR)
    if i >= len(dst):
        return
    src = src[:len(dst) - i]
    dst[i:i + len(src)] += src


# ───────── эффекты ─────────
def fx_hit(**_):
    t = np.arange(int(1.8 * SR)) / SR
    freq = 38 + 60 * np.exp(-t / 0.12)
    boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.5)
    click = band(noise(1.8), 0, 1800) * np.exp(-t / 0.03) * 0.3
    return norm(boom + click)


def fx_whoosh(dur=0.8, **_):
    n = int(dur * SR)
    t = np.arange(n) / n
    return norm(band(noise(dur), 300, 2500) * np.sin(np.pi * t) ** 3)


def fx_knock(n=3, gap=0.4, **_):
    out = np.zeros(int((n * gap + 0.4) * SR), np.float32)
    for k in range(n):
        m = int(0.25 * SR)
        e = env(m, 0.001, 0.03)
        hit = band(noise(0.25), 60, 1200) * e + np.sin(2 * np.pi * 150 * np.arange(m) / SR) * env(m, 0.001, 0.07) * 0.8
        place(out, hit * (0.85 + 0.15 * rng.random()), k * gap)
    return norm(out)


def fx_steps(n=6, gap=0.6, **_):
    out = np.zeros(int((n * gap + 0.4) * SR), np.float32)
    for k in range(n):
        m = int(0.18 * SR)
        step = band(noise(0.18), 120, 1600) * env(m, 0.004, 0.035)
        step += band(noise(0.18), 1500, 5000) * env(m, 0.01, 0.02) * 0.25
        place(out, step * (0.6 + 0.4 * rng.random()), k * gap + rng.random() * 0.05)
    return norm(out)


def fx_zap(dur=0.7, **_):
    n = int(dur * SR)
    t = np.arange(n) / SR
    buzz = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.3
    crackle = (rng.random(n) < 0.004).astype(np.float32) * rng.standard_normal(n)
    crackle = band(crackle.astype(np.float32), 800, 9000) * 6
    hiss = band(noise(dur), 3000, 12000) * 0.3
    e = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.15)
    return norm((buzz + crackle + hiss) * e)


def fx_rumble(dur=4.0, **_):
    n = int(dur * SR)
    low = band(np.cumsum(noise(dur)).astype(np.float32), 25, 160)
    t = np.arange(n) / SR
    clack = np.zeros(n, np.float32)
    for k in np.arange(0.4, dur, 0.55):
        place(clack, band(noise(0.1), 200, 2000) * env(int(0.1 * SR), 0.002, 0.02) * 0.15, k)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return norm((norm(low) + clack) * e)


def fx_beep(**_):
    t = np.arange(int(0.12 * SR)) / SR
    b = np.sin(2 * np.pi * 880 * t) * np.minimum(1, (0.12 - t) / 0.02)
    out = np.zeros(int(0.45 * SR), np.float32)
    place(out, b, 0)
    place(out, b, 0.22)
    return norm(out, 0.6)


def fx_click(**_):
    m = int(0.2 * SR)
    return norm(band(noise(0.2), 400, 6000) * env(m, 0.0005, 0.008) + np.sin(2 * np.pi * 90 * np.arange(m) / SR) * env(m, 0.001, 0.05) * 0.5)


def fx_drip(**_):
    t = np.arange(int(0.25 * SR)) / SR
    f = 1400 - 900 * np.minimum(1, t / 0.05)
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04), 0.6)


def fx_wind(dur=6.0, **_):
    t = np.arange(int(dur * SR)) / SR
    swell = 0.55 + 0.25 * np.sin(2 * np.pi * t / 3.1) + 0.2 * np.sin(2 * np.pi * t / 1.7 + 1)
    e = np.minimum(1, np.minimum(t / 1.5, (dur - t) / 1.0))
    return norm((band(noise(dur), 150, 1200) + band(noise(dur), 1200, 4000) * 0.25) * swell * e)


def fx_powerdown(dur=1.8, **_):
    """Свет гаснет: щелчок реле и гудение трансформатора, которое сползает вниз и затихает."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 100 * np.exp(-t / (dur * 0.4)) + 16
    hum = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.45 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    whine = np.sin(2 * np.pi * np.cumsum(1500 * np.exp(-t / (dur * 0.25)) + 90) / SR) * 0.12
    out = (hum + whine) * np.exp(-t / (dur * 0.33))
    m = int(0.2 * SR)
    place(out, band(noise(0.2), 400, 6000) * env(m, 0.0005, 0.01) * 1.5, 0)
    return norm(out.astype(np.float32))


def fx_static(dur=1.2, **_):
    """Шипение радио с плавающим свистом настройки."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    hiss = band(noise(dur), 700, 6000) * (0.6 + 0.4 * np.sin(2 * np.pi * t * 7))
    whistle = np.sin(2 * np.pi * np.cumsum(900 + 500 * np.sin(2 * np.pi * t * 0.8)) / SR) * 0.12
    e = np.minimum(1, np.minimum(t / 0.05, (dur - t) / 0.25))
    return norm((hiss + whistle) * e)


def fx_water(dur=3.0, **_):
    """Вода из крана."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    stream = band(noise(dur), 350, 3200) * (0.75 + 0.25 * np.sin(2 * np.pi * t * 3.3) * np.sin(2 * np.pi * t * 1.1))
    e = np.minimum(1, np.minimum(t / 0.12, (dur - t) / 0.4))
    return norm(stream * e)


def fx_fire(dur=2.5, **_):
    """Треск огня: низкий шум и щелчки."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    roar = band(np.cumsum(noise(dur)).astype(np.float32), 40, 400)
    pops = band(((rng.random(n) < 0.0015) * rng.standard_normal(n)).astype(np.float32), 900, 7000) * 8
    e = np.minimum(1, np.minimum(t / 0.4, (dur - t) / 0.5))
    return norm((norm(roar) + pops) * e)


FX = {'hit': fx_hit, 'whoosh': fx_whoosh, 'knock': fx_knock, 'steps': fx_steps, 'zap': fx_zap,
      'rumble': fx_rumble, 'beep': fx_beep, 'click': fx_click, 'drip': fx_drip, 'wind': fx_wind,
      'powerdown': fx_powerdown, 'static': fx_static, 'water': fx_water, 'fire': fx_fire}
DEFAULT_DB = {'hit': -8, 'whoosh': -16, 'knock': -6, 'steps': -10, 'zap': -14, 'rumble': -9, 'beep': -14,
              'click': -10, 'drip': -16, 'wind': -16, 'powerdown': -8, 'static': -18, 'water': -20, 'fire': -16}


def drone(sec):
    """Тёмный низкий фон: коричневый шум и пара медленно плавающих низких тонов."""
    n = int(sec * SR)
    t = np.arange(n) / SR
    low = norm(band(np.cumsum(noise(sec)).astype(np.float32), 30, 260))
    tone = np.sin(2 * np.pi * 55 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 11)) * 0.35
    tone += np.sin(2 * np.pi * 82.4 * t + 1) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 17 + 2)) * 0.2
    x = norm(low + tone)
    fade = np.minimum(1, np.minimum(t / 1.5, (sec - t) / 1.5))
    return (x * fade).astype(np.float32)


def mix(total, clips, effects, out_wav, ambient='drone', ambient_db=-27, music=None, music_db=-20):
    """clips: [(начало, путь к mp3)], effects: [{type, at, db, ...}] → WAV 48 кГц."""
    track = np.zeros(int(total * SR) + SR, np.float32)
    for at, path in clips:
        place(track, decode(path), at)
    if ambient == 'drone':
        track[:int(total * SR)] += drone(total) * 10 ** (ambient_db / 20)
    if music:
        m = decode(music)
        reps = int(np.ceil(len(track) / max(1, len(m))))
        track += np.tile(m, reps)[:len(track)] * 10 ** (music_db / 20)
    for e in effects:
        fn = FX.get(e['type'])
        if not fn:
            print(f'  ! неизвестный звук «{e["type"]}», пропускаю')
            continue
        place(track, fn(**e) * 10 ** (e.get('db', DEFAULT_DB[e['type']]) / 20), e['at'])
    track = track[:int(total * SR)]
    peak = np.max(np.abs(track)) or 1
    if peak > 0.98:
        track *= 0.98 / peak
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((track * 32767).astype(np.int16).tobytes())
