/**
 * DjVu: ZP-декодер и распаковка BZZ.
 *
 * Три ступени: адаптивный арифметический ZP-декодер, обратное преобразование
 * «переместить в начало» (MTF) и обратное преобразование Барроуза–Уилера.
 * Порт MIT-реализации djvu-rs (© 2026 Lev Matyushkin) по спецификации DjVu v3;
 * тот же алгоритм лежит в приложении (frontend/lib/services/djvu/).
 */

import { LPS_NEXT, MPS_NEXT, PROB, THRESHOLD } from './zpTables';

/** Контекстов на блок нужно 262; берём с запасом. */
const CONTEXT_COUNT = 300;

/** Сколько позиций MTF отслеживаются по частоте. */
const FREQ_SLOTS = 4;

/** Контекстов на первые два уровня дерева позиций. */
const LEVEL_CONTEXTS = 3;

const MAX_BLOCK_SIZE = 4 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 64 * 1024 * 1024;

class ZpDecoder {
  a = 0;
  c = 0;
  fence = 0;
  bitBuf = 0;
  bitCount = 0;
  pos = 0;

  constructor(private readonly data: Uint8Array) {
    if (data.length < 2) throw new Error('ZP: поток короче двух байт');
    this.c = (this.readByte() << 8) | this.readByte();
    this.refill();
    this.fence = Math.min(this.c, 0x7fff);
  }

  private readByte(): number {
    const byte = this.pos < this.data.length ? this.data[this.pos]! : 0xff;
    this.pos++;
    return byte;
  }

  private refill(): void {
    while (this.bitCount <= 24) {
      // >>> 0 держит буфер беззнаковым: сдвиги в JS работают со знаковым int32.
      this.bitBuf = ((this.bitBuf << 8) | this.readByte()) >>> 0;
      this.bitCount += 8;
    }
  }

  /** Сдвиг влево до a >= 0x8000 с подкачкой битов. */
  private renormalize(): void {
    let shift = 0;
    let value = this.a & 0xffff;
    while (shift < 16 && (value & 0x8000) !== 0) {
      value = (value << 1) & 0xffff;
      shift++;
    }
    this.bitCount -= shift;
    this.a = (this.a << shift) & 0xffff;
    const mask = (1 << shift) - 1;
    this.c = ((this.c << shift) | ((this.bitBuf >>> this.bitCount) & mask)) & 0xffff;
    if (this.bitCount < 16) this.refill();
    this.fence = Math.min(this.c, 0x7fff);
  }

  /** Декодирует бит по адаптивному контексту; контекст обновляется на месте. */
  decodeBit(contexts: Uint8Array, index: number): boolean {
    const state = contexts[index]!;
    const mps = state & 1;
    const z = this.a + PROB[state]!;

    if (z <= this.fence) {
      this.a = z;
      return mps !== 0;
    }

    const boundary = 0x6000 + ((this.a + z) >> 2);
    const clamped = Math.min(z, boundary);

    if (clamped > this.c) {
      const complement = 0x10000 - clamped;
      this.a = (this.a + complement) & 0xffff;
      this.c = (this.c + complement) & 0xffff;
      contexts[index] = LPS_NEXT[state]!;
      this.renormalize();
      return mps === 0;
    }

    if (this.a >= THRESHOLD[state]!) contexts[index] = MPS_NEXT[state]!;
    this.bitCount--;
    this.a = (clamped << 1) & 0xffff;
    this.c = ((this.c << 1) | ((this.bitBuf >>> this.bitCount) & 1)) & 0xffff;
    if (this.bitCount < 16) this.refill();
    this.fence = Math.min(this.c, 0x7fff);
    return mps !== 0;
  }

  /** Декодирует бит без контекста — так пишутся размеры блоков. */
  decodePassthrough(): boolean {
    const z = (0x8000 + (this.a >> 1)) & 0xffff;
    if (z > this.c) {
      const complement = 0x10000 - z;
      this.a = (this.a + complement) & 0xffff;
      this.c = (this.c + complement) & 0xffff;
      this.renormalize();
      return true;
    }
    this.bitCount--;
    this.a = (z * 2) & 0xffff;
    this.c = ((this.c << 1) | ((this.bitBuf >>> this.bitCount) & 1)) & 0xffff;
    if (this.bitCount < 16) this.refill();
    this.fence = Math.min(this.c, 0x7fff);
    return false;
  }
}

/** Распаковывает BZZ-поток. */
export function bzzDecode(data: Uint8Array): Uint8Array {
  const zp = new ZpDecoder(data);
  const contexts = new Uint8Array(CONTEXT_COUNT);
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const blockSize = decodeRawBits(zp, 24);
    if (blockSize === 0) break;
    if (blockSize > MAX_BLOCK_SIZE) {
      throw new Error(`BZZ: блок ${blockSize} байт слишком велик`);
    }
    const block = decodeBlock(zp, contexts, blockSize);
    total += block.length;
    if (total > MAX_OUTPUT_SIZE) {
      throw new Error('BZZ: распакованные данные слишком велики');
    }
    chunks.push(block);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Целое число, записанное битами без контекста. */
function decodeRawBits(zp: ZpDecoder, bits: number): number {
  const limit = 1 << bits;
  let n = 1;
  while (n < limit) {
    n = (n << 1) | (zp.decodePassthrough() ? 1 : 0);
  }
  return n - limit;
}

/** Число из поддерева контекстов, растущего от `base - 1`. */
function decodeContextBits(
  zp: ZpDecoder,
  contexts: Uint8Array,
  base: number,
  bits: number,
): number {
  const offset = base - 1;
  const limit = 1 << bits;
  let n = 1;
  while (n < limit) {
    n = (n << 1) | (zp.decodeBit(contexts, offset + n) ? 1 : 0);
  }
  return n - limit;
}

function decodeBlock(
  zp: ZpDecoder,
  contexts: Uint8Array,
  blockSize: number,
): Uint8Array {
  // Скорость забывания частот кодируется двумя битами перед блоком.
  let freqShift = 0;
  if (zp.decodePassthrough()) {
    freqShift++;
    if (zp.decodePassthrough()) freqShift++;
  }

  const mtf = new Uint8Array(256);
  for (let i = 0; i < 256; i++) mtf[i] = i;
  const freq = new Uint32Array(FREQ_SLOTS);
  let freqAdd = 4;
  let lastPosition = 3;
  let markerAt = -1;

  const bwt = new Uint8Array(blockSize);

  for (let i = 0; i < blockSize; i++) {
    const ctxId = Math.min(lastPosition, LEVEL_CONTEXTS - 1);

    let position: number;
    let offset = 0;
    if (zp.decodeBit(contexts, offset + ctxId)) {
      position = 0;
    } else {
      offset += LEVEL_CONTEXTS;
      if (zp.decodeBit(contexts, offset + ctxId)) {
        position = 1;
      } else {
        offset += LEVEL_CONTEXTS;
        if (zp.decodeBit(contexts, offset)) {
          position = 2 + decodeContextBits(zp, contexts, offset + 1, 1);
        } else {
          offset += 2;
          if (zp.decodeBit(contexts, offset)) {
            position = 4 + decodeContextBits(zp, contexts, offset + 1, 2);
          } else {
            offset += 4;
            if (zp.decodeBit(contexts, offset)) {
              position = 8 + decodeContextBits(zp, contexts, offset + 1, 3);
            } else {
              offset += 8;
              if (zp.decodeBit(contexts, offset)) {
                position = 16 + decodeContextBits(zp, contexts, offset + 1, 4);
              } else {
                offset += 16;
                if (zp.decodeBit(contexts, offset)) {
                  position = 32 + decodeContextBits(zp, contexts, offset + 1, 5);
                } else {
                  offset += 32;
                  if (zp.decodeBit(contexts, offset)) {
                    position =
                      64 + decodeContextBits(zp, contexts, offset + 1, 6);
                  } else {
                    offset += 64;
                    if (zp.decodeBit(contexts, offset)) {
                      position =
                        128 + decodeContextBits(zp, contexts, offset + 1, 7);
                    } else {
                      position = 256;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    lastPosition = position;

    if (position === 256) {
      // Метка конца блока — она же точка входа обратного преобразования.
      bwt[i] = 0;
      markerAt = i;
      continue;
    }

    const symbol = mtf[position]!;
    bwt[i] = symbol;

    freqAdd += freqAdd >>> freqShift;
    if (freqAdd > 0x10000000) {
      freqAdd >>>= 24;
      for (let k = 0; k < FREQ_SLOTS; k++) freq[k]! >>>= 24;
    }

    let combined = freqAdd;
    if (position < FREQ_SLOTS) combined += freq[position]!;

    let insertAt = position;
    if (insertAt >= FREQ_SLOTS) {
      // Сдвигаем хвост вверх: символ уходит из глубины к началу списка.
      mtf.copyWithin(FREQ_SLOTS, FREQ_SLOTS - 1, insertAt);
      insertAt = FREQ_SLOTS - 1;
    }
    while (insertAt > 0 && combined >= freq[insertAt - 1]!) {
      mtf[insertAt] = mtf[insertAt - 1]!;
      freq[insertAt] = freq[insertAt - 1]!;
      insertAt--;
    }
    mtf[insertAt] = symbol;
    freq[insertAt] = combined;
  }

  if (markerAt < 0) throw new Error('BZZ: в блоке нет метки конца');
  return inverseBwt(bwt, markerAt);
}

/** Обратное преобразование Барроуза–Уилера. */
function inverseBwt(bwt: Uint8Array, markerAt: number): Uint8Array {
  const total = bwt.length;
  if (total === 0) return new Uint8Array(0);

  const counts = new Uint32Array(256);
  const rank = new Uint32Array(total);
  for (let i = 0; i < total; i++) {
    if (i === markerAt) continue;
    const value = bwt[i]!;
    rank[i] = ((value << 24) | (counts[value]! & 0x00ffffff)) >>> 0;
    counts[value]!++;
  }

  // Позиция 0 в отсортированном порядке занята меткой, поэтому счёт с единицы.
  const starts = new Uint32Array(256);
  let running = 1;
  for (let value = 0; value < 256; value++) {
    starts[value] = running;
    running += counts[value]!;
  }

  const outLength = total - 1;
  const out = new Uint8Array(outLength);
  let follow = 0;
  let remaining = outLength;
  while (remaining > 0) {
    const encoded = rank[follow]!;
    const value = encoded >>> 24;
    remaining--;
    out[remaining] = value;
    follow = starts[value]! + (encoded & 0x00ffffff);
  }
  return out;
}
