/// Детерминированное перемешивание для упражнений.
///
/// Перемешивание обязано быть воспроизводимым в пределах попытки: иначе
/// восстановленный урок покажет другой набор плиток, чем был до перезапуска
/// (master-prompt §6.5, §25).
library;

import 'dart:math';

/// Стабильный seed из строки — чтобы у каждого упражнения был свой,
/// не зависящий от хеш-функции рантайма, порядок.
int seedFromString(String value) {
  // FNV-1a, 32 бита: детерминирован между запусками и платформами, в отличие
  // от String.hashCode.
  var hash = 0x811c9dc5;
  for (final unit in value.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0x7fffffff;
  }
  return hash;
}

/// Перемешивает копию списка по заданному seed.
List<T> seededShuffle<T>(List<T> items, int seed) {
  final out = List<T>.of(items);
  final random = Random(seed);
  for (var i = out.length - 1; i > 0; i--) {
    final j = random.nextInt(i + 1);
    final tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/// Перемешивает буквы так, чтобы не оставить готовый правильный ответ.
///
/// [original] — порядок букв правильной формы, [pool] — то, что показываем
/// (правильные буквы плюс лишние). Если после перемешивания начало [pool]
/// случайно совпало с [original], seed увеличивается и попытка повторяется.
List<T> shuffleAvoidingOriginal<T>(
  List<T> pool,
  List<T> original,
  int seed, {
  bool Function(T a, T b)? equals,
}) {
  final same = equals ?? (a, b) => a == b;
  if (pool.length < 2) return List<T>.of(pool);

  for (var attempt = 0; attempt < 8; attempt++) {
    final shuffled = seededShuffle(pool, seed + attempt);
    if (!_startsWith(shuffled, original, same)) return shuffled;
  }
  // Крайний случай (например, все буквы одинаковые): меняем два первых
  // элемента местами, чтобы не отдавать пользователю готовый ответ.
  final fallback = seededShuffle(pool, seed);
  if (fallback.length >= 2) {
    final tmp = fallback[0];
    fallback[0] = fallback[1];
    fallback[1] = tmp;
  }
  return fallback;
}

bool _startsWith<T>(List<T> haystack, List<T> prefix, bool Function(T, T) eq) {
  if (prefix.isEmpty || haystack.length < prefix.length) return false;
  for (var i = 0; i < prefix.length; i++) {
    if (!eq(haystack[i], prefix[i])) return false;
  }
  return true;
}
