"""Воспроизводимо добавляет 25 A1 и 25 A2 адаптаций, сохраняя старый каталог.

Проверки длины и предложений являются редакционными ограничениями, а не
автоматическим сертификатом CEFR. Уровень дополнительно проверяется по лексике,
грамматике и смыслу каждой адаптации. Сеть нужна только для скачивания обложек.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import html
import io
import json
from pathlib import Path
import re
import time
import urllib.request

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'tools/data'
PUBLIC = ROOT / 'web/public/public-library'
WORD = re.compile(r'[A-Za-zČĆŽŠĐčćžšđ]+')
LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/'


def load_inputs():
    def read(name):
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    return (read('public_library_beginner.json'),
            read('public_library_beginner_sources.json'),
            read('public_library_beginner_covers.json'))


def metrics(body):
    sentences = [WORD.findall(p) for p in re.split(r'[.!?]+', body) if WORD.search(p)]
    return {'words': len(WORD.findall(body)), 'sentences': len(sentences),
            'longestSentence': max(map(len, sentences)),
            'averageSentence': round(sum(map(len, sentences)) / len(sentences), 2)}


def cover_for(item, covers):
    key = item['id'] if item['kind'] == 'Басня' else item['source']
    if key not in covers:
        raise ValueError('нет индивидуальной обложки: ' + item['id'])
    return covers[key]


def validate(registry, sources, covers):
    items = registry['items']
    if Counter(b['level'] for b in items) != {'A1': 25, 'A2': 25}:
        raise ValueError('нужно ровно 25 A1 и 25 A2')
    ids, bodies, selected_sources = set(), set(), set()
    report, used_covers = [], set()
    for item in items:
        ident = item['id']
        if not re.fullmatch(r'a[12]-[a-z0-9-]+', ident) or ident in ids:
            raise ValueError('неуникальный или небезопасный id: ' + ident)
        ids.add(ident)
        body = item['body']
        digest = hashlib.sha256(body.encode()).hexdigest()
        if digest in bodies:
            raise ValueError('повторный текст: ' + ident)
        bodies.add(digest)
        if re.search(r'[А-Яа-яЁё\uFFFD]|\{\{|\[\[|<[^>]+>|https?://', body):
            raise ValueError('посторонняя разметка или алфавит: ' + ident)
        if not all(item.get(k) for k in ('title', 'summary', 'kind', 'genre', 'source')):
            raise ValueError('неполная карточка: ' + ident)
        if 'Учебная адаптация' not in item['summary']:
            raise ValueError('адаптация должна быть обозначена явно: ' + ident)
        source = sources[item['source']]
        selected_sources.add(source['revisionUrl'])
        if source['host'] not in {'sr.wikipedia.org', 'sr.wikisource.org'} or not source['revision']:
            raise ValueError('непроверенный источник: ' + ident)
        if not source['rights'] or len(source['wikitextSha256']) != 64:
            raise ValueError('нет сведений о правах или содержимом: ' + ident)
        is_fable = item['kind'] == 'Басня'
        if is_fable != (source['host'] == 'sr.wikisource.org'):
            raise ValueError('неверный тип первоисточника: ' + ident)
        cover = cover_for(item, covers)
        if not cover['license'] or not cover['sourceUrl'].startswith('https://commons.wikimedia.org/'):
            raise ValueError('непроверенная обложка: ' + ident)
        if cover['sourceUrl'] in used_covers:
            raise ValueError('повторная обложка: ' + ident)
        used_covers.add(cover['sourceUrl'])
        if cover.get('fit', 'cover') not in {'cover', 'contain'}:
            raise ValueError('неизвестный способ кадрирования: ' + ident)
        crop = cover.get('crop', [0, 0, 1, 1])
        if (len(crop) != 4 or not all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in crop)
                or crop[0] >= crop[2] or crop[1] >= crop[3]):
            raise ValueError('неверная область кадрирования: ' + ident)
        stats = metrics(body)
        lower, upper, longest, average = (70, 125, 19, 10) if item['level'] == 'A1' else (100, 165, 27, 16)
        if not lower <= stats['words'] <= upper or stats['longestSentence'] > longest or stats['averageSentence'] > average:
            raise ValueError(f'{ident}: превышены ограничения {stats}')
        report.append({'id': ident, 'level': item['level'], **stats})
    if len(selected_sources) != 50:
        raise ValueError('источники разных карточек не должны дублироваться')
    return report


def make_cover(cover, path):
    if path.is_file():
        with Image.open(path) as image:
            if image.format == 'WEBP' and image.size == (720, 1040):
                image.verify()
                return
    request = urllib.request.Request(cover['url'], headers={'User-Agent': 'CitavukPublicLibrary/1.0 (https://citavuk.ru)'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read(16 * 1024 * 1024 + 1)
            if len(raw) > 16 * 1024 * 1024:
                raise ValueError('слишком большое изображение')
            with Image.open(io.BytesIO(raw)) as source:
                source = ImageOps.exif_transpose(source)
                if source.mode in {'RGBA', 'LA'}:
                    background = Image.new('RGBA', source.size, '#F3E9D2')
                    background.alpha_composite(source.convert('RGBA'))
                    source = background
                crop = cover.get('crop')
                if crop:
                    source = source.crop((round(source.width*crop[0]), round(source.height*crop[1]),
                                          round(source.width*crop[2]), round(source.height*crop[3])))
                if cover.get('fit') == 'contain':
                    # Сохраняем всю историческую иллюстрацию, без обрезанных персонажей.
                    preview = ImageOps.contain(source.convert('RGB'), (660, 940), Image.Resampling.LANCZOS)
                    image = Image.new('RGB', (720, 1040), '#f5eedb')
                    image.paste(preview, ((720-preview.width)//2, (1040-preview.height)//2))
                else:
                    image = ImageOps.fit(source.convert('RGB'), (720, 1040), Image.Resampling.LANCZOS)
                image.save(path, 'WEBP', quality=85, method=6)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 2)


def build_into_catalog(catalog, *, out=PUBLIC):
    registry, sources, covers = load_inputs()
    validate(registry, sources, covers)
    for folder in ('texts', 'covers', 'sources'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    generated = []
    for item in registry['items']:
        ident = item['id']
        source = sources[item['source']]
        fable = item['kind'] == 'Басня'
        cover = cover_for(item, covers)
        fingerprint = cover['url']
        if cover.get('crop') or cover.get('fit'):
            fingerprint += json.dumps({k: cover[k] for k in ('crop', 'fit') if k in cover}, sort_keys=True)
        cover_key = ident + '-' + hashlib.sha256(fingerprint.encode()).hexdigest()[:8]
        make_cover(cover, out / 'covers' / f'{cover_key}.webp')
        credit = ('Ezop. Prema srpskom prevodu Dositeja Obradovića, koji je umro 1811.'
                  if fable else 'Prema tekstu autora srpske Vikipedije.')
        attribution = credit + ' Prilagođeno za učenje u Čitavuku, 2026. CC BY-SA 4.0.'
        text = item['title'] + '\n\n' + item['body'] + '\n\n' + attribution + '\n' + source['revisionUrl'] + '\n' + LICENSE + '\n'
        (out / 'texts' / f'{ident}.txt').write_text(text, encoding='utf-8')
        proof = source | {'adaptation': True, 'adaptedBy': 'Читавук',
                          'adaptationLicense': 'CC BY-SA 4.0', 'adaptationLicenseUrl': LICENSE,
                          'level': item['level'], 'levelAssessment': 'Редакционная оценка, не сертификация CEFR',
                          'metrics': metrics(item['body']), 'textSha256': hashlib.sha256(text.encode()).hexdigest(),
                          'cover': cover | {'changes': (
                              'Масштабирование без обрезки персонажей, поля 720×1040 и WebP'
                              if cover.get('fit') == 'contain' else 'Кадрирование до 720×1040 и конвертация в WebP')}}
        (out / 'sources' / f'{ident}.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        generated.append({k: v for k, v in item.items() if k not in {'body', 'source'}} | {
            'author': 'Езоп, адаптация Читавука' if fable else 'Читавук по материалам сербской Википедии',
            'year': 'Учебная адаптация, 2026', 'adaptation': True,
            'attribution': attribution, 'license': 'Учебная адаптация — CC BY-SA 4.0; ' + source['rights'],
            'coverUrl': f'/public-library/covers/{cover_key}.webp',
            'coverSourceUrl': cover['sourceUrl'], 'coverLicense': cover['license'],
            'coverAuthor': html.unescape(cover['author']),
            'textUrl': f'/public-library/texts/{ident}.txt',
            'sourceUrls': [source['revisionUrl'], source['historyUrl'], LICENSE, f'/public-library/sources/{ident}.json'],
            'characters': len(text), 'wordCount': metrics(item['body'])['words'],
        })
    ids = {i['id'] for i in generated}
    return generated + [i for i in catalog if i['id'] not in ids]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Проверить редакционный пакет без записи и сети')
    parser.add_argument('--out', type=Path, default=PUBLIC)
    args = parser.parse_args()
    registry, sources, covers = load_inputs()
    report = validate(registry, sources, covers)
    print(json.dumps({'levels': dict(Counter(i['level'] for i in report)), 'words': sum(i['words'] for i in report),
                      'wordRange': [min(i['words'] for i in report), max(i['words'] for i in report)]}, ensure_ascii=False))
    if args.check:
        return
    catalog_file = args.out / 'catalog.json'
    current = json.loads(catalog_file.read_text(encoding='utf-8'))
    current['items'] = build_into_catalog(current['items'], out=args.out)
    current['generatedAt'] = registry['edition']
    staging = catalog_file.with_suffix('.json.new')
    staging.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    staging.replace(catalog_file)


if __name__ == '__main__':
    main()
