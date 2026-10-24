"""Read-only сбор источников для учебных адаптаций публичной библиотеки."""
import json
import hashlib
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'beginner-library-20261024'

FABLES = [
    'Лав и миш', 'Лисица и грожђе', 'Лисица и вран (прва басна)', 'Пас и његова сен',
    'Лав и медвед', 'Комарац и во', 'Петао и дpaги камен', 'Два пса',
    'Магарац у лавовој кожи', 'Мачак и мишеви', 'Чврчак и мрави',
    'Лавица и лисица', 'Лисица и дрвена глава', 'Брат и сестра', 'Два миша',
    'Лисица и лав', 'Лисица и јарац', 'Коњ и коњушар', 'Магарац идола носећи',
    'Лав и зец', 'Папагал и мачка', 'Путници и топола', 'Зецови и лисице',
    'Рибари', 'Лисица и крокодил', 'Храст и трске', 'Мишеви и прапорци',
    'Медвед и пчеле', 'Лисица и древосечац', 'Стар пас и ловац',
]
ARTICLES = [
    'Београд', 'Нови Сад', 'Ниш', 'Суботица', 'Дунав',
    'Тара (планина)', 'Палићко језеро', 'Ђавоља варош', 'Шарганска осмица',
    'Ајвар', 'Сарма', 'Гибаница', 'Слава', 'Коло (игра)', 'Вук Стефановић Караџић',
    'Никола Тесла', 'Иво Андрић', 'Пиротски ћилим', 'Малина', 'Панчићева оморика',
]


def api(host, **params):
    url = f'https://{host}/w/api.php?' + urllib.parse.urlencode({
        'format': 'json', 'formatversion': 2, **params,
    })
    request = urllib.request.Request(url, headers={'User-Agent': 'CitavukLibraryResearch/1.0 (https://citavuk.ru)'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                result = json.load(response)
            if 'error' in result:
                raise ValueError(result['error'].get('code'))
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    collection = api('sr.wikisource.org', action='query', prop='revisions',
                     rvprop='content', rvslots='main', titles='Езопове басне')['query']['pages'][0]
    raw = collection['revisions'][0]['slots']['main']['content']
    links = re.findall(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', raw)
    normalized = lambda s: s.lower().replace('дpaги', 'драги')
    mapped = {normalized(label or title.split('/')[-1]): title for title, label in links}
    sources = json.loads((OUT / 'sources.json').read_text(encoding='utf-8')) if (OUT / 'sources.json').exists() else []
    for host, titles in [('sr.wikisource.org', FABLES), ('sr.wikipedia.org', ARTICLES)]:
        for title in titles:
            if any(s['requested'] == title and s['host'] == host for s in sources):
                continue
            resolved = mapped.get(normalized(title), title) if host == 'sr.wikisource.org' else title
            page = api(host, action='query', redirects=1, prop='revisions|extracts|info',
                       rvprop='ids|timestamp|content', rvslots='main', inprop='url',
                       explaintext=1, titles=resolved)['query']['pages'][0]
            if page.get('missing'):
                raise ValueError('missing: ' + resolved)
            rev = page['revisions'][0]
            source = {'requested': title, 'title': page['title'], 'host': host,
                      'revision': rev['revid'], 'url': page['fullurl'],
                      'revisionUrl': f'https://{host}/w/index.php?oldid={rev["revid"]}',
                      'historyUrl': page['fullurl'] + '?action=history',
                      'extract': page.get('extract', ''), 'wikitext': rev['slots']['main']['content']}
            sources.append(source)
            (OUT / 'sources.json').write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(title + ': ' + str(rev['revid']), flush=True)
            time.sleep(.3)
    selected = set(FABLES + ARTICLES)
    evidence = {s['requested']: {k: v for k, v in s.items() if k not in {'wikitext', 'extract'}} | {
        'wikitextSha256': hashlib.sha256(s['wikitext'].encode('utf-8')).hexdigest(),
        'checkedAt': '2026-10-24',
        'rights': 'Езоп и перевод Доситея Обрадовича (умер в 1811), общественное достояние' if s['host'] == 'sr.wikisource.org' else 'Авторы сербской Википедии, CC BY-SA 4.0',
        'licenseUrl': 'https://creativecommons.org/licenses/by-sa/4.0/',
    } for s in sources if s['requested'] in selected}
    if len(evidence) != 50:
        raise ValueError('expected 50 unique sources')
    (ROOT / 'tools/data/public_library_beginner_sources.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
