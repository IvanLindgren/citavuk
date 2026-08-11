"""Синтезирует звуки дуэли с переводчиком.

Как и остальные звуки Читавука (tools/sound_build, tools/make_page_turn.py),
они генерируются, а не берутся из чужих паков: лицензия понятна, громкость
предсказуема, результат воспроизводим, а весь набор весит меньше одного
скачанного «impact pack».

Частота 22 050 Гц вместо привычных 44 100: в наборе десяток файлов, и на
ударах, кликах и низком гуле верхняя половина спектра всё равно пустая. Это
ровно вдвое меньше байтов на экране, который и так грузит атлас спрайтов.

Клик клавиши — восемь файлов, по одному на ступень комбо. Тон растёт с
серией, и это единственный способ услышать разгон, не меняя высоту на лету:
HTMLAudioElement.playbackRate заикается на коротких звуках, а держать ради
восьми писков отдельный Web Audio-граф — лишний слой в обоих клиентах.

    python tools/build_duel_sounds.py
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

RATE = 22050
ROOT = Path(__file__).resolve().parent.parent
OUTPUTS = [
    ROOT / "frontend" / "assets" / "sounds" / "duel",
    ROOT / "web" / "public" / "sounds" / "duel",
]

RNG = np.random.default_rng(20260809)


def frames(seconds: float) -> np.ndarray:
    return np.arange(int(RATE * seconds)) / RATE


def tone(seconds: float, start: float, end: float | None = None,
         harmonics: tuple[float, ...] = (1.0,)) -> np.ndarray:
    """Тон с линейным скольжением частоты и заданными обертонами."""
    t = frames(seconds)
    freq = np.linspace(start, end if end is not None else start, t.size)
    # Фаза — интеграл частоты: без него скольжение звучит ступеньками.
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    out = np.zeros(t.size)
    for index, level in enumerate(harmonics, start=1):
        out += level * np.sin(phase * index)
    return out / max(sum(harmonics), 1e-9)


def noise(seconds: float) -> np.ndarray:
    return RNG.standard_normal(int(RATE * seconds))


def band(signal: np.ndarray, low: float, high: float) -> np.ndarray:
    # Найквист — жёсткий потолок: на 22 кГц полоса выше 11 025 не существует.
    high = min(high, RATE / 2 - 200)
    sos = butter(4, [low, high], btype="bandpass", fs=RATE, output="sos")
    return sosfilt(sos, signal)


def env(seconds: float, attack: float, decay: float, hold: float = 0.0) -> np.ndarray:
    """Огибающая: подъём, полка, экспоненциальный спад.

    Без подъёма любой звук начинается щелчком — обрыв на нуле слышен как
    отдельный удар по мембране.
    """
    t = frames(seconds)
    rise = np.clip(t / max(attack, 1e-5), 0, 1)
    fall = np.exp(-np.maximum(t - hold, 0) / max(decay, 1e-5))
    return rise * fall


def fit(*tracks: np.ndarray) -> list[np.ndarray]:
    """Приводит дорожки к общей длине — их считали разными огибающими."""
    size = max(track.size for track in tracks)
    return [np.pad(track, (0, size - track.size)) for track in tracks]


def mix(peak: float, *tracks: np.ndarray) -> np.ndarray:
    total = sum(fit(*tracks)) if len(tracks) > 1 else tracks[0]
    total = np.asarray(total, dtype=float)
    # Общий спад к нулю: обрыв последней выборки — тот же щелчок, что и в атаке.
    tail = min(int(RATE * 0.01), total.size)
    total[-tail:] *= np.linspace(1, 0, tail)
    top = np.max(np.abs(total))
    return total * (peak / top) if top > 0 else total


def key_click(step: int) -> np.ndarray:
    """Щелчок клавиши. Ступень комбо поднимает тон и осветляет стук."""
    ratio = 2 ** (step / 9)  # восемь ступеней — чуть меньше октавы
    seconds = 0.036
    body = tone(seconds, 640 * ratio, 430 * ratio) * env(seconds, 0.0008, 0.008)
    click = band(noise(seconds), 1800 * ratio, 6500) * env(seconds, 0.0003, 0.004)
    # Тихо намеренно: звук повторяется по нескольку раз в секунду и не должен
    # выходить на первый план.
    return mix(0.16 + 0.02 * step, body * 0.8, click * 0.6)


def hit() -> np.ndarray:
    """Попадание: низкий провал плюс треск."""
    low = tone(0.30, 190, 55, (1.0, 0.3)) * env(0.30, 0.001, 0.055)
    crack = band(noise(0.30), 900, 5200) * env(0.30, 0.0006, 0.028)
    thump = tone(0.30, 70, 42) * env(0.30, 0.004, 0.10)
    return mix(0.52, low, crack * 0.7, thump * 0.5)


def crit() -> np.ndarray:
    """Критический удар: тот же провал, но с металлическим звоном сверху."""
    low = tone(0.46, 240, 60, (1.0, 0.35)) * env(0.46, 0.001, 0.06)
    crack = band(noise(0.46), 1200, 7000) * env(0.46, 0.0004, 0.035)
    # Негармоничные обертоны — то, чем колокол отличается от струны.
    ring = sum(
        np.sin(2 * np.pi * freq * frames(0.46)) * level
        for freq, level in ((1180, 1.0), (1790, 0.6), (2630, 0.35), (3910, 0.2))
    ) * env(0.46, 0.002, 0.16)
    rise = tone(0.46, 400, 1500) * env(0.46, 0.05, 0.05, hold=0.08) * 0.4
    return mix(0.62, low, crack * 0.8, ring * 0.5, rise)


def guard() -> np.ndarray:
    """Переводчик держит удар: сухой машинный лязг."""
    buzz = np.sign(tone(0.28, 130, 96)) * env(0.28, 0.002, 0.05)
    metal = band(noise(0.28), 2200, 6000) * env(0.28, 0.001, 0.02)
    # Прерывистость — то, что отличает машину от живого голоса.
    gate = (np.sin(2 * np.pi * 46 * frames(0.28)) > -0.2).astype(float)
    return mix(0.36, buzz * gate * 0.7, metal * 0.5)


def charge() -> np.ndarray:
    """Переводчик копит удар: нарастающий гул."""
    seconds = 0.62
    saw = tone(seconds, 88, 250, (1.0, 0.5, 0.3, 0.2))
    swell = np.clip(frames(seconds) / seconds, 0, 1) ** 1.6
    wobble = 0.75 + 0.25 * np.sin(2 * np.pi * 11 * frames(seconds))
    tail = env(seconds, 0.01, 0.05, hold=seconds - 0.06)
    return mix(0.32, saw * swell * wobble * tail)


def alarm() -> np.ndarray:
    """Время на исходе: два коротких высоких сигнала."""
    beep = tone(0.07, 1320, 1320, (1.0, 0.25)) * env(0.07, 0.003, 0.02)
    gap = np.zeros(int(RATE * 0.055))
    return mix(0.30, np.concatenate([beep, gap, beep]))


def start() -> np.ndarray:
    """Гонг перед боем."""
    seconds = 0.70
    boom = tone(seconds, 150, 48, (1.0, 0.4, 0.2)) * env(seconds, 0.002, 0.16)
    gong = sum(
        np.sin(2 * np.pi * freq * frames(seconds)) * level
        for freq, level in ((196, 1.0), (293, 0.5), (467, 0.3), (740, 0.18))
    ) * env(seconds, 0.004, 0.22)
    swell = band(noise(seconds), 300, 4000) * env(seconds, 0.02, 0.09)
    return mix(0.70, boom, gong * 0.6, swell * 0.35)


def combo() -> np.ndarray:
    """Серия набрала ступень: короткая восходящая двойка."""
    first = tone(0.08, 880, 880, (1.0, 0.3)) * env(0.08, 0.002, 0.025)
    second = tone(0.11, 1318, 1318, (1.0, 0.3)) * env(0.11, 0.002, 0.035)
    return mix(0.28, np.concatenate([first, second]))


def victory() -> np.ndarray:
    """Фанфара. Ноты те же, что в lesson_complete, — победа должна звучать
    как продолжение курса, а не как чужая игра."""
    notes = ((523.25, 0.11), (659.25, 0.11), (783.99, 0.11), (1046.5, 0.46))
    line = np.concatenate([
        tone(length, freq, freq, (1.0, 0.5, 0.25, 0.12))
        * env(length, 0.006, 0.18 if length > 0.2 else 0.08)
        for freq, length in notes
    ])
    shine = band(noise(line.size / RATE), 3000, 9000) * env(line.size / RATE, 0.01, 0.25)
    return mix(0.46, line, shine * 0.18)


def defeat() -> np.ndarray:
    """Переводчик дожал: нисходящая пара с просадкой строя."""
    seconds = 0.72
    fall = tone(seconds, 330, 98, (1.0, 0.45, 0.2)) * env(seconds, 0.01, 0.22)
    # Медленная расстройка — звук «уезжает», как у выключаемой машины.
    drift = tone(seconds, 327, 92, (1.0, 0.4)) * env(seconds, 0.02, 0.20)
    return mix(0.36, fall, drift * 0.6)


def write(samples: np.ndarray, name: str) -> int:
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    size = 0
    for directory in OUTPUTS:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / name
        with wave.open(str(path), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(RATE)
            out.writeframes(pcm.tobytes())
        size = path.stat().st_size
    return size


def main() -> int:
    pack: list[tuple[str, np.ndarray, str]] = [
        *((f"key_{step}.wav", key_click(step), f"клик клавиши, ступень {step}")
          for step in range(8)),
        ("hit.wav", hit(), "попадание"),
        ("crit.wav", crit(), "критический удар"),
        ("guard.wav", guard(), "переводчик держит удар"),
        ("charge.wav", charge(), "переводчик копит удар"),
        ("alarm.wav", alarm(), "время на исходе"),
        ("start.wav", start(), "гонг перед боем"),
        ("combo.wav", combo(), "ступень серии"),
        ("victory.wav", victory(), "победа"),
        ("defeat.wav", defeat(), "поражение"),
    ]

    total = 0
    for name, samples, comment in pack:
        size = write(samples, name)
        total += size
        print(f"{name:14s} {samples.size / RATE * 1000:6.0f} мс {size / 1024:6.1f} КБ  {comment}")
    print(f"\nвесь набор {total / 1024:.0f} КБ в каждом из каталогов:")
    for directory in OUTPUTS:
        print(f"  {directory.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
