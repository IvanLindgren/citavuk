import type { PlaceKind } from './types';

/**
 * Опознание типа объекта по тегам OSM.
 *
 * Правило — это «tourism=hotel» или «shop=pastry;cuisine=bakery»: условия через
 * `;` обязаны совпасть все. Значение `*` означает «тег есть, значение любое».
 */

interface Condition {
  key: string;
  value: string;
}

export type Tags = Record<string, string>;

function conditions(rule: string): Condition[] {
  return rule.split(';').map((part) => {
    const [key = '', value = ''] = part.split('=');
    return { key: key.trim(), value: value.trim() };
  });
}

function fits(tags: Tags, rule: Condition[]): boolean {
  return rule.every(({ key, value }) => {
    const actual = tags[key];
    if (actual === undefined) return false;
    return value === '*' || actual === value;
  });
}

/**
 * Тип объекта или `null`, если такого Читавук пока не знает.
 *
 * Побеждает правило с большим числом условий: у моста через проспект есть и
 * `bridge=yes`, и `highway=primary`, и назвать его улицей — значит показать
 * слова не о том. При равенстве выигрывает тип, который стоит в справочнике
 * выше: там заведения идут раньше дорожных объектов.
 */
export function matchKind(tags: Tags, kinds: PlaceKind[]): string | null {
  let best: string | null = null;
  let bestWeight = 0;

  for (const kind of kinds) {
    for (const rule of kind.osm) {
      const parsed = conditions(rule);
      if (!fits(tags, parsed)) continue;
      if (parsed.length > bestWeight) {
        best = kind.id;
        bestWeight = parsed.length;
      }
    }
  }

  return best;
}

/**
 * Тип места по подклассу векторного тайла.
 *
 * В тайлах OpenMapTiles у каждого места есть `class` (кучное «кафе», «магазин»)
 * и `subclass` — почти всегда сам тег OSM: `bakery`, `pharmacy`, `bus_stop`.
 * Точное совпадение по `subclass` сильнее правила `class/*`: класс `pitch`
 * целиком — спортивная площадка, но `library/books` — книжный, а не
 * библиотека.
 */
export function matchOmt(
  cls: string,
  subclass: string,
  kinds: PlaceKind[],
): string | null {
  let byClass: string | null = null;

  for (const kind of kinds) {
    for (const rule of kind.omt) {
      if (rule.endsWith('/*')) {
        if (cls && rule.slice(0, -2) === cls) byClass ??= kind.id;
        continue;
      }
      if (subclass && rule === subclass) return kind.id;
    }
  }

  return byClass;
}

/** Название объекта: сербское, если оно есть, иначе любое. */
export function placeName(tags: Tags): string {
  return (
    tags['name:sr'] ??
    tags.name ??
    tags['name:sr-Latn'] ??
    tags['name:en'] ??
    ''
  ).trim();
}
