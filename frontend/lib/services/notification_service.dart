/// Заглушка сервиса уведомлений.
///
/// Нативный плагин (`flutter_local_notifications`) временно убран: его
/// транзитивная зависимость `jni` ломает нативную сборку под Windows —
/// платформу, на которой сейчас идёт разработка. API сохранён, чтобы остальной
/// код (настройки, диалог напоминаний) не менялся. Для мобильной сборки плагин
/// вернём отдельно (там Windows-конфликта нет).
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  /// Сейчас уведомления нигде не активны (плагин отключён).
  bool get supported => false;

  Future<void> init() async {}

  Future<bool> requestPermission() async => false;

  Future<void> scheduleDailyReminder(int hour, int minute) async {}

  Future<void> cancelAll() async {}
}
