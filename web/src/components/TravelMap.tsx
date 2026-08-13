import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { inScript, type Script } from '../travel/content';
import { iconMarkup } from '../travel/icons';
import { matchOmt } from '../travel/kinds';
import type { City, CityPin, PlaceKind, Point, TravelBundle } from '../travel/types';

/**
 * Карта Путешествия: настоящий город, а не нарисованный.
 *
 * Улицы, дома и их высоты приезжают векторными тайлами MapTiler — это те же
 * данные OpenStreetMap, из которых сделаны обычные карты. Камера наклоняется и
 * поворачивается, дома встают в объём.
 *
 * Главное здесь — слой подписей поверх `poi`: над каждым узнанным местом стоит
 * сербское слово. Поэтому в центре Белграда не восемь мест, а столько, сколько
 * их в городе на самом деле.
 */

interface Found {
  kind: string;
  name: string;
  at: Point;
}

interface Props {
  styleUrl: string;
  city: City;
  bundle: TravelBundle;
  script: Script;
  /** Наклонённая камера: дома в объёме, как в уличной карте. */
  tilted: boolean;
  marked: Point | null;
  onPickPin: (pin: CityPin) => void;
  /** Место узнано прямо в тайле: карточка открывается без единого запроса. */
  onPickPlace: (found: Found) => void;
  /** Под пальцем не оказалось знакомого места — спрашиваем Overpass. */
  onPickPoint: (at: Point) => void;
  onReady: () => void;
  onError: () => void;
}

/** Слои подписей: чем важнее тип, тем раньше он появляется при приближении. */
const TIERS = [
  { id: 'travel-poi-1', rank: 1, minzoom: 13.5, size: 1 },
  { id: 'travel-poi-2', rank: 2, minzoom: 15, size: 0.9 },
  { id: 'travel-poi-3', rank: 3, minzoom: 16.5, size: 0.85 },
];

const HIT_LAYER = 'travel-poi-hit';
const ICON_PX = 48;
const ICON_COLOR = '#9e2b25';
const TILT = 58;

type Expression = unknown[];
type AddLayer = Parameters<MapLibreMap['addLayer']>[0];

function at(point: Point): [number, number] {
  return [point[0], point[1]];
}

/**
 * Тип места выражением: сначала точный `subclass`, потом правило `class/*`.
 * Считается прямо в тайле, поэтому подпись появляется вместе с картой.
 */
function kindExpression(kinds: PlaceKind[]): Expression {
  const bySubclass: unknown[] = [];
  const byClass: unknown[] = [];

  for (const kind of kinds) {
    for (const rule of kind.omt) {
      if (rule.endsWith('/*')) byClass.push(rule.slice(0, -2), kind.id);
      else bySubclass.push(rule, kind.id);
    }
  }

  const fallback: unknown = byClass.length
    ? ['match', ['to-string', ['get', 'class']], ...byClass, '']
    : '';
  if (!bySubclass.length) return ['literal', ''];
  return ['match', ['to-string', ['get', 'subclass']], ...bySubclass, fallback];
}

function labelExpression(kinds: PlaceKind[], script: Script): Expression {
  const pairs: unknown[] = [];
  for (const kind of kinds) pairs.push(kind.id, inScript(kind.sr, script));
  return ['match', kindExpression(kinds), ...pairs, ''];
}

function imageExpression(kinds: PlaceKind[]): Expression {
  const pairs: unknown[] = [];
  for (const kind of kinds) pairs.push(kind.id, `travel-${kind.id}`);
  return ['match', kindExpression(kinds), ...pairs, ''];
}

function tierFilter(kinds: PlaceKind[], rank: number): Expression {
  const ids = kinds.filter((kind) => kind.rank === rank).map((kind) => kind.id);
  return ['in', kindExpression(kinds), ['literal', ids]];
}

/** Значок картинкой для карты: `currentColor` в тайлах не работает. */
function iconUrl(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR}" stroke-width="2.1" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('icon'));
    image.src = url;
  });
}

function pinElement(label: string, icon: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'travel-pin';
  button.setAttribute('aria-label', label);
  button.innerHTML =
    `<span class="travel-pin-icon">${iconMarkup(icon)}</span>` +
    `<span class="travel-pin-label"></span>`;
  button.querySelector('.travel-pin-label')!.textContent = label;
  return button;
}

export function TravelMap({
  styleUrl,
  city,
  bundle,
  script,
  tilted,
  marked,
  onPickPin,
  onPickPlace,
  onPickPoint,
  onReady,
  onError,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef<Marker[]>([]);
  const found = useRef<Marker | null>(null);
  const handlers = useRef({ onPickPlace, onPickPoint, onReady, onError });
  handlers.current = { onPickPlace, onPickPoint, onReady, onError };
  const tilt = useRef(tilted);
  tilt.current = tilted;

  useEffect(() => {
    if (!holder.current) return;

    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
        container: holder.current,
        style: styleUrl,
        center: at(city.center),
        zoom: city.zoom,
        pitch: tilted ? TILT : 0,
        maxPitch: 70,
        attributionControl: { compact: true },
      });
    } catch {
      // Нет WebGL — раздел покажет места списком.
      handlers.current.onError();
      return;
    }
    map.current = instance;

    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    instance.on('load', () => {
      void decorate(instance, bundle, script, tilt.current).then(() =>
        handlers.current.onReady(),
      );
    });

    const cursor = (shape: string) => () => {
      instance.getCanvas().style.cursor = shape;
    };
    instance.on('mouseenter', HIT_LAYER, cursor('pointer'));
    instance.on('mouseleave', HIT_LAYER, cursor(''));

    instance.on('click', (event) => {
      const place = placeUnder(instance, event.point.x, event.point.y, bundle.kinds);
      if (place) handlers.current.onPickPlace(place);
      else handlers.current.onPickPoint([event.lngLat.lng, event.lngLat.lat]);
    });

    return () => {
      for (const pin of pins.current) pin.remove();
      pins.current = [];
      found.current?.remove();
      found.current = null;
      instance.remove();
      map.current = null;
    };
    // Смена города — перелёт готовой карты, а не новый набор тайлов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const pin of pins.current) pin.remove();
    pins.current = city.pins.map((pin) => {
      const kind = bundle.kinds.find((item) => item.id === pin.kind);
      const element = pinElement(inScript(pin.sr, script), bundle.icons[kind?.icon ?? ''] ?? '');
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onPickPin(pin);
      });
      return new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat(at(pin.at))
        .addTo(instance);
    });

    return () => {
      for (const pin of pins.current) pin.remove();
      pins.current = [];
    };
  }, [city, bundle, script, onPickPin]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance.flyTo({ center: at(city.center), zoom: city.zoom, duration: 900 });
  }, [city]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    instance.easeTo({ pitch: tilted ? TILT : 0, duration: 700 });
    showBuildings(instance, tilted);
  }, [tilted]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    for (const tier of TIERS) {
      if (!instance.getLayer(tier.id)) continue;
      instance.setLayoutProperty(tier.id, 'text-field', labelExpression(bundle.kinds, script));
    }
  }, [script, bundle]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    found.current?.remove();
    found.current = null;
    if (!marked) return;
    const element = document.createElement('div');
    element.className = 'travel-found';
    found.current = new maplibregl.Marker({ element }).setLngLat(at(marked)).addTo(instance);
  }, [marked]);

  return (
    <div className="absolute inset-0 z-0 isolate overflow-hidden">
      <div ref={holder} className="h-full w-full" />
    </div>
  );
}

/**
 * Объёмные дома по наклону камеры.
 *
 * Сверху это серые пятна поверх улиц, поэтому в плоском виде они выключены.
 * Пока стиль не приехал, спрашивать его нельзя — карта только создана.
 */
function showBuildings(instance: MapLibreMap, visible: boolean): void {
  if (!instance.isStyleLoaded()) return;
  for (const layer of instance.getStyle().layers ?? []) {
    if (layer.type !== 'fill-extrusion') continue;
    instance.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
  }
}

/**
 * Что находится под пальцем.
 *
 * Спрашивается невидимый слой-мишень, а не подписи: подпись, которую вытеснил
 * сосед, карта не считает нарисованной, и нажатие по пекарне без подписи ушло
 * бы в никуда.
 */
function placeUnder(
  instance: MapLibreMap,
  x: number,
  y: number,
  kinds: PlaceKind[],
): Found | null {
  if (!instance.getLayer(HIT_LAYER)) return null;
  const box: [[number, number], [number, number]] = [
    [x - 8, y - 8],
    [x + 8, y + 8],
  ];
  const hits = instance.queryRenderedFeatures(box, { layers: [HIT_LAYER] });
  // Ближайшее к пальцу, а не первое попавшееся: в квартале Белграда в квадрат
  // размером с подушечку пальца попадает и парикмахерская, и школа.
  let hit = hits[0];
  let best = Infinity;
  for (const candidate of hits) {
    if (candidate.geometry.type !== 'Point') continue;
    const screen = instance.project([
      candidate.geometry.coordinates[0] ?? 0,
      candidate.geometry.coordinates[1] ?? 0,
    ]);
    const away = Math.hypot(screen.x - x, screen.y - y);
    if (away < best) {
      best = away;
      hit = candidate;
    }
  }
  if (!hit) return null;

  const properties = hit.properties ?? {};
  const kind = matchOmt(
    String(properties.class ?? ''),
    String(properties.subclass ?? ''),
    kinds,
  );
  if (!kind) return null;

  const geometry = hit.geometry;
  const point = instance.unproject([x, y]);
  const at: Point =
    geometry.type === 'Point'
      ? [geometry.coordinates[0] ?? point.lng, geometry.coordinates[1] ?? point.lat]
      : [point.lng, point.lat];

  return { kind, name: String(properties.name ?? '').trim(), at };
}

/** Правки готового стиля: свои подписи вместо чужих и дома в объёме. */
async function decorate(
  instance: MapLibreMap,
  bundle: TravelBundle,
  script: Script,
  tilted: boolean,
): Promise<void> {
  const style = instance.getStyle();
  const layers = style.layers ?? [];
  const sourceLayer = (layer: unknown): string =>
    (layer as { 'source-layer'?: string })['source-layer'] ?? '';

  // Чужие подписи мест убираем: иначе над пекарней стоят два слова сразу.
  const poi = layers.find((layer) => sourceLayer(layer) === 'poi');
  for (const layer of layers) {
    if (sourceLayer(layer) === 'poi') instance.setLayoutProperty(layer.id, 'visibility', 'none');
  }

  // Свои дома стиль показывает еле видимыми и только вплотную: для наклонённой
  // камеры это пустое поле там, где должен стоять город.
  const extrusion = layers.find((layer) => layer.type === 'fill-extrusion');
  if (extrusion) {
    instance.setPaintProperty(extrusion.id, 'fill-extrusion-opacity', 0.94);
    instance.setLayerZoomRange(extrusion.id, 14, 24);
  }
  showBuildings(instance, tilted);

  if (typeof instance.setSky === 'function') {
    instance.setSky({
      'sky-color': '#9fc4e8',
      'horizon-color': '#e6e9e2',
      'fog-color': '#e6e9e2',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.5,
      'fog-ground-blend': 0.1,
    });
  }

  if (!poi) return;
  const source = (poi as { source?: string }).source;
  if (!source) return;

  await Promise.all(
    bundle.kinds.map(async (kind) => {
      const body = bundle.icons[kind.icon];
      const name = `travel-${kind.id}`;
      if (!body || instance.hasImage(name)) return;
      try {
        instance.addImage(name, await loadImage(iconUrl(body)), { pixelRatio: 2 });
      } catch {
        // Без значка подпись всё равно читается.
      }
    }),
  );

  const font = fontOf(layers);

  instance.addLayer({
    id: HIT_LAYER,
    type: 'circle',
    source,
    'source-layer': 'poi',
    minzoom: 13,
    filter: ['!=', kindExpression(bundle.kinds), ''],
    paint: { 'circle-radius': 11, 'circle-opacity': 0, 'circle-stroke-width': 0 },
  } as unknown as AddLayer);

  for (const tier of TIERS) {
    instance.addLayer({
      id: tier.id,
      type: 'symbol',
      source,
      'source-layer': 'poi',
      minzoom: tier.minzoom,
      filter: tierFilter(bundle.kinds, tier.rank),
      layout: {
        'icon-image': imageExpression(bundle.kinds),
        'icon-size': tier.size * 0.8,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': false,
        'text-field': labelExpression(bundle.kinds, script),
        'text-font': font,
        'text-size': 12 * tier.size,
        'text-anchor': 'top',
        'text-offset': [0, 0.35],
        'text-max-width': 8,
        // Чем мельче тип, тем шире его личное пространство: иначе урны и
        // парковки съедают место у пекарен.
        'text-padding': 2 + tier.rank * 2,
        'symbol-sort-key': tier.rank,
        'text-optional': false,
      },
      paint: {
        'text-color': '#3d2b25',
        'text-halo-color': '#fbf6ea',
        'text-halo-width': 1.6,
        'text-halo-blur': 0.3,
      },
    } as unknown as AddLayer);
  }
}

/** Шрифт берётся из самого стиля: свой набор глифов у каждого поставщика. */
function fontOf(layers: unknown[]): string[] {
  for (const layer of layers) {
    const font = (layer as { layout?: { 'text-font'?: unknown } }).layout?.['text-font'];
    if (Array.isArray(font) && font.every((item) => typeof item === 'string')) {
      return font as string[];
    }
  }
  return ['Noto Sans Regular'];
}
