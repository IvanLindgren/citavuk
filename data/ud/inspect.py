# -*- coding: utf-8 -*-
import sys, glob, collections
sys.stdout.reconfigure(encoding="utf-8")

files = glob.glob(r"C:\Users\denis\OneDrive\Рабочий стол\srbski_read\data\ud\*.conllu")
triples = set()
by_cat = collections.defaultdict(collections.Counter)   # cat -> Counter(xpos)
example = {}                                             # xpos -> (form, lemma, upos, feats)

for fn in files:
    with open(fn, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 6:
                continue
            tid, form, lemma, upos, xpos, feats = cols[0], cols[1], cols[2], cols[3], cols[4], cols[5]
            if "-" in tid or "." in tid:
                continue
            if xpos == "_" or lemma == "_":
                continue
            triples.add((form.lower(), lemma.lower(), xpos))
            by_cat[xpos[0]][xpos] += 1
            example.setdefault(xpos, (form, lemma, upos, feats))

print("Total unique (form,lemma,xpos):", len(triples))
print("Total lemmas:", len(set(t[1] for t in triples)))
print()
for cat in ["N", "V", "A", "P"]:
    print(f"=== category {cat}: {len(by_cat[cat])} distinct tags ===")
    for xpos, cnt in by_cat[cat].most_common(18):
        f, l, u, ft = example[xpos]
        print(f"  {xpos:10} n={cnt:<5} ex: {f} <- {l} [{u}] {ft}")
    print()
