/**
 * Сербское радио в приёмнике Читавука.
 *
 * Живая речь и живая музыка — единственное в саду, что приходит не от нас: это
 * прямые эфиры сербских станций, и мы их только включаем. Отсюда два следствия.
 * Поток может замолчать в любой день, поэтому у приёмника есть честное
 * состояние «не ловит», а не вечная крутилка. И станция всегда названа своим
 * именем: слушатель должен знать, кого слушает.
 */

export interface Station {
  id: string;
  /** Как станция называет себя в эфире. */
  name: string;
  city: string;
  /** Что там звучит — по-сербски, потому что это тоже слова. */
  sr: string;
  ru: string;
  url: string;
}

export const STATIONS: Station[] = [
  {
    id: 'play-balkan',
    name: 'Play Balkan',
    city: 'Београд',
    sr: 'домаћа музика',
    ru: 'балканская музыка',
    url: 'https://stream.playradio.rs:8443/balkan.mp3',
  },
  {
    id: 'tdi',
    name: 'TDI Radio',
    city: 'Београд',
    sr: 'хитови и водитељи',
    ru: 'хиты и живые ведущие',
    url: 'https://streaming.tdiradio.com/tdiradio.mp3',
  },
  {
    id: 'radio-s',
    name: 'Radio S1',
    city: 'Београд',
    sr: 'разговор и музика',
    ru: 'разговоры и музыка',
    url: 'https://stream.radios.rs:9000/;',
  },
  {
    id: 'play',
    name: 'Play Radio',
    city: 'Београд',
    sr: 'поп',
    ru: 'поп-музыка',
    url: 'https://stream.playradio.rs:8443/play.mp3',
  },
];

export function stationById(id: string): Station | undefined {
  return STATIONS.find((station) => station.id === id);
}

const SETTING = 'citavuk.garden.radio';

/** Последняя станция помнится: приёмник включают на той же волне. */
export function readRadioSetting(): string {
  try {
    const saved = window.localStorage.getItem(SETTING);
    return saved && stationById(saved) ? saved : STATIONS[0]!.id;
  } catch {
    return STATIONS[0]!.id;
  }
}

export function saveRadioSetting(id: string): void {
  try {
    window.localStorage.setItem(SETTING, id);
  } catch {
    // Приватный режим: волна просто не запомнится.
  }
}
