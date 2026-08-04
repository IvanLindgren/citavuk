import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../state/app_settings.dart';

/// Не даёт экрану гаснуть, пока потомок на экране.
///
/// Чтение и прослушивание — те редкие занятия, при которых экрана не касаются
/// минутами. Системный тайм-аут гасит его посреди страницы, и приходится
/// тыкать в экран каждые полминуты, чтобы просто дочитать абзац.
///
/// Обёртка, а не вызов в каждом экране, нужна по одной причине: удержание
/// обязано сниматься. Экран закрывается не только кнопкой «назад», но и
/// исключением при построении, и переходом по ссылке — забытый снаружи вызов
/// оставил бы телефон гореть до перезапуска приложения. Здесь снятие привязано
/// к времени жизни виджета и происходит само.
class KeepAwake extends StatefulWidget {
  const KeepAwake({super.key, required this.child});

  final Widget child;

  @override
  State<KeepAwake> createState() => _KeepAwakeState();
}

class _KeepAwakeState extends State<KeepAwake> {
  bool _held = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Настройку слушаем, а не читаем один раз: переключатель лежит в панели
    // настроек самой читалки, и он обязан срабатывать сразу.
    _apply(context.watch<AppSettings>().keepScreenOn);
  }

  @override
  void dispose() {
    if (_held) unawaited(WakelockPlus.disable());
    super.dispose();
  }

  void _apply(bool wanted) {
    if (wanted == _held) return;
    _held = wanted;
    // Ошибку глушим намеренно: на вебе Screen Wake Lock API есть не везде и
    // требует жеста пользователя. Экран, который всё-таки гаснет, — мелкое
    // неудобство, а падение читалки из-за него — нет.
    unawaited(
      (wanted ? WakelockPlus.enable() : WakelockPlus.disable())
          .catchError((_) {}),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
