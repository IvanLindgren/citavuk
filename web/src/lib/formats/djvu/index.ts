/**
 * Чтение текстового слоя DjVu.
 *
 * DjVu — контейнер IFF: «AT&T», дальше FORM с вложенными чанками. Текст
 * страницы лежит в TXTa (как есть) или TXTz (сжатый BZZ). Картинку страницы
 * читалка не показывает — ей нужен текст.
 */

import { bzzDecode } from './bzz';

/** Мягкий перенос вместе с пробелами: «zdra­ vých» — одно слово. */
const SOFT_HYPHEN = /\s*­\s*/g;

export function extractDjvuText(bytes: Uint8Array): string {
  if (!hasSignature(bytes)) throw new Error('Это не DjVu-файл');

  const pages: string[] = [];
  walk(bytes, 4, bytes.length, pages);

  if (pages.length === 0) {
    throw new Error(
      'В этом DjVu нет текстового слоя — только картинки страниц. ' +
        'Такой файл нужно сначала распознать (OCR).',
    );
  }
  return pages.join('\n\n').replace(SOFT_HYPHEN, '');
}

function hasSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[0]! === 0x41 &&
    bytes[1]! === 0x54 &&
    bytes[2]! === 0x26 &&
    bytes[3]! === 0x54
  );
}

/** Обходит чанки, спускаясь внутрь FORM. */
function walk(bytes: Uint8Array, start: number, end: number, out: string[]): void {
  let offset = start;
  while (offset + 8 <= end) {
    const id = ascii(bytes, offset, 4);
    const size = uint32(bytes, offset + 4);
    const body = offset + 8;
    if (size < 0 || body + size > end) return;

    if (id === 'FORM') {
      // Первые 4 байта FORM — его подтип (DJVU, DJVM, DJVI).
      walk(bytes, body + 4, body + size, out);
    } else if (id === 'TXTa') {
      out.push(decodeChunk(bytes.subarray(body, body + size)));
    } else if (id === 'TXTz') {
      try {
        out.push(decodeChunk(bzzDecode(bytes.subarray(body, body + size))));
      } catch {
        // Одна битая страница не должна ронять всю книгу.
      }
    }

    // Чанки выравниваются по чётному смещению.
    offset = body + size + (size % 2);
  }
}

/** Тело текстового чанка: 24-битная длина, текст, дальше разметка зон. */
function decodeChunk(body: Uint8Array): string {
  if (body.length < 3) return '';
  const length = (body[0]! << 16) | (body[1]! << 8) | body[2]!;
  const end = Math.min(3 + length, body.length);
  return new TextDecoder('utf-8').decode(body.subarray(3, end));
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}
