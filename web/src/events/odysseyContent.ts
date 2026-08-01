export interface OdysseyChapter {
  number: number;
  title: string;
  subtitle: string;
  paragraphs: string[];
}

const LOADERS: Record<number, () => Promise<{ default: OdysseyChapter }>> = {
  1: () => import('./odyssey-chapters/chapter-01.json'),
  2: () => import('./odyssey-chapters/chapter-02.json'),
  3: () => import('./odyssey-chapters/chapter-03.json'),
  4: () => import('./odyssey-chapters/chapter-04.json'),
  5: () => import('./odyssey-chapters/chapter-05.json'),
  6: () => import('./odyssey-chapters/chapter-06.json'),
  7: () => import('./odyssey-chapters/chapter-07.json'),
  8: () => import('./odyssey-chapters/chapter-08.json'),
  9: () => import('./odyssey-chapters/chapter-09.json'),
  10: () => import('./odyssey-chapters/chapter-10.json'),
  11: () => import('./odyssey-chapters/chapter-11.json'),
  12: () => import('./odyssey-chapters/chapter-12.json'),
  13: () => import('./odyssey-chapters/chapter-13.json'),
  14: () => import('./odyssey-chapters/chapter-14.json'),
  15: () => import('./odyssey-chapters/chapter-15.json'),
  16: () => import('./odyssey-chapters/chapter-16.json'),
  17: () => import('./odyssey-chapters/chapter-17.json'),
  18: () => import('./odyssey-chapters/chapter-18.json'),
  19: () => import('./odyssey-chapters/chapter-19.json'),
  20: () => import('./odyssey-chapters/chapter-20.json'),
  21: () => import('./odyssey-chapters/chapter-21.json'),
  22: () => import('./odyssey-chapters/chapter-22.json'),
  23: () => import('./odyssey-chapters/chapter-23.json'),
  24: () => import('./odyssey-chapters/chapter-24.json'),
};

export async function loadOdysseyChapter(number: number): Promise<OdysseyChapter> {
  const loader = LOADERS[number];
  if (!loader) throw new Error('Такой песни в «Одиссее» нет.');
  return (await loader()).default;
}
