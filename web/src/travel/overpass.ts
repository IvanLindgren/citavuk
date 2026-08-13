import { matchKind, placeName, type Tags } from './kinds';
import type { PlaceKind, Point } from './types';

/**
 * Что находится в точке, куда ткнули на карте.
 *
 * Спрашивается Overpass — поисковый API поверх данных OpenStreetMap. Запрос
 * идёт из браузера: своего прокси с кешем пока нет, и до него это единственный
 * способ узнать про место, которого нет в наших пинах.
 *
 * Зеркал два: overpass-api.de регулярно отвечает 429 в часы пик, и молчание
 * карты в ответ на нажатие выглядит как поломка приложения.
 */

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Радиус поиска вокруг нажатия. Больше — и в ответ попадает соседний квартал. */
const RADIUS_M = 40;

const TIMEOUT_MS = 12_000;

export interface FoundPlace {
  /** Тип из справочника или `null`, если такого Читавук пока не знает. */
  kind: string | null;
  name: string;
  at: Point;
  tags: Tags;
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
}

function query(lat: number, lon: number): string {
  return `[out:json][timeout:10];nwr(around:${RADIUS_M},${lat.toFixed(6)},${lon.toFixed(6)});out tags center 40;`;
}

function positionOf(element: OverpassElement): Point | null {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return [element.lon, element.lat];
  }
  if (element.center) return [element.center.lon, element.center.lat];
  return null;
}

/** Расстояние в метрах, плоское приближение: на сорока метрах кривизна не видна. */
function distance(from: Point, to: Point): number {
  const scale = Math.cos((from[1] * Math.PI) / 180);
  const dx = (to[0] - from[0]) * scale * 111_320;
  const dy = (to[1] - from[1]) * 110_540;
  return Math.hypot(dx, dy);
}

export function pickPlace(
  elements: OverpassElement[],
  clicked: Point,
  kinds: PlaceKind[],
): FoundPlace | null {
  let best: FoundPlace | null = null;
  let bestScore = -Infinity;

  for (const element of elements) {
    const tags = element.tags;
    if (!tags) continue;
    const kind = matchKind(tags, kinds);
    if (!kind) continue;

    const at = positionOf(element) ?? clicked;
    const name = placeName(tags);
    // Названное заведение важнее безымянного контура: в одной точке лежат и
    // пекарня, и здание, в котором она сидит.
    const score = (name ? 50 : 0) - distance(clicked, at);
    if (score > bestScore) {
      bestScore = score;
      best = { kind, name, at, tags };
    }
  }

  return best;
}

async function ask(url: string, body: string, signal?: AbortSignal): Promise<OverpassElement[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
    signal,
  });
  if (!response.ok) throw new Error(`overpass ${response.status}`);
  const parsed = (await response.json()) as { elements?: OverpassElement[] };
  return parsed.elements ?? [];
}

/**
 * Место в точке карты. `null` — рядом нет ничего, что мы умеем распознавать.
 *
 * Бросает только тогда, когда не ответило ни одно зеркало: странице надо
 * различать «здесь пусто» и «спросить не удалось».
 */
export async function lookupPlace(
  at: Point,
  kinds: PlaceKind[],
  signal?: AbortSignal,
): Promise<FoundPlace | null> {
  const body = query(at[1], at[0]);
  let lastError: unknown = null;

  for (const mirror of MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const elements = await ask(mirror, body, controller.signal);
      return pickPlace(elements, at, kinds);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('overpass unavailable');
}
