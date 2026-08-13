import {
  divIcon,
  map as createMap,
  marker,
  tileLayer,
  type Map as LeafletMap,
  type Marker,
} from 'leaflet';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

import { iconBody, iconMarkup } from '../travel/icons';
import type { City, CityPin, Point, TravelBundle } from '../travel/types';

/**
 * Карта Путешествия.
 *
 * Leaflet рисует MapTiler как обычные PNG-тайлы. Здесь это надёжнее WebGL:
 * MapLibre успевал поставить DOM-метки, но в части браузеров оставлял canvas
 * прозрачным даже после события `idle`.
 */

interface Props {
  tileUrl: string;
  city: City;
  bundle: TravelBundle;
  /** Куда поставить метку найденного места. */
  marked: Point | null;
  onPickPin: (pin: CityPin) => void;
  onPickPoint: (at: Point) => void;
  onReady: () => void;
}

const LABELS_FROM = 15;
const ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

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

function at(point: Point): [number, number] {
  return [point[1], point[0]];
}

export function TravelMap({
  tileUrl,
  city,
  bundle,
  marked,
  onPickPin,
  onPickPoint,
  onReady,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const pins = useRef<Marker[]>([]);
  const found = useRef<Marker | null>(null);
  const handlers = useRef({ onPickPoint, onReady });
  handlers.current = { onPickPoint, onReady };

  useEffect(() => {
    if (!holder.current) return;

    const instance = createMap(holder.current, {
      center: at(city.center),
      zoom: city.zoom,
      zoomControl: false,
      attributionControl: true,
    });
    map.current = instance;

    const tiles = tileLayer(tileUrl, {
      attribution: ATTRIBUTION,
      maxZoom: 22,
      tileSize: 256,
    });
    tiles.once('load', () => handlers.current.onReady());
    tiles.addTo(instance);

    instance.on('click', (event) => {
      handlers.current.onPickPoint([event.latlng.lng, event.latlng.lat]);
    });

    const labels = () => {
      holder.current?.classList.toggle(
        'travel-map--compact',
        instance.getZoom() < LABELS_FROM,
      );
    };
    labels();
    instance.on('zoomend', labels);

    return () => {
      instance.remove();
      map.current = null;
    };
    // Смена города — перелёт существующей карты, а не новый набор тайлов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const pin of pins.current) pin.remove();
    pins.current = city.pins.map((pin) => {
      const kind = bundle.kinds.find((item) => item.id === pin.kind);
      const element = pinElement(pin.sr, iconBody(bundle, kind?.icon ?? ''));
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onPickPin(pin);
      });
      return marker(at(pin.at), {
        bubblingMouseEvents: false,
        icon: divIcon({
          html: element,
          className: 'travel-marker',
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
      }).addTo(instance);
    });

    instance.flyTo(at(city.center), city.zoom, { duration: 0.9 });

    return () => {
      for (const pin of pins.current) pin.remove();
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
    found.current = marker(at(marked), {
      interactive: false,
      icon: divIcon({
        html: element,
        className: 'travel-marker',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).addTo(instance);
  }, [marked]);

  return (
    <div className="absolute inset-0 z-0 isolate overflow-hidden">
      <div ref={holder} className="h-full w-full" />
    </div>
  );
}
