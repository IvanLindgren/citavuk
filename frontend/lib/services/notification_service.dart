/// Напоминания о повторении карточек.
///
/// Плагин уведомлений работает только на телефоне, поэтому на десктопе и в вебе
/// вызовы молча ничего не делают, а раздел настроек там не показывается.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  static const _channelId = 'citavuk_reviews';
  static const _reminderId = 1001;

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  /// Уведомления есть только на телефоне.
  bool get supported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  Future<void> init() async {
    if (!supported || _ready) return;
    try {
      // Время считается в поясе устройства: «каждый день в 19:00» без пояса
      // превратилось бы в 19:00 UTC.
      tz_data.initializeTimeZones();
      final zone = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(zone.identifier));

      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
      );
      _ready = true;
    } catch (e) {
      debugPrint('уведомления недоступны: $e');
    }
  }

  /// Разрешение спрашивается при включении напоминаний, а не при запуске.
  Future<bool> requestPermission() async {
    if (!supported) return false;
    await init();
    try {
      if (defaultTargetPlatform == TargetPlatform.android) {
        final android = _plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        return await android?.requestNotificationsPermission() ?? false;
      }
      final ios = _plugin.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      return await ios?.requestPermissions(alert: true, sound: true) ?? false;
    } catch (e) {
      debugPrint('не удалось запросить разрешение: $e');
      return false;
    }
  }

  /// Ежедневное напоминание в заданное время.
  Future<void> scheduleDailyReminder(int hour, int minute) async {
    if (!supported) return;
    await init();
    if (!_ready) return;

    try {
      await _plugin.cancel(id: _reminderId);
      await _plugin.zonedSchedule(
        id: _reminderId,
        title: 'Пора повторить слова',
        body: 'Читавук ждёт: карточки подошли к повторению.',
        scheduledDate: _nextInstance(hour, minute),
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            'Повторение карточек',
            channelDescription: 'Ежедневное напоминание повторить слова',
            importance: Importance.defaultImportance,
            priority: Priority.defaultPriority,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        // Точный будильник требует отдельного разрешения и на части прошивок
        // недоступен; напоминанию хватает приблизительного времени.
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.time,
      );
    } catch (e) {
      debugPrint('не удалось назначить напоминание: $e');
    }
  }

  /// Ближайшее наступление времени: сегодня, если ещё не прошло.
  tz.TZDateTime _nextInstance(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var when =
        tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!when.isAfter(now)) when = when.add(const Duration(days: 1));
    return when;
  }

  Future<void> cancelAll() async {
    if (!supported || !_ready) return;
    try {
      await _plugin.cancelAll();
    } catch (e) {
      debugPrint('не удалось отменить напоминания: $e');
    }
  }
}
