/**
 * Планировка квартиры Читавука.
 *
 * Устроена так же, как двор в world.ts: свои пиксели, предмет стоит основанием
 * в своей точке, порядок отрисовки — по этой же точке. Разница в том, что двор
 * — поле, а квартира — две комнаты: жилая с полом в доску и кухня в плитке,
 * между ними перегородка с проходом снизу.
 *
 * Предметы здесь не декорация: на каждый можно нажать и получить сербское
 * слово, а часть из них ещё и что-то делает.
 */

import type { Point, Rect } from './world';

export const ROOM = { w: 224, h: 168 };

/** Стена сверху и по бокам: ходить можно только по полу между ними. */
export const FLOOR = { left: 12, right: 212, top: 66, bottom: 162 };

/** Перегородка между жилой комнатой и кухней. Проход — ниже неё. */
export const PARTITION: Rect = { x0: 144, y0: 56, x1: 152, y1: 100 };

export const SPAWN: Point = { x: 20, y: 74 };

/** Что делает предмет, кроме того что называет себя по-сербски. */
export type RoomAction = 'radio' | 'notebook' | 'fridge' | 'letters' | 'fire' | 'books' | 'leave';

export interface RoomThing {
  /** Имя спрайта, ключ слова и ключ покупки — одно и то же. */
  id: string;
  /** Середина по горизонтали и пол под предметом. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Куда встаёт Читавук, чтобы дотянуться. */
  stand: Point;
  action?: RoomAction;
  /** Висит на стене: пола под ним нет. */
  wall?: boolean;
  /** Стоит на другом предмете: своей опоры на полу нет. */
  on?: true;
  /** По нему ходят: ковёр и кот не мебель. */
  flat?: true;
  /** Появляется только после покупки. */
  bought?: true;
}

export const THINGS: RoomThing[] = [
  // Стена.
  { id: 'door', x: 20, y: 56, w: 16, h: 32, stand: { x: 20, y: 74 }, wall: true, action: 'leave' },
  { id: 'picture', x: 72, y: 44, w: 32, h: 32, stand: { x: 72, y: 110 }, wall: true, bought: true },
  { id: 'window', x: 108, y: 44, w: 16, h: 32, stand: { x: 104, y: 102 }, wall: true },
  { id: 'blackboard', x: 190, y: 40, w: 32, h: 16, stand: { x: 190, y: 104 }, wall: true, action: 'letters' },

  // Жилая комната.
  { id: 'bed', x: 48, y: 96, w: 31, h: 32, stand: { x: 48, y: 108 } },
  { id: 'nightstand', x: 72, y: 96, w: 11, h: 14, stand: { x: 72, y: 110 } },
  { id: 'radio', x: 72, y: 84, w: 11, h: 16, stand: { x: 72, y: 110 }, on: true, action: 'radio' },
  { id: 'tvstand', x: 104, y: 84, w: 32, h: 14, stand: { x: 104, y: 102 } },
  { id: 'tv', x: 104, y: 72, w: 32, h: 16, stand: { x: 104, y: 102 }, on: true },
  { id: 'fireplace', x: 132, y: 88, w: 14, h: 32, stand: { x: 132, y: 102 }, action: 'fire' },
  { id: 'sofa', x: 104, y: 134, w: 32, h: 16, stand: { x: 104, y: 146 } },
  { id: 'rug', x: 104, y: 156, w: 32, h: 16, stand: { x: 104, y: 146 }, flat: true, bought: true },
  { id: 'shelf', x: 16, y: 140, w: 16, h: 32, stand: { x: 16, y: 152 }, action: 'books', bought: true },
  { id: 'desk', x: 52, y: 148, w: 32, h: 14, stand: { x: 52, y: 160 } },
  { id: 'notebook', x: 52, y: 138, w: 16, h: 16, stand: { x: 52, y: 160 }, on: true, action: 'notebook' },
  { id: 'lamp', x: 80, y: 152, w: 9, h: 27, stand: { x: 80, y: 160 }, bought: true },
  { id: 'cat', x: 120, y: 160, w: 7, h: 9, stand: { x: 120, y: 150 }, flat: true, bought: true },
  { id: 'pot', x: 136, y: 156, w: 8, h: 14, stand: { x: 136, y: 162 }, bought: true },

  // Кухня.
  { id: 'kitchen', x: 174, y: 88, w: 39, h: 32, stand: { x: 174, y: 104 } },
  { id: 'fridge', x: 206, y: 88, w: 16, h: 32, stand: { x: 204, y: 104 }, action: 'fridge' },
  { id: 'table', x: 176, y: 138, w: 32, h: 14, stand: { x: 176, y: 158 } },
  { id: 'chair-left', x: 166, y: 152, w: 9, h: 13, stand: { x: 176, y: 158 } },
  { id: 'chair-right', x: 188, y: 152, w: 9, h: 13, stand: { x: 176, y: 158 } },
];

/** Стулья — два одинаковых спрайта, поэтому имя картинки не всегда равно id. */
export function spriteOf(thing: RoomThing): string {
  return thing.id.startsWith('chair') ? 'chair' : thing.id;
}

export function thingRect(thing: RoomThing): Rect {
  return {
    x0: thing.x - thing.w / 2,
    y0: thing.y - thing.h,
    x1: thing.x + thing.w / 2,
    y1: thing.y,
  };
}

/**
 * Через что нельзя пройти.
 *
 * Мимо мебели ходят, а не сквозь неё — иначе комната остаётся картинкой.
 * Плоское (ковёр, кот) и висящее на стене в счёт не идёт, как и то, что стоит
 * на другом предмете: у приёмника своя опора — тумба.
 */
export function blockedRects(owned: string[]): Rect[] {
  const rects = THINGS.filter(
    (thing) =>
      !thing.wall &&
      !thing.flat &&
      !thing.on &&
      (!thing.bought || owned.includes(thing.id)),
  ).map(thingRect);
  return [...rects, PARTITION];
}

export function visibleThings(owned: string[]): RoomThing[] {
  return THINGS.filter((thing) => !thing.bought || owned.includes(thing.id));
}
