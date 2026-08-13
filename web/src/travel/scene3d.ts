import type { Point } from './types';

export type StreetObjectKind =
  | 'tree'
  | 'bench'
  | 'street_lamp'
  | 'fountain'
  | 'bus_stop'
  | 'waste_basket'
  | 'bicycle_parking'
  | 'artwork';

export interface SceneBuilding {
  id: string;
  outline: Point[];
  height: number;
}

export interface SceneRoad {
  id: string;
  points: Point[];
  width: number;
}

export interface StreetObject {
  id: string;
  kind: StreetObjectKind;
  at: Point;
  name: string;
}

export interface TravelSceneData {
  version: number;
  cityId: string;
  center: Point;
  radiusM: number;
  source: { name: string; license: string };
  buildings: SceneBuilding[];
  roads: SceneRoad[];
  objects: StreetObject[];
}

export interface StreetObjectLesson {
  sr: string;
  ru: string;
  exampleSr: string;
  exampleRu: string;
}

export const STREET_OBJECTS: Record<StreetObjectKind, StreetObjectLesson> = {
  tree: {
    sr: 'дрво',
    ru: 'дерево',
    exampleSr: 'Сешћемо у хлад испод овог дрвета.',
    exampleRu: 'Мы сядем в тени под этим деревом.',
  },
  bench: {
    sr: 'клупа',
    ru: 'скамейка',
    exampleSr: 'Да ли је ова клупа слободна?',
    exampleRu: 'Эта скамейка свободна?',
  },
  street_lamp: {
    sr: 'улична светиљка',
    ru: 'уличный фонарь',
    exampleSr: 'На углу је стара улична светиљка.',
    exampleRu: 'На углу стоит старый уличный фонарь.',
  },
  fountain: {
    sr: 'фонтана',
    ru: 'фонтан',
    exampleSr: 'Нађимо се код фонтане у шест.',
    exampleRu: 'Давай встретимся у фонтана в шесть.',
  },
  bus_stop: {
    sr: 'аутобуско стајалиште',
    ru: 'автобусная остановка',
    exampleSr: 'Где је најближе аутобуско стајалиште?',
    exampleRu: 'Где ближайшая автобусная остановка?',
  },
  waste_basket: {
    sr: 'канта за отпатке',
    ru: 'урна',
    exampleSr: 'Канта за отпатке је поред клупе.',
    exampleRu: 'Урна находится рядом со скамейкой.',
  },
  bicycle_parking: {
    sr: 'паркинг за бицикле',
    ru: 'велопарковка',
    exampleSr: 'Оставио сам бицикл на паркингу за бицикле.',
    exampleRu: 'Я оставил велосипед на велопарковке.',
  },
  artwork: {
    sr: 'скулптура',
    ru: 'скульптура',
    exampleSr: 'Ова скулптура је дело српског вајара.',
    exampleRu: 'Эта скульптура создана сербским скульптором.',
  },
};

const cache = new Map<string, Promise<TravelSceneData>>();

export function supportsTravel3D(cityId: string): boolean {
  return cityId === 'beograd' || cityId === 'novi-sad';
}

export function loadTravelScene(cityId: string): Promise<TravelSceneData> {
  const existing = cache.get(cityId);
  if (existing) return existing;
  const request = fetch(`/travel/scenes/${encodeURIComponent(cityId)}.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`travel scene ${response.status}`);
      return response.json() as Promise<TravelSceneData>;
    })
    .catch((error) => {
      cache.delete(cityId);
      throw error;
    });
  cache.set(cityId, request);
  return request;
}
