"""Звуки печатной машинки для игры «Уничтожь эти падежи».

Источник — записи BigSoundBank (Joseph Sardin), лицензия CC0 1.0:

- 2841 «Typewriter #8» — живой набор на машинке: из него нарезаются удары;
- 2842 «Typewriter, Key» — одиночная клавиша Hermes Precisa 305;
- 2843 «Typewriter, space» — пробел;
- 2844 «Typewriter, Bell #1» — звонок каретки.

Удары выбираются по паузам между ними (ffmpeg silencedetect), громкость
выравнивается по пику. Несколько разных ударов нужны, чтобы быстрый набор не
звучал одним и тем же щелчком.

    python tools/build_typewriter_sounds.py

Нужен ffmpeg в PATH. Исходники кешируются в output/sounds/.
"""

import os
import re
import subprocess
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "output", "sounds")
TARGETS = [
    os.path.join(ROOT, "web", "public", "sounds", "typewriter"),
    os.path.join(ROOT, "frontend", "assets", "sounds", "typewriter"),
]
SOURCE_URL = "https://bigsoundbank.com/UPLOAD/mp3/{id}.mp3"
KEY_STRIKES = 6
PEAK_DB = -3.0


def source(sound_id: int) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{sound_id}.mp3")
    if not os.path.exists(path):
        urllib.request.urlretrieve(SOURCE_URL.format(id=sound_id), path)
    return path


def run(*args: str) -> str:
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *args],
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:])
    return result.stderr


def strike_onsets(path: str) -> list[tuple[float, float]]:
    """Начала ударов и длина тишины после каждого."""
    log = run("-i", path, "-af", "silencedetect=noise=-38dB:d=0.06", "-f", "null", "-")
    starts = [float(v) for v in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(v) for v in re.findall(r"silence_end: ([\d.]+)", log)]
    onsets = []
    for end in ends:
        following = [s for s in starts if s > end]
        if following:
            onsets.append((end, following[0] - end))
    return onsets


def peak_gain(path: str, start: float, duration: float) -> float:
    log = run("-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", path,
              "-af", "volumedetect", "-f", "null", "-")
    match = re.search(r"max_volume: (-?[\d.]+) dB", log)
    return PEAK_DB - float(match.group(1)) if match else 0.0


def cut(path: str, start: float, duration: float, name: str, fade: float = 0.04, trim: bool = True) -> None:
    gain = peak_gain(path, start, duration)
    # Тишина до удара срезается: даже 30 мс между нажатием и щелчком ощущаются
    # как вялая клавиша.
    lead = "silenceremove=start_periods=1:start_threshold=-34dB:start_silence=0.002," if trim else ""
    for target in TARGETS:
        os.makedirs(target, exist_ok=True)
        run("-y", "-ss", f"{max(start, 0):.3f}", "-t", f"{duration:.3f}", "-i", path,
            "-af", f"{lead}volume={gain:.2f}dB,areverse,afade=t=in:d={fade:.3f},areverse",
            "-ac", "1", "-ar", "44100", "-b:a", "96k", os.path.join(target, name))


def main() -> None:
    session = source(2841)
    # Отдельные удары: паузу после удара берём достаточную, чтобы в нарезку не
    # попал следующий. Самые громкие звучат увереннее — они и идут в игру.
    candidates = [(start, gap) for start, gap in strike_onsets(session) if 0.12 <= gap <= 0.6]
    scored = sorted(candidates, key=lambda item: peak_gain(session, item[0], 0.12))[:KEY_STRIKES]
    for index, (start, gap) in enumerate(sorted(scored), start=1):
        cut(session, start - 0.004, min(gap + 0.02, 0.18), f"key-{index}.mp3")

    key = source(2842)
    key_start, _ = strike_onsets(key)[0] if strike_onsets(key) else (0.0, 0.3)
    cut(key, key_start - 0.004, 0.3, f"key-{KEY_STRIKES + 1}.mp3")

    space = source(2843)
    space_start, _ = strike_onsets(space)[0] if strike_onsets(space) else (0.0, 0.4)
    cut(space, space_start - 0.004, 0.35, "space.mp3")

    cut(source(2844), 0.0, 1.6, "bell.mp3", fade=0.5, trim=False)
    print("звуки готовы:", ", ".join(sorted(os.listdir(TARGETS[0]))))


if __name__ == "__main__":
    main()
