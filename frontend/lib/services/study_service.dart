import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/uuid.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'daily_service.dart';
import 'daily_widget.dart';

/// Один серверный календарь; офлайн-очередь разделена по владельцу и очищается
/// только после подтверждения. Старые ответы не пишут в виджет нового аккаунта.
class StudyService extends ChangeNotifier {
  StudyService._();
  static final instance = StudyService._();
  AuthService? _auth;
  String? _owner;
  int _epoch = 0;
  bool _flushing = false;
  Future<void> _writes = Future.value();
  Map<String, dynamic>? snapshot;
  int celebration = 0;
  int get accountEpoch => _epoch;
  void configure(AuthService auth) {
    _auth?.removeListener(_accountChanged);
    _auth = auth;
    auth.addListener(_accountChanged);
    _accountChanged();
  }

  void _accountChanged() {
    final next = _auth?.isSignedIn == true ? _auth?.account?.id : null;
    if (next == _owner) return;
    _owner = next;
    _epoch++;
    snapshot = null;
    notifyListeners();
    if (next != null) unawaited(refresh());
  }

  String _queueKey(String id) => 'citavuk-study-outbox-v1:$id';
  String _cacheKey(String id) => 'citavuk-study-v1:$id';
  Future<void> refresh() async {
    final auth = _auth, owner = _owner, epoch = _epoch;
    if (auth == null || owner == null) return;
    final api = auth.api.withSessionToken(auth.api.token ?? '');
    try {
      final prefs = await SharedPreferences.getInstance();
      if (epoch != _epoch) return;
      final cached = prefs.getString(_cacheKey(owner));
      if (snapshot == null && cached != null) {
        snapshot = jsonDecode(cached) as Map<String, dynamic>;
        notifyListeners();
      }
      // Сначала пояс устройства. У старой активной серии сервер сохраняет
      // закреплённый пояс; 409 не является ошибкой самой синхронизации.
      try {
        final zone = await FlutterTimezone.getLocalTimezone();
        await api.put('/v1/study', {'timezone': zone.identifier},
            timeout: const Duration(seconds: 8));
      } on ApiException catch (e) {
        if (e.status != 409) rethrow;
      }
      final data = Map<String, dynamic>.from(await api.get('/v1/study',
          timeout: const Duration(seconds: 8)) as Map);
      await accept(data, token: api.token);
      unawaited(_flush());
    } catch (_) {/* Офлайн остаётся последний снимок, без выдуманной серии. */}
  }

  Future<void> record(String source, String reference,
      {int answered = 1, int? accountEpoch}) {
    if (accountEpoch != null && accountEpoch != _epoch) return Future.value();
    final owner = _owner, epoch = _epoch;
    if (owner == null || answered < 1 || answered > 1000 || reference.trim().isEmpty) return Future.value();
    final event = {
      'eventId': newUuid(),
      'source': source,
      'reference': reference.length > 200 ? reference.substring(0, 200) : reference,
      'answered': answered,
      'occurredAt': DateTime.now().toUtc().toIso8601String()
    };
    _writes = _writes.then((_) async {
      final prefs = await SharedPreferences.getInstance();
      final items = _readQueue(prefs, owner);
      items.add(event);
      // Достаточно для двух суток офлайна; ограничение не даёт раздувать prefs.
      if (items.length > 300) items.removeRange(0, items.length - 300);
      await prefs.setString(_queueKey(owner), jsonEncode(items));
      if (epoch == _epoch) unawaited(_flush());
    }).catchError((Object e) {
      debugPrint('study: очередь не сохранена: $e');
    });
    return _writes;
  }

  List<Map<String, dynamic>> _readQueue(SharedPreferences prefs, String owner) {
    try {
      return (jsonDecode(prefs.getString(_queueKey(owner)) ?? '[]') as List)
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _flush() async {
    if (_flushing) return;
    final auth = _auth, owner = _owner, epoch = _epoch;
    if (auth == null || owner == null) return;
    _flushing = true;
    final api = auth.api.withSessionToken(auth.api.token ?? '');
    try {
      while (epoch == _epoch) {
        await _writes;
        final prefs = await SharedPreferences.getInstance();
        final pending = _readQueue(prefs, owner);
        if (pending.isEmpty) break;
        final event = pending.first;
        try {
          final data = Map<String, dynamic>.from(await api.post(
              '/v1/study/attempts', event,
              timeout: const Duration(seconds: 8)) as Map);
          await accept(data, token: api.token, userAction: true);
        } on ApiException catch (e) {
          // Повтор запроса с испорченным телом ничего не исправит; он не
          // должен задерживать корректные события, стоящие следом.
          if (e.status != 400 && e.status != 422) rethrow;
        }
        _writes = _writes.then((_) async {
          final all = _readQueue(prefs, owner)
            ..removeWhere((e) => e['eventId'] == event['eventId']);
          await prefs.setString(_queueKey(owner), jsonEncode(all));
        });
        await _writes;
      }
    } catch (_) {
      /* Не снимаем событие до ack. Следующий вход/ответ повторит. */
    } finally {
      _flushing = false;
      if (epoch != _epoch && _owner != null) unawaited(_flush());
    }
  }

  Future<void> accept(Map<String, dynamic> data,
      {required String? token, bool userAction = false}) async {
    if (_owner == null || token == null || token != _auth?.api.token) return;
    final owner = _owner!, epoch = _epoch;
    final prefs = await SharedPreferences.getInstance();
    if (epoch != _epoch) return;
    final momentKey = 'citavuk-study-moment-v1:$owner';
    // Один эпизод на устройстве после настоящего ответа. Синхронизация SRS
    // могла уже зачесть день раньше этого ответа; GET сам сцену не запускает.
    if (userAction && data['todayActive'] == true && data['today'] is String &&
        prefs.getString(momentKey) != data['today'] &&
        (snapshot?['today'] == null || data['today'] == snapshot?['today'])) {
      await prefs.setString(momentKey, data['today'] as String);
      if (epoch != _epoch) return;
      celebration++;
    }
    final incoming = DateTime.tryParse('${data['asOf']}');
    final previous = DateTime.tryParse('${snapshot?['asOf']}');
    if (incoming != null && previous != null && incoming.isBefore(previous)) {
      notifyListeners();
      return;
    }
    snapshot = data;
    notifyListeners();
    if (epoch != _epoch) return;
    await prefs.setString(_cacheKey(owner), jsonEncode(data));
    if (epoch != _epoch) return;
    final raw = prefs.getString(DailyService.cacheKey);
    try {
      var daily = raw == null
          ? <String, dynamic>{}
          : jsonDecode(raw) as Map<String, dynamic>;
      // Не переименовываем чужой слепок: иначе в новом аккаунте окажутся
      // слова прежнего владельца, хотя счётчик серии уже правильный.
      if (daily['ownerID'] != owner) daily = <String, dynamic>{};
      final progress =
          Map<String, dynamic>.from(daily['progress'] as Map? ?? {});
      progress['streak'] = data['current'];
      progress['freezes'] = data['freezes'];
      daily['progress'] = progress;
      daily['ownerID'] = owner;
      daily['day'] = data['today'];
      await prefs.setString(DailyService.cacheKey, jsonEncode(daily));
      if (epoch == _epoch) unawaited(DailyWidget.refresh());
    } catch (_) {/* Старый повреждённый снимок обновится загрузкой слов дня. */}
  }
}
