import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Лёгкий тактильный отклик — только там, где он есть: на мобильных.
///
/// На десктопе и в вебе вызов молча ничего не делает. Проверка дешевле
/// вопроса «а почему на телефоне тихо», а случайный вызов на десктопе —
/// тишины там, где её и ждали.
void lightHaptic() {
  if (kIsWeb) return;
  final platform = defaultTargetPlatform;
  if (platform == TargetPlatform.android || platform == TargetPlatform.iOS) {
    HapticFeedback.lightImpact();
  }
}
