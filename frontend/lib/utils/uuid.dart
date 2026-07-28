import 'dart:math';

/// Генератор UUID версии 4.
///
/// Пакет `uuid` сюда не добавляется намеренно: нужна ровно одна функция, а
/// список зависимостей в этом проекте приходится держать коротким — сборка под
/// Windows уже ломалась из-за транзитивных плагинов (см. закреплённый
/// `path_provider_android` в pubspec.yaml).
final _random = Random.secure();

/// Возвращает UUID v4 в каноническом виде `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
///
/// Источник случайности — [Random.secure]: идентификаторы записей уходят на
/// сервер, и предсказуемая последовательность позволила бы угадывать чужие.
String newUuid() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));

  // Версия 4 и вариант RFC 4122 задаются фиксированными битами.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Проверяет, что строка похожа на UUID.
///
/// Нужна при приёме данных с сервера: идентификатор подставляется в запросы,
/// и пропускать в базу произвольную строку не следует.
bool isUuid(String value) {
  if (value.length != 36) return false;
  for (var i = 0; i < 36; i++) {
    final c = value.codeUnitAt(i);
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != 0x2d) return false; // '-'
      continue;
    }
    final isDigit = c >= 0x30 && c <= 0x39;
    final isLower = c >= 0x61 && c <= 0x66;
    final isUpper = c >= 0x41 && c <= 0x46;
    if (!isDigit && !isLower && !isUpper) return false;
  }
  return true;
}
