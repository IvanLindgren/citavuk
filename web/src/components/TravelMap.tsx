import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { iconBody, iconMarkup } from '../travel/icons';
import type { City, CityPin, Point, TravelBundle } from '../travel/types';

/**
 * Карта Путешествия.
 *
 * MapLibre живёт вне React: он сам держит канву, метки и жесты. Поэтому здесь
 * только один пустой div и эффекты, которые доносят до карты изменения снаружи.
 * Перерисовывать карту на каждый рендер нельзя — это секунда чёрного экрана и
 * заново скачанные тайлы.
 */

interface Props {
  styleUrl: string;
  city: City;
  bundle: TravelBundle;
  /** Куда поставить метку найденного места. */
  marked: Point | null;
  onPickPin: (pin: CityPin) => void;
  onPickPoint: (at: Point) => void;
  onError: () => void;
}

/**
 * Ниже этого приближения подписи меток налезают друг на друга: в центре
 * Белграда между музеем и площадью полсотни метров, а у подписи ширина в сотню
 * пикселей. Остаётся один значок — он всё ещё виден и всё ещё нажимается.
 */
const LABELS_FROM = 15;

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
  marked,
  onPickPin,
  onPickPoint,
  onError,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const pins = useRef<Marker[]>([]);
  const found = useRef<Marker | null>(null);
  /*
   * Нажатие по метке доходит и до карты: метки лежат в том же контейнере, что
   * и канва. Без этой отсечки выбор пина сразу же перекрывался бы запросом
   * «что находится в этой точке».
   */
  const pinnedAt = useRef(0);

  // Обработчики нужны свежие, но пересоздавать из-за них карту нельзя.
  const handlers = useRef({ onPickPoint, onError });
  handlers.current = { onPickPoint, onError };

  useEffect(() => {
    if (!holder.current) return;
    const instance = new MapLibreMap({
      container: holder.current,
      style: styleUrl,
      center: city.center,
      zoom: city.zoom,
      // Города Сербии умещаются без наклона, а наклон ломает попадание по меткам.
      pitchWithRotate: false,
      dragRotate: false,
    });
    map.current = instance;

    instance.on('click', (event) => {
      if (Date.now() - pinnedAt.current < 400) return;
      handlers.current.onPickPoint([event.lngLat.lng, event.lngLat.lat]);
    });
    instance.on('error', () => handlers.current.onError());

    const labels = () => {
      holder.current?.classList.toggle('travel-map--compact', instance.getZoom() < LABELS_FROM);
    };
    labels();
    instance.on('zoom', labels);

    return () => {
      instance.remove();
      map.current = null;
    };
    // Карта создаётся один раз: смена города — это перелёт, а не новая карта.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const marker of pins.current) marker.remove();
    pins.current = city.pins.map((pin) => {
      const kind = bundle.kinds.find((item) => item.id === pin.kind);
      const element = pinElement(pin.sr, iconBody(bundle, kind?.icon ?? ''));
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        pinnedAt.current = Date.now();
        onPickPin(pin);
      });
      return new Marker({ element, anchor: 'bottom' }).setLngLat(pin.at).addTo(instance);
    });

    instance.flyTo({ center: city.center, zoom: city.zoom, duration: 900 });

    return () => {
      for (const marker of pins.current) marker.remove();
      pins.current = [];
    };
  }, [city, bundle, onPickPin]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    found.current?.remove();
    found.current = null;
    if (!marked) return;
    const element = document.createElement('div');
    element.className = 'travel-found';
    found.current = new Marker({ element }).setLngLat(marked).addTo(instance);
  }, [marked]);

  // MapLibre сам добавляет контейнеру `position: relative`. Если абсолютное
  // позиционирование висит на том же узле, его CSS перебивает Tailwind и
  // высота схлопывается до нуля (canvas остаётся служебных 300 px). Внешний
  // слой держит геометрию экрана, внутренний MapLibre может менять свободно.
  return (
    <div className="absolute inset-0">
      <div ref={holder} className="h-full w-full" />
    </div>
  );
}
