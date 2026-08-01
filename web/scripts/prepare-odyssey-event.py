#!/usr/bin/env python3
"""Build the bundled Odyssey event text from a public-domain scan.

Source: Homer's Odyssey, translated by Tomo Maretic, 3rd edition (1915).
Internet Archive marks the scan with Public Domain Mark 1.0:
https://archive.org/details/homerova_odiseja_1915-t.maretic
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path


SOURCE_URL = (
    "https://archive.org/download/homerova_odiseja_1915-t.maretic/"
    "homerova_odiseja_1915-t.maretic_djvu.txt"
)
EVENTS_DIR = Path(__file__).resolve().parents[1] / "src" / "events"
MANIFEST_OUTPUT = EVENTS_DIR / "odyssey-manifest.json"
CHAPTERS_DIR = EVENTS_DIR / "odyssey-chapters"
# Приложение читает те же песни из своих ассетов. Один источник на две
# реализации: разошедшийся текст означал бы разный прогресс на сайте и в
# приложении при общем документе event-odyssey-2026.
FLUTTER_DIR = (
    Path(__file__).resolve().parents[2] / "frontend" / "assets" / "events" / "odyssey"
)

HEADINGS = [
    "PRVO", "DRUGO", "TRECE", "CETVRTO", "PETO", "SESTO", "SEDMO", "OSMO",
    "DEVETO", "DESETO", "JEDANAESTO", "DVANAESTO", "TRINAESTO", "CETRNAESTO",
    "PETNAESTO", "SESNAESTO", "SEDAMNAESTO", "OSAMNAESTO", "DEVETNAESTO",
    "DVADESETO", "DVADESET PRVO", "DVADESET DRUGO", "DVADESET TRECE",
    "DVADESET CETVRTO",
]

CYRILLIC = str.maketrans({
    "a": "\u0430", "b": "\u0431", "c": "\u0446", "d": "\u0434", "e": "\u0435",
    "f": "\u0444", "g": "\u0433", "h": "\u0445", "i": "\u0438", "j": "\u0458",
    "k": "\u043a", "l": "\u043b", "m": "\u043c", "n": "\u043d", "o": "\u043e",
    "p": "\u043f", "r": "\u0440", "s": "\u0441", "t": "\u0442", "u": "\u0443",
    "v": "\u0432", "z": "\u0437", "\u010d": "\u0447", "\u0107": "\u045b",
    "\u0161": "\u0448", "\u017e": "\u0436", "\u0111": "\u0452",
    "A": "\u0410", "B": "\u0411", "C": "\u0426", "D": "\u0414", "E": "\u0415",
    "F": "\u0424", "G": "\u0413", "H": "\u0425", "I": "\u0418", "J": "\u0408",
    "K": "\u041a", "L": "\u041b", "M": "\u041c", "N": "\u041d", "O": "\u041e",
    "P": "\u041f", "R": "\u0420", "S": "\u0421", "T": "\u0422", "U": "\u0423",
    "V": "\u0412", "Z": "\u0417", "\u010c": "\u0427", "\u0106": "\u040b",
    "\u0160": "\u0428", "\u017d": "\u0416", "\u0110": "\u0402",
})


def latin_to_cyrillic(value: str) -> str:
    # Digraphs must be handled before single letters. Serbian title case uses
    # one uppercase Cyrillic character: Njego -> Njego, not NЈego.
    replacements = ("D\u017d", "LJ", "NJ", "D\u017e", "Lj", "Nj", "d\u017e", "lj", "nj")
    # Keep placeholders outside the Latin alphabet while translating.
    placeholders = {
        "D\u017d": "\ue000", "LJ": "\ue001", "NJ": "\ue002",
        "D\u017e": "\ue003", "Lj": "\ue004", "Nj": "\ue005",
        "d\u017e": "\ue006", "lj": "\ue007", "nj": "\ue008",
    }
    for source in replacements:
        value = value.replace(source, placeholders[source])
    value = value.translate(CYRILLIC)
    for source, placeholder in placeholders.items():
        mapped = {
            "D\u017d": "\u040f", "LJ": "\u0409", "NJ": "\u040a",
            "D\u017e": "\u040f", "Lj": "\u0409", "Nj": "\u040a",
            "d\u017e": "\u045f", "lj": "\u0459", "nj": "\u045a",
        }[source]
        value = value.replace(placeholder, mapped)
    return value


def normalized_heading(value: str) -> str:
    value = value.replace("\u0110", "D").replace("\u0111", "d")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = value.upper()
    return re.sub(r"[^A-Z ]", "", value).strip()


def clean_lines(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    pending = ""
    for raw in lines:
        line = raw.replace("\u00ad", "").strip()
        if not line:
            continue
        if re.fullmatch(r"[\dIVXLCDM.]+", line, re.I):
            continue
        if re.match(r"^Homerova Odiseja[.*]?(?:\s+\d+)?$", line, re.I):
            continue
        if "PJEVANJE" in normalized_heading(line):
            continue

        line = re.sub(r"^\d{1,3}\s+(?=\D)", "", line)
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue

        if pending:
            line = pending + line
            pending = ""
        if line.endswith("¬"):
            pending = line[:-1]
            continue
        cleaned.append(line)

    if pending:
        cleaned.append(pending)
    return cleaned


def build_chapters(text: str) -> list[dict[str, object]]:
    lines = text.replace("\r", "").split("\n")
    starts: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped != stripped.upper() or any(char.isdigit() for char in stripped):
            continue
        normalized = normalized_heading(line)
        if normalized.endswith(" PJEVANJE"):
            ordinal = normalized.removesuffix(" PJEVANJE")
            if ordinal in HEADINGS:
                starts.append((index, ordinal))
    if len(starts) != 24:
        raise RuntimeError(f"Expected 24 songs, found {len(starts)}")

    chapters: list[dict[str, object]] = []
    for chapter_index, (start, _) in enumerate(starts):
        end = starts[chapter_index + 1][0] if chapter_index + 1 < len(starts) else next(
            (i for i in range(start + 1, len(lines)) if "TUMACENJE RIJECI" in normalized_heading(lines[i])),
            len(lines),
        )
        chapter_lines = clean_lines(lines[start + 1 : end])
        subtitle = chapter_lines.pop(0).rstrip(".") if chapter_lines else ""
        paragraphs = [
            "\n".join(chapter_lines[i : i + 8])
            for i in range(0, len(chapter_lines), 8)
        ]
        chapters.append(
            {
                "number": chapter_index + 1,
                "title": f"{chapter_index + 1}. песма",
                "subtitle": latin_to_cyrillic(subtitle.title()),
                "paragraphs": [latin_to_cyrillic(value) for value in paragraphs],
            }
        )
    return chapters


def main() -> None:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Citavuk/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8")
    chapters = build_chapters(text)
    payload = {
        "source": "Homerova Odiseja, prevod Tomo Maretic, 1915",
        "sourceUrl": "https://archive.org/details/homerova_odiseja_1915-t.maretic",
        "license": "Public Domain Mark 1.0",
        "chapters": [
            {key: value for key, value in chapter.items() if key != "paragraphs"}
            for chapter in chapters
        ],
    }
    CHAPTERS_DIR.mkdir(parents=True, exist_ok=True)
    FLUTTER_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    MANIFEST_OUTPUT.write_text(manifest, encoding="utf-8")
    (FLUTTER_DIR / "manifest.json").write_text(manifest, encoding="utf-8")
    for chapter in chapters:
        name = f"chapter-{chapter['number']:02d}.json"
        body = json.dumps(chapter, ensure_ascii=False, separators=(",", ":"))
        (CHAPTERS_DIR / name).write_text(body, encoding="utf-8")
        (FLUTTER_DIR / name).write_text(body, encoding="utf-8")
    print(f"Wrote {len(chapters)} songs to {CHAPTERS_DIR} and {FLUTTER_DIR}")


if __name__ == "__main__":
    main()
