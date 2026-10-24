"""Ищет реальные свободные иллюстрации и готовит листы визуального отбора.

Никакой генерации изображений. Локальная обработка — только превью и контакты.
Итоговый выбор фиксируется отдельно после просмотра, не по номеру в поиске.
"""
import html
import hashlib
import io
import json
from pathlib import Path
import re
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageOps
from research_beginner_library import api, ROOT

OUT = ROOT / 'output/library-covers-20261024'
DATA = ROOT / 'tools/data'
AI = re.compile(r'AI.generated|generative|Midjourney|Stable.?Diffusion|DALL.?E|ComfyUI|artificial intelligence', re.I)


def plain(value):
    return html.unescape(re.sub('<[^>]+>', '', str(value)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    queries = json.loads((DATA / 'public_library_fable_cover_queries.json').read_text(encoding='utf-8'))
    target = OUT / 'candidates.json'
    results = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    for ident, query in queries.items():
        if ident in results and results[ident].get('query') == query:
            continue
        data = api('commons.wikimedia.org', action='query', generator='search', gsrsearch=query,
                   gsrnamespace=6, gsrlimit=6, prop='imageinfo|categories', cllimit=50,
                   iiprop='url|extmetadata|size', iiurlwidth=360)
        candidates = []
        for page in sorted(data.get('query', {}).get('pages', []), key=lambda p: p.get('index', 100)):
            info = (page.get('imageinfo') or [{}])[0]
            ext = info.get('extmetadata', {})
            license = plain(ext.get('LicenseShortName', {}).get('value', ''))
            if not re.fullmatch(r'Public domain|CC0|CC BY(?:-SA)? [234]\.[05](?: rs)?', license, re.I):
                continue
            if min(info.get('width', 0), info.get('height', 0)) < 280:
                continue
            if AI.search(json.dumps(page, ensure_ascii=False)):
                continue
            candidates.append({'file': page['title'].removeprefix('File:'),
                               'sourceUrl': info['descriptionurl'],
                               'previewUrl': info.get('thumburl', info['url']),
                               'license': license,
                               'author': plain(ext.get('Artist', {}).get('value', '')),
                               'date': plain(ext.get('DateTimeOriginal', {}).get('value', '')),
                               'description': plain(ext.get('ImageDescription', {}).get('value', ''))[:1600]})
        results[ident] = {'query': query, 'candidates': candidates, 'allowLegacyPreview': False}
        target.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(ident + ': ' + str(len(candidates)), flush=True)
        time.sleep(.3)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
    ids = list(queries)
    for start in range(0, len(ids), 5):
        sheet = Image.new('RGB', (1440, 5 * 310), '#f8f1df')
        draw = ImageDraw.Draw(sheet)
        for row, ident in enumerate(ids[start:start+5]):
            draw.text((10, row * 310 + 3), ident, fill='#26211c', font=font)
            for col, candidate in enumerate(results[ident]['candidates']):
                query_hash = hashlib.sha256(results[ident]['query'].encode()).hexdigest()[:6]
                filename = OUT / f'{ident}-{query_hash}-{col}.jpg'
                legacy = OUT / f'{ident}-{col}.jpg'
                if results[ident].get('allowLegacyPreview', True) and legacy.exists():
                    filename = legacy
                if not filename.exists():
                    try:
                        req = urllib.request.Request(candidate['previewUrl'], headers={'User-Agent': 'CitavukCoverResearch/1.0 (https://citavuk.ru)'})
                        with urllib.request.urlopen(req, timeout=30) as response:
                            raw = response.read(5 * 1024 * 1024)
                        with Image.open(io.BytesIO(raw)) as source:
                            source.convert('RGB').save(filename, quality=88)
                    except Exception as error:
                        print('preview failed: '+ident+' '+str(col)+' '+type(error).__name__, flush=True)
                        continue
                with Image.open(filename) as source:
                    preview = ImageOps.contain(source, (230, 228))
                    sheet.paste(preview, (col * 240 + (240-preview.width)//2, row * 310 + 25))
                draw.text((col * 240 + 5, row * 310 + 255), str(col)+' '+candidate['file'][:30], fill='#26211c', font=small)
                draw.text((col * 240 + 5, row * 310 + 274), candidate['license'], fill='#565046', font=small)
        sheet.save(OUT / f'candidates-{start//5+1}.jpg', quality=88)


if __name__ == '__main__':
    main()
