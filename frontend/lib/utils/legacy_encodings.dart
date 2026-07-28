/// Декодирование однобайтовых кодировок.
///
/// Нужно для FB2: большая часть библиотек до сих пор отдаёт файлы в
/// windows-1251, а dart:convert знает только UTF-8 и Latin-1.
library;

import 'dart:convert';
import 'dart:typed_data';

/// Верхняя половина windows-1251 (0x80..0xFF).
const _cp1251 =
    'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ'
    ' ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї'
    'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'
    'абвгдежзийклмнопрстуфхцчшщъыьэюя';

/// Верхняя половина windows-1252 (0x80..0xFF).
const _cp1252 =
    '€�‚ƒ„…†‡ˆ‰Š‹Œ�Ž��‘’“”•–—˜™š›œ�žŸ'
    ' ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿'
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß'
    'àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';

/// Верхняя половина windows-1250 (0x80..0xFF) — сербская латиница в старых
/// файлах: č, ć, ž, š, đ.
const _cp1250 =
    '€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź'
    ' ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľż'
    'ŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢß'
    'ŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙';

const _tables = {
  'windows-1251': _cp1251,
  'cp1251': _cp1251,
  'windows-1252': _cp1252,
  'cp1252': _cp1252,
  'windows-1250': _cp1250,
  'cp1250': _cp1250,
};

/// Знает ли декодер такую кодировку.
bool isKnownEncoding(String name) {
  final key = name.trim().toLowerCase();
  return key.startsWith('utf-8') ||
      key.startsWith('utf8') ||
      key == 'us-ascii' ||
      key == 'ascii' ||
      key == 'iso-8859-1' ||
      key == 'latin1' ||
      _tables.containsKey(key);
}

/// Декодирует байты в строку. Незнакомая кодировка читается как UTF-8.
String decodeBytes(Uint8List bytes, String encoding) {
  final key = encoding.trim().toLowerCase();
  final table = _tables[key];
  if (table != null) {
    final out = StringBuffer();
    for (final b in bytes) {
      out.writeCharCode(b < 0x80 ? b : table.codeUnitAt(b - 0x80));
    }
    return out.toString();
  }
  if (key == 'iso-8859-1' || key == 'latin1') return latin1.decode(bytes);
  return utf8.decode(bytes, allowMalformed: true);
}

/// Кодировка из XML-декларации: `<?xml version="1.0" encoding="windows-1251"?>`.
///
/// Ищется в первых байтах и по ASCII: до определения кодировки декодировать
/// нечем.
String? xmlDeclaredEncoding(Uint8List bytes) {
  final head = String.fromCharCodes(
      bytes.take(200).map((b) => b < 0x80 ? b : 0x20));
  final match =
      RegExp(r'''encoding\s*=\s*["']([\w.-]+)["']''').firstMatch(head);
  return match?.group(1);
}

/// Декодирует XML-файл, уважая BOM и объявленную кодировку.
String decodeXmlBytes(Uint8List bytes) {
  if (bytes.length >= 3 &&
      bytes[0] == 0xEF &&
      bytes[1] == 0xBB &&
      bytes[2] == 0xBF) {
    return utf8.decode(bytes.sublist(3), allowMalformed: true);
  }
  final declared = xmlDeclaredEncoding(bytes);
  final text = decodeBytes(bytes, declared ?? 'utf-8');
  // Декларация осталась бы врать про кодировку уже декодированной строки.
  return text.replaceFirst(
      RegExp(r'''\s+encoding\s*=\s*["'][\w.-]+["']'''), '');
}
