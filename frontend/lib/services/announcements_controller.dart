import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/server_announcement.dart';
import 'api_client.dart';
import 'auth_service.dart';

class AnnouncementsController extends ChangeNotifier {
  AnnouncementsController({required this.api, required this.auth}) {
    _accountId = auth.account?.id ?? '';
    auth.addListener(_onAuthChanged);
  }

  final ApiClient api;
  final AuthService auth;

  static const _cachePrefix = 'citavuk_server_messages_v1_';
  String _accountId = '';
  bool _busy = false;
  List<ServerAnnouncement> _announcements = const [];
  List<ServerNotification> _notifications = const [];

  bool get busy => _busy;
  List<ServerAnnouncement> get announcements => _announcements;
  List<ServerNotification> get notifications => _notifications;
  int get unreadCount => _notifications.where((item) => !item.read).length;
  Set<String> get rewardKeys => {
        for (final item in _announcements)
          if (item.claimed && item.rewardKey.isNotEmpty) item.rewardKey,
      };
  Map<String, String> get rewardAssets => {
        for (final item in _announcements)
          if (item.claimed && item.rewardKey.isNotEmpty)
            item.rewardKey: item.rewardAssetUrl,
      };

  ServerAnnouncement? get banner {
    for (final item in _announcements) {
      if (item.bannerEnabled && !item.dismissed) return item;
    }
    return null;
  }

  Future<void> refresh() async {
    await _loadCache();
    if (_busy) return;
    _busy = true;
    notifyListeners();
    try {
      final response = await api.get('/v1/announcements');
      if (response is Map<String, dynamic>) {
        _announcements = _items(response['items'], ServerAnnouncement.fromJson);
      }
      if (auth.isSignedIn) {
        final response =
            await api.get('/v1/notifications', query: {'limit': '50'});
        if (response is Map<String, dynamic>) {
          _notifications =
              _items(response['items'], ServerNotification.fromJson);
        }
      } else {
        _notifications = const [];
      }
      await _saveCache();
      notifyListeners();
    } on ApiException catch (error) {
      if (!error.isOffline) rethrow;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> markAnnouncementRead(String id) async {
    _replaceAnnouncement(id, (item) => item.copyWith(read: true));
    if (auth.isSignedIn) {
      await api.post('/v1/announcements/$id/read', null);
    }
    await _saveCache();
  }

  Future<void> dismissAnnouncement(String id) async {
    _replaceAnnouncement(
        id, (item) => item.copyWith(read: true, dismissed: true));
    if (auth.isSignedIn) {
      await api.post('/v1/announcements/$id/dismiss', null);
    }
    await _saveCache();
  }

  Future<void> claim(String id, String network, String proofUrl) async {
    if (!auth.isSignedIn) {
      throw ApiException('Чтобы получить фон, войдите в аккаунт.');
    }
    await api.post('/v1/announcements/$id/claim', {
      'socialNetwork': network,
      'proofUrl': proofUrl.trim(),
    });
    _replaceAnnouncement(
        id, (item) => item.copyWith(read: true, claimed: true));
    await _saveCache();
  }

  Future<void> markNotificationRead(String id) async {
    _notifications = [
      for (final item in _notifications)
        item.id == id ? item.copyWith(read: true) : item,
    ];
    notifyListeners();
    await api.post('/v1/notifications/$id/read', null);
    await _saveCache();
  }

  Future<void> markAllNotificationsRead() async {
    _notifications = [
      for (final item in _notifications) item.copyWith(read: true)
    ];
    notifyListeners();
    if (auth.isSignedIn) await api.post('/v1/notifications/read-all', null);
    await _saveCache();
  }

  void _replaceAnnouncement(
    String id,
    ServerAnnouncement Function(ServerAnnouncement) update,
  ) {
    _announcements = [
      for (final item in _announcements) item.id == id ? update(item) : item,
    ];
    notifyListeners();
  }

  List<T> _items<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => parse(Map<String, dynamic>.from(item)))
        .toList(growable: false);
  }

  String get _cacheKey =>
      '$_cachePrefix${_accountId.isEmpty ? 'guest' : _accountId}';

  Future<void> _loadCache() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_cacheKey);
      if (raw == null) return;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      _announcements =
          _items(json['announcements'], ServerAnnouncement.fromJson);
      _notifications =
          _items(json['notifications'], ServerNotification.fromJson);
      notifyListeners();
    } catch (_) {
      // Повреждённый кеш не должен мешать открыть приложение офлайн.
    }
  }

  Future<void> _saveCache() async {
    final json = jsonEncode({
      'announcements': _announcements.map((item) => item.toJson()).toList(),
      'notifications': _notifications.map((item) => item.toJson()).toList(),
    });
    await (await SharedPreferences.getInstance()).setString(_cacheKey, json);
  }

  void _onAuthChanged() {
    final next = auth.account?.id ?? '';
    if (next == _accountId) return;
    _accountId = next;
    _announcements = const [];
    _notifications = const [];
    notifyListeners();
    unawaited(refresh().catchError(
      (Object error) => debugPrint('announcements: $error'),
    ));
  }

  @override
  void dispose() {
    auth.removeListener(_onAuthChanged);
    super.dispose();
  }
}
