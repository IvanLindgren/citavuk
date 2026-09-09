/** Диапазон инлайнового форматирования внутри исходного абзаца читалки. */
export interface ReaderMark {
  start: number;
  end: number;
  kind: 'strong' | 'emphasis' | 'strike' | 'code' | 'link' | 'font' | 'size' | 'audio';
  value?: string;
}
