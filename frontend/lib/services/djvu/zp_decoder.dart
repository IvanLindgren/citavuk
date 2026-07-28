/// ZP — адаптивный двоичный арифметический декодер формата DjVu.
///
/// Порт MIT-реализации djvu-rs (© 2026 Lev Matyushkin), написанной по открытой
/// спецификации DjVu v3. Контекст — один байт: младший бит хранит текущий
/// старший символ, остальные — состояние вероятностной модели.
library;

import 'dart:typed_data';

import 'zp_tables.dart';

class ZpDecoder {
  ZpDecoder(this.data) {
    if (data.length < 2) {
      throw const FormatException('ZP: поток короче двух байт');
    }
    c = (_readByte() << 8) | _readByte();
    _refill();
    fence = c < 0x7fff ? c : 0x7fff;
  }

  final Uint8List data;

  int a = 0;
  int c = 0;
  int fence = 0;
  int bitBuf = 0;
  int bitCount = 0;
  int pos = 0;

  /// Сколько байт дочитано за концом потока. Исправный поток добирает единицы
  /// байт; сотни означают, что декодер крутится на пустом месте.
  int get syntheticBytes => pos > data.length ? pos - data.length : 0;

  int _readByte() {
    final byte = pos < data.length ? data[pos] : 0xff;
    pos++;
    return byte;
  }

  void _refill() {
    while (bitCount <= 24) {
      bitBuf = ((bitBuf << 8) | _readByte()) & 0xffffffff;
      bitCount += 8;
    }
  }

  /// Сдвиг влево до a >= 0x8000 с подкачкой битов.
  void _renormalize() {
    var shift = 0;
    var value = a & 0xffff;
    while (shift < 16 && (value & 0x8000) != 0) {
      value = (value << 1) & 0xffff;
      shift++;
    }
    bitCount -= shift;
    a = (a << shift) & 0xffff;
    final mask = (1 << shift) - 1;
    c = ((c << shift) | ((bitBuf >> bitCount) & mask)) & 0xffff;
    if (bitCount < 16) _refill();
    fence = c < 0x7fff ? c : 0x7fff;
  }

  /// Декодирует бит по адаптивному контексту. Контекст обновляется на месте.
  bool decodeBit(List<int> contexts, int index) {
    final state = contexts[index];
    final mps = state & 1;
    final z = a + zpProb[state];

    if (z <= fence) {
      a = z;
      return mps != 0;
    }

    final boundary = 0x6000 + ((a + z) >> 2);
    final clamped = z < boundary ? z : boundary;

    if (clamped > c) {
      final complement = 0x10000 - clamped;
      a = (a + complement) & 0xffff;
      c = (c + complement) & 0xffff;
      contexts[index] = zpLpsNext[state];
      _renormalize();
      return mps == 0;
    }

    if (a >= zpThreshold[state]) contexts[index] = zpMpsNext[state];
    bitCount--;
    a = (clamped << 1) & 0xffff;
    c = ((c << 1) | ((bitBuf >> bitCount) & 1)) & 0xffff;
    if (bitCount < 16) _refill();
    fence = c < 0x7fff ? c : 0x7fff;
    return mps != 0;
  }

  /// Декодирует бит без контекста — так пишутся размеры блоков.
  bool decodePassthrough() {
    final z = (0x8000 + (a >> 1)) & 0xffff;
    if (z > c) {
      final complement = 0x10000 - z;
      a = (a + complement) & 0xffff;
      c = (c + complement) & 0xffff;
      _renormalize();
      return true;
    }
    bitCount--;
    a = (z * 2) & 0xffff;
    c = ((c << 1) | ((bitBuf >> bitCount) & 1)) & 0xffff;
    if (bitCount < 16) _refill();
    fence = c < 0x7fff ? c : 0x7fff;
    return false;
  }
}
