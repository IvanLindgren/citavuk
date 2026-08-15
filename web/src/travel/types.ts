/**
 * Путешествие: справочник мест и то, что в них говорят.
 *
 * Формат общий с приложением: файлы лежат в `frontend/assets/travel/` и
 * читаются Flutter напрямую, а веб получает копию через
 * `web/scripts/prepare-course-assets.mjs`. Поэтому здесь только описание
 * данных — ничего браузерного.
 *
 * Узлы диалога устроены как в диалогах курса (`CourseDialogue`): тот же
 * `startNodeId`, те же `choices` с переходом по `next`. Второй формат диалога
 * в одном приложении означал бы второй проигрыватель.
 */

/**
 * Заведение, дорожный объект или слова, которые нужны везде: у второго и
 * третьего диалога может не быть.
 */
export type KindGroup = 'place' | 'road' | 'basic';

export interface PlaceKind {
  id: string;
  group: KindGroup;
  /** Название по-сербски, кириллицей. Латиница получается транслитерацией. */
  sr: string;
  ru: string;
  icon: string;
  /**
   * Насколько важна подпись на карте: 1 — показывать первой, 3 — только вблизи.
   * На улице сорок урн и одна пекарня, а место под подписи одно.
   */
  rank: number;
  /**
   * Теги OSM, по которым узнаётся тип нажатого на карте объекта.
   * Несколько условий в одном теге разделяются `;` — все обязаны совпасть.
   */
  osm: string[];
  /**
   * Подклассы векторных тайлов (схема OpenMapTiles): `bakery` — точное
   * совпадение `subclass`, `attraction/*` — любой объект этого `class`.
   * По ним карта узнаёт место мгновенно, не спрашивая Overpass.
   */
  omt: string[];
}

export interface Phrase {
  sr: string;
  ru: string;
}

export interface DialogueChoice {
  id: string;
  label: string;
  next: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
  end?: boolean;
}

export interface PlaceDialogue {
  participants: string[];
  startNodeId: string;
  nodes: DialogueNode[];
}

export interface PlaceContent {
  kind: string;
  /** Как это устроено в Сербии: то, чего из словаря не узнать. */
  hint: string;
  words: Phrase[];
  phrases: Phrase[];
  dialogue?: PlaceDialogue;
}

export interface KindIndex {
  version: number;
  contentReviewedAt?: string;
  kinds: PlaceKind[];
}

/** Долгота и широта — в порядке карты, а не привычном «широта, долгота». */
export type Point = [number, number];

export interface CityPin {
  id: string;
  sr: string;
  ru: string;
  kind: string;
  at: Point;
}

export interface City {
  id: string;
  sr: string;
  ru: string;
  center: Point;
  zoom: number;
  pins: CityPin[];
}

export interface CityIndex {
  version: number;
  cities: City[];
}

/** Всё Путешествие одним файлом: карта делает один запрос, а не тридцать три. */
export interface TravelBundle {
  version: number;
  contentReviewedAt?: string;
  kinds: PlaceKind[];
  cities: City[];
  places: Record<string, PlaceContent>;
  /** Содержимое `<svg>` значка по имени из `PlaceKind.icon`. */
  icons: Record<string, string>;
}
