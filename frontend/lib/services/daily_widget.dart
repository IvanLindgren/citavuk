import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Виджет слов дня на рабочем столе Андроида.
///
/// Данные виджет читает сам — из тех же настроек, куда их кладёт
/// [DailyService]. Отсюда уходит только команда перерисоваться: без неё виджет
/// ждал бы следующего получасового обновления системы и показывал вчерашнее.
class DailyWidget {
  const DailyWidget._();

  static const _channel = MethodChannel('citavuk/daily_widget');

  /// Есть ли виджет на этой платформе. Он только на Андроиде: на Windows и в
  /// вебе рабочего стола с виджетами нет.
  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<void> refresh() async {
    if (!supported) return;
    try {
      // Ответа может не быть вовсе: канал живёт в MainActivity, и в тестах или
      // в фоновом изоляте его никто не слушает. Без срока ожидание повисло бы
      // навсегда, а вместе с ним — и всё, что его дождалось.
      await _channel
          .invokeMethod<bool>('refresh')
          .timeout(const Duration(seconds: 2));
    } on MissingPluginException {
      // Старая сборка без нативной части: виджета просто нет, и это не ошибка.
    } on PlatformException {
      // Перерисовка виджета не стоит того, чтобы ронять экран слов.
    } on TimeoutException {
      // Виджет обновится сам при следующем системном такте.
    }
  }
}
