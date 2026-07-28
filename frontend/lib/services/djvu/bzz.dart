/// BZZ — распаковка текстовых и служебных блоков DjVu.
///
/// Три ступени: арифметический ZP-декодер, обратное преобразование
/// «переместить в начало» (MTF) и обратное преобразование Барроуза–Уилера.
/// Порт MIT-реализации djvu-rs (© 2026 Lev Matyushkin) по спецификации DjVu v3.
library;

import 'dart:typed_data';

import 'zp_decoder.dart';

/// Контекстов на блок нужно 262; берём с запасом.
const _contextCount = 300;

/// Сколько позиций MTF отслеживаются по частоте.
const _freqSlots = 4;

/// Контекстов на первые два уровня дерева позиций.
const _levelContexts = 3;

const _maxBlockSize = 4 * 1024 * 1024;
const _maxOutputSize = 64 * 1024 * 1024;

/// Распаковывает BZZ-поток.
Uint8List bzzDecode(Uint8List data) {
  final zp = ZpDecoder(data);
  final contexts = List<int>.filled(_contextCount, 0);
  final chunks = <Uint8List>[];
  var total = 0;

  while (true) {
    final blockSize = _decodeRawBits(zp, 24);
    if (blockSize == 0) break;
    if (blockSize > _maxBlockSize) {
      throw FormatException('BZZ: блок $blockSize байт слишком велик');
    }
    final block = _decodeBlock(zp, contexts, blockSize);
    total += block.length;
    if (total > _maxOutputSize) {
      throw const FormatException('BZZ: распакованные данные слишком велики');
    }
    chunks.add(block);
  }

  final out = Uint8List(total);
  var offset = 0;
  for (final chunk in chunks) {
    out.setRange(offset, offset + chunk.length, chunk);
    offset += chunk.length;
  }
  return out;
}

/// Целое число, записанное битами без контекста.
int _decodeRawBits(ZpDecoder zp, int bits) {
  final limit = 1 << bits;
  var n = 1;
  while (n < limit) {
    n = (n << 1) | (zp.decodePassthrough() ? 1 : 0);
  }
  return n - limit;
}

/// Число из поддерева контекстов, растущего от `base - 1`.
int _decodeContextBits(ZpDecoder zp, List<int> contexts, int base, int bits) {
  final offset = base - 1;
  final limit = 1 << bits;
  var n = 1;
  while (n < limit) {
    n = (n << 1) | (zp.decodeBit(contexts, offset + n) ? 1 : 0);
  }
  return n - limit;
}

Uint8List _decodeBlock(ZpDecoder zp, List<int> contexts, int blockSize) {
  // Скорость забывания частот кодируется двумя битами перед блоком.
  var freqShift = 0;
  if (zp.decodePassthrough()) {
    freqShift++;
    if (zp.decodePassthrough()) freqShift++;
  }

  final mtf = Uint8List(256);
  for (var i = 0; i < 256; i++) {
    mtf[i] = i;
  }
  final freq = List<int>.filled(_freqSlots, 0);
  var freqAdd = 4;
  var lastPosition = 3;
  var markerAt = -1;

  final bwt = Uint8List(blockSize);

  for (var i = 0; i < blockSize; i++) {
    final ctxId = lastPosition < _levelContexts - 1
        ? lastPosition
        : _levelContexts - 1;

    int position;
    var offset = 0;
    if (zp.decodeBit(contexts, offset + ctxId)) {
      position = 0;
    } else {
      offset += _levelContexts;
      if (zp.decodeBit(contexts, offset + ctxId)) {
        position = 1;
      } else {
        offset += _levelContexts;
        if (zp.decodeBit(contexts, offset)) {
          position = 2 + _decodeContextBits(zp, contexts, offset + 1, 1);
        } else {
          offset += 2;
          if (zp.decodeBit(contexts, offset)) {
            position = 4 + _decodeContextBits(zp, contexts, offset + 1, 2);
          } else {
            offset += 4;
            if (zp.decodeBit(contexts, offset)) {
              position = 8 + _decodeContextBits(zp, contexts, offset + 1, 3);
            } else {
              offset += 8;
              if (zp.decodeBit(contexts, offset)) {
                position = 16 + _decodeContextBits(zp, contexts, offset + 1, 4);
              } else {
                offset += 16;
                if (zp.decodeBit(contexts, offset)) {
                  position =
                      32 + _decodeContextBits(zp, contexts, offset + 1, 5);
                } else {
                  offset += 32;
                  if (zp.decodeBit(contexts, offset)) {
                    position =
                        64 + _decodeContextBits(zp, contexts, offset + 1, 6);
                  } else {
                    offset += 64;
                    if (zp.decodeBit(contexts, offset)) {
                      position =
                          128 + _decodeContextBits(zp, contexts, offset + 1, 7);
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

    if (position == 256) {
      // Метка конца блока — она же точка входа обратного преобразования.
      bwt[i] = 0;
      markerAt = i;
      continue;
    }

    final symbol = mtf[position];
    bwt[i] = symbol;

    freqAdd += freqAdd >> freqShift;
    if (freqAdd > 0x10000000) {
      freqAdd >>= 24;
      for (var k = 0; k < _freqSlots; k++) {
        freq[k] >>= 24;
      }
    }

    var combined = freqAdd;
    if (position < _freqSlots) combined += freq[position];

    var insertAt = position;
    if (insertAt >= _freqSlots) {
      // Сдвигаем хвост вверх: символ уходит из глубины к началу списка.
      mtf.setRange(_freqSlots, insertAt + 1, mtf, _freqSlots - 1);
      insertAt = _freqSlots - 1;
    }
    while (insertAt > 0 && combined >= freq[insertAt - 1]) {
      mtf[insertAt] = mtf[insertAt - 1];
      freq[insertAt] = freq[insertAt - 1];
      insertAt--;
    }
    mtf[insertAt] = symbol;
    freq[insertAt] = combined;
  }

  if (markerAt < 0) {
    throw const FormatException('BZZ: в блоке нет метки конца');
  }
  return _inverseBwt(bwt, markerAt);
}

/// Обратное преобразование Барроуза–Уилера.
Uint8List _inverseBwt(Uint8List bwt, int markerAt) {
  final total = bwt.length;
  if (total == 0) return Uint8List(0);

  final counts = Uint32List(256);
  final rank = Uint32List(total);
  for (var i = 0; i < total; i++) {
    if (i == markerAt) continue;
    final value = bwt[i];
    rank[i] = (value << 24) | (counts[value] & 0x00ffffff);
    counts[value]++;
  }

  // Позиция 0 в отсортированном порядке занята меткой, поэтому счёт с единицы.
  final starts = Uint32List(256);
  var running = 1;
  for (var value = 0; value < 256; value++) {
    starts[value] = running;
    running += counts[value];
  }

  final outLength = total - 1;
  final out = Uint8List(outLength);
  var follow = 0;
  var remaining = outLength;
  while (remaining > 0) {
    final encoded = rank[follow];
    final value = encoded >> 24;
    remaining--;
    out[remaining] = value;
    follow = starts[value] + (encoded & 0x00ffffff);
  }
  return out;
}
