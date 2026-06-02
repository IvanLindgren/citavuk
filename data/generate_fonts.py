# -*- coding: utf-8 -*-
"""Делает статические Regular/Bold из вариативных TTF (надёжнее в Flutter)."""
import sys, os
sys.stdout.reconfigure(encoding="utf-8")
from fontTools import ttLib
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = r"C:\Citavuk\frontend\assets\fonts"

JOBS = [
    ("NotoSerif-Variable.ttf", "NotoSerif", [("Regular", 400), ("Bold", 700)]),
    ("NotoSans-Variable.ttf",  "NotoSans",  [("Regular", 400), ("Bold", 700)]),
    ("Lora-Variable.ttf",      "Lora",      [("Regular", 400), ("Bold", 700)]),
]

for src_name, family, weights in JOBS:
    src = os.path.join(FONTS, src_name)
    if not os.path.exists(src):
        print("skip (missing):", src_name)
        continue
    for label, wght in weights:
        f = ttLib.TTFont(src)
        axes = {a.axisTag: (wght if a.axisTag == "wght" else a.defaultValue)
                for a in f["fvar"].axes}
        instantiateVariableFont(f, axes, inplace=True)
        out = os.path.join(FONTS, f"{family}-{label}.ttf")
        f.save(out)
        print(f"  built {family}-{label}.ttf  ({os.path.getsize(out)//1024} KB)  axes={axes}")

# Удаляем вариативные исходники, чтобы не путались
for src_name, *_ in JOBS:
    p = os.path.join(FONTS, src_name)
    if os.path.exists(p):
        os.remove(p)
        print("removed", src_name)

print("done.")
