"""Package existing project artwork for editors; format conversion only."""
from pathlib import Path
import hashlib
import html
import json
import shutil
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "release" / "press-kit-2026-09-28"
manifest = []

def add(source, folder, filename=None, png=False):
    source = ROOT / source
    target = DEST / folder / (filename or source.name)
    target.parent.mkdir(parents=True, exist_ok=True)
    if png:
        with Image.open(source) as image:
            image.save(target, "PNG", optimize=True)
    else:
        shutil.copy2(source, target)
    entry = {"file": target.relative_to(DEST).as_posix(),
             "source": source.relative_to(ROOT).as_posix(),
             "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}
    if target.suffix.lower() in (".png", ".webp"):
        with Image.open(target) as image:
            image.verify()
        with Image.open(target) as image:
            entry.update(width=image.width, height=image.height,
                         alpha="A" in image.getbands())
    manifest.append(entry)

add("frontend/assets/imgs/citavuk_icon.png", "01-icons", "citavuk-icon.png")
add("web/public/favicon.png", "01-icons", "citavuk-favicon.png")
for name in ("zdravo", "cita", "gram", "povtor", "roadmap", "rule", "slavlje",
             "ukaz", "utesi", "vukotok", "zadumch", "zbunjen"):
    add(f"frontend/assets/imgs/citavuk_{name}.webp", "02-mascot",
        f"citavuk-{name}.png", png=True)
for name in ("engraved-frame.png", "ravanica-medallion.png", "glow.png", "glint.png", "flare.png", "CREDITS.md"):
    add("web/public/personal/decor/" + name, "03-decorations")
for name in ("learning", "surprise"):
    add(f"frontend/assets/animations/generated/citavuk_{name}.png", "04-sprites/sheets")
add("frontend/assets/animations/generated/manifest.json", "04-sprites/sheets", "animation-source-manifest.json")
add("frontend/assets/imgs/citavuk_sprites_gamevsperevodchik.png", "04-sprites/sheets")
for animation in ("learning_citavuk", "surprise_citavuk"):
    for index, source in enumerate(sorted((ROOT / "animations/source" / animation).glob("*.png")), 1):
        add(source.relative_to(ROOT), "04-sprites/frames/" + animation,
            f"frame-{index:02d}.png")
if (ROOT / "output/imagegen/citavuk-ursaschool-v1.png").exists():
    add("output/imagegen/citavuk-ursaschool-v1.png", "05-ursaschool")
    add("output/imagegen/ursaschool-logo-reference.png", "05-ursaschool")

(DEST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
cards = []
for entry in manifest:
    if entry["file"].startswith(("01-icons/", "02-mascot/", "03-decorations/", "05-ursaschool/")) and "width" in entry:
        path = html.escape(entry["file"])
        cards.append(f'<figure><a href="{path}"><img src="{path}" alt="{path}"></a><figcaption>{path}<br>{entry["width"]} × {entry["height"]}</figcaption></figure>')
(DEST / "preview.html").write_text('''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Читавук — пресс-кит</title><style>body{margin:32px;background:#faf3e7;color:#30261e;font:16px system-ui}h1{font:40px Georgia;color:#9e2b25}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}figure{margin:0;padding:16px;border:1px solid #ead3ae;border-radius:16px;background:#fffcf5}img{width:100%;height:220px;object-fit:contain}figcaption{font-size:13px;overflow-wrap:anywhere;margin-top:12px}a{color:#9e2b25}</style><h1>Читавук</h1><p>Материалы для публикаций. Нажми на изображение, чтобы открыть исходный PNG.</p><p><a href="README.md">Описание и правила</a></p><div class="grid">''' + "".join(cards) + "</div></html>", encoding="utf-8")
archive = DEST.with_suffix(".zip")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(DEST.rglob("*")):
        if path.is_file():
            bundle.write(path, path.relative_to(DEST.parent))
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
print(json.dumps({"assets": len(manifest), "mascot_poses": 12,
                  "zip": str(archive), "megabytes": round(archive.stat().st_size / 1024**2, 1)}, ensure_ascii=False))
