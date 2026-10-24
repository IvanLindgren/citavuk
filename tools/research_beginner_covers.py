"""Сохраняет проверенные Commons-метаданные обложек без генерации изображений."""
import json
from pathlib import Path
import re
import time

from research_beginner_library import api, OUT, ROOT


def metadata(file):
    page = api('commons.wikimedia.org', action='query', prop='imageinfo',
               iiprop='url|extmetadata', iiurlwidth=720, titles='File:' + file)['query']['pages'][0]
    if not page.get('imageinfo'):
        raise ValueError('missing cover: ' + file)
    image = page['imageinfo'][0]
    ext = image['extmetadata']
    license = ext.get('LicenseShortName', {}).get('value', '')
    if not re.fullmatch(r'Public domain|CC0|CC BY(?:-SA)? [234]\.[05](?: rs)?', license, re.I):
        raise ValueError('unsupported image license: ' + file + ' ' + license)
    return {'file': file, 'url': image.get('thumburl', image['url']),
            'sourceUrl': image['descriptionurl'], 'license': license,
            'licenseUrl': ext.get('LicenseUrl', {}).get('value', ''),
            'author': re.sub('<[^>]+>', '', ext.get('Artist', {}).get('value', 'Wikimedia Commons'))}


def main():
    output = OUT / 'covers.json'
    canonical = ROOT / 'tools/data/public_library_beginner_covers.json'
    covers = json.loads(canonical.read_text(encoding='utf-8')) if canonical.exists() else {}
    items = json.loads((ROOT / 'tools/data/public_library_beginner.json').read_text(encoding='utf-8'))['items']
    for item in items:
        if item['kind'] == 'Басня' or item['source'] in covers:
            continue
        page = api('sr.wikipedia.org', action='query', redirects=1, prop='pageimages', piprop='name', titles=item['source'])['query']['pages'][0]
        file = page.get('pageimage')
        if not file:
            print('NO IMAGE ' + item['source'], flush=True)
            continue
        covers[item['source']] = metadata(file)
        output.write_text(json.dumps(covers, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(item['source'] + ': ' + file, flush=True)
        time.sleep(.3)
    selected = json.loads((ROOT / 'tools/data/public_library_fable_cover_selection.json').read_text(encoding='utf-8'))
    fables = {item['id'] for item in items if item['kind'] == 'Басня'}
    if set(selected) != fables or len({v['file'] for v in selected.values()}) != len(fables):
        raise ValueError('нужны 30 разных, вручную выбранных иллюстраций')
    for ident, selection in selected.items():
        if ident in covers and all(covers[ident].get(k) == v for k, v in selection.items()):
            continue
        covers[ident] = metadata(selection['file']) | selection | {
            'checkedAt': '2026-10-24', 'selection': 'Просмотрено вручную, изображение из Commons, без генерации',
        }
        canonical.write_text(json.dumps(covers, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(ident + ': ' + covers[ident]['file'], flush=True)
        time.sleep(.3)
    covers.pop('fables', None)
    if covers['Шарганска осмица']['file'].endswith('.svg'):
        # Для обложки поезд, а не схема пути с мелкими подписями.
        result = api('commons.wikimedia.org', action='query', generator='search',
                     gsrsearch='"Sargan" "train" filetype:bitmap', gsrnamespace=6, gsrlimit=3,
                     prop='imageinfo', iiprop='url|extmetadata')['query']['pages']
        for page in result:
            try:
                covers['Шарганска осмица'] = metadata(page['title'].removeprefix('File:'))
                break
            except ValueError:
                continue
    output.write_text(json.dumps(covers, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'tools/data/public_library_beginner_covers.json').write_text(json.dumps(covers, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
