"""Генерирует звук перелистывания страницы: assets/sounds/page_turn.wav.

Синтез вместо записи — чтобы файл был свободен от чужих прав и весил килобайты.
Шелест собирается из гранул: бумага звучит не свистом фильтра, а сотней
микрощелчков волокон, поэтому берётся шум, порезанный на короткие зёрна со
случайными задержками, и уже он фильтруется и укладывается в две фазы —
отрыв страницы и её укладка.

    python tools/make_page_turn.py
"""

import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SAMPLE_RATE = 44100
DURATION = 0.42
PEAK = 0.14  # тихо: звук фоновый, а не событие

OUTPUTS = [
    Path("frontend/assets/sounds/page_turn.wav"),
    Path("web/public/sounds/page_turn.wav"),
]


def grains(rng: np.random.Generator, count: int, spread: float,
           center: float, width: float) -> np.ndarray:
    """Дорожка из `count` зёрен шума, разбросанных вокруг `center`."""
    n = int(SAMPLE_RATE * DURATION)
    track = np.zeros(n)
    for _ in range(count):
        start = int(SAMPLE_RATE * (center + rng.normal(0, spread)))
        length = int(SAMPLE_RATE * rng.uniform(width * 0.4, width))
        if start < 0 or length < 8 or start + length >= n:
            continue
        grain = rng.standard_normal(length)
        # Окно Хэнна: зерно без плавных краёв даёт щелчок вместо шороха.
        grain *= np.hanning(length)
        track[start:start + length] += grain * rng.uniform(0.3, 1.0)
    return track


def band(signal: np.ndarray, low: float, high: float) -> np.ndarray:
    sos = butter(4, [low, high], btype="bandpass", fs=SAMPLE_RATE, output="sos")
    return sosfilt(sos, signal)


def envelope(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.linspace(0, DURATION, n)
    rise = 1 - np.exp(-t / attack)
    fall = np.exp(-t / decay)
    return rise * fall


def build() -> np.ndarray:
    rng = np.random.default_rng(20260728)
    n = int(SAMPLE_RATE * DURATION)

    # Отрыв: ярче и выше, страница отходит от стопки.
    lift = grains(rng, 220, spread=0.035, center=0.055, width=0.012)
    lift = band(lift, 800, 4200) * envelope(n, 0.006, 0.075)

    # Взмах: основное тело шелеста, ниже и дольше.
    swing = grains(rng, 320, spread=0.06, center=0.14, width=0.02)
    swing = band(swing, 420, 2600) * envelope(n, 0.02, 0.13)

    # Укладка: глухой мягкий хвост.
    settle = grains(rng, 140, spread=0.05, center=0.26, width=0.03)
    settle = band(settle, 260, 1600) * envelope(n, 0.03, 0.09)

    mix = lift * 0.9 + swing * 1.0 + settle * 0.55

    # Общий спад к нулю, иначе на конце останется ступенька.
    mix *= np.minimum(1, np.linspace(1, 0, n) * 6)
    mix /= np.max(np.abs(mix))
    return mix * PEAK


def write(samples: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(samples, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(pcm.tobytes())
    print(f"{path} — {path.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    audio = build()
    for target in OUTPUTS:
        write(audio, target)
