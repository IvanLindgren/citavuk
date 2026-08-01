/// Состояние временных событий на весь запуск приложения.
///
/// Держится в одном месте, потому что прогресс нужен трём несвязанным экранам:
/// баннеру в библиотеке, самому событию и настройкам чтения (награда-фон).
/// Загрузка идёт от локального хранилища, а сервер догоняется фоном: событие
/// обязано открываться офлайн.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'odyssey.dart';
import 'reader_rewards.dart';

class EventsController extends ChangeNotifier {
  EventsController({required ApiClient api, required this.auth})
      : _store = OdysseyStore(api: api, auth: auth) {
    auth.addListener(_onAuthChanged);
    _accountId = auth.account?.id ?? '';
  }

  final AuthService auth;
  final OdysseyStore _store;

  String _accountId = '';
  OdysseyProgress _odyssey = const OdysseyProgress();
  bool _syncing = false;

  OdysseyProgress get odyssey => _odyssey;

  /// Награды, доступные текущему аккаунту. Гость не получает ничего: прогресс
  /// события привязан к аккаунту.
  List<ReaderReward> get rewards =>
      _accountId.isEmpty ? const [] : unlockedRewards(_odyssey);

  bool hasReward(String id) => rewards.any((reward) => reward.id == id);

  /// Читает локальный прогресс и запускает слияние с сервером.
  Future<void> refresh() async {
    final id = _accountId;
    if (id.isEmpty) {
      if (_odyssey.completedChapters.isNotEmpty) {
        _odyssey = const OdysseyProgress();
        notifyListeners();
      }
      return;
    }

    _odyssey = await _store.loadLocal(id);
    notifyListeners();

    if (_syncing) return;
    _syncing = true;
    try {
      final merged = await _store.sync(id);
      // Аккаунт мог смениться, пока шёл запрос, — чужой прогресс не применяем.
      if (_accountId != id) return;
      _odyssey = merged;
      notifyListeners();
    } finally {
      _syncing = false;
    }
  }

  /// Закрывает песню и отправляет прогресс. Локальное сохранение не зависит от
  /// сети: закрытая офлайн песня не должна открываться заново.
  Future<void> completeOdysseyChapter(int chapter) async {
    final id = _accountId;
    if (id.isEmpty) return;
    final next = _odyssey.completeChapter(chapter);
    if (identical(next, _odyssey)) return;
    _odyssey = next;
    notifyListeners();
    await _store.saveLocal(id, next);
    await _store.upload(next);
  }

  Future<void> rememberOdysseyChapter(int chapter) async {
    final id = _accountId;
    if (id.isEmpty || _odyssey.lastChapter == chapter) return;
    _odyssey = _odyssey.rememberChapter(chapter);
    notifyListeners();
    await _store.saveLocal(id, _odyssey);
  }

  void _onAuthChanged() {
    final id = auth.account?.id ?? '';
    if (id == _accountId) return;
    _accountId = id;
    // Прогресс прежнего аккаунта убираем сразу, не дожидаясь чтения нового:
    // иначе на общем устройстве мелькнёт чужая награда.
    _odyssey = const OdysseyProgress();
    notifyListeners();
    unawaited(refresh().catchError((Object e) => debugPrint('events: $e')));
  }

  @override
  void dispose() {
    auth.removeListener(_onAuthChanged);
    super.dispose();
  }
}
