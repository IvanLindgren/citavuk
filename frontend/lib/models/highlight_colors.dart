import 'package:flutter/material.dart';

/// Цвета выделения в читалке. Ключи и оттенки совпадают с сайтом
/// (web/src/components/HighlightPicker.tsx): выделение синхронизируется, и на
/// обоих устройствах оно должно выглядеть одинаково. Пустой ключ —
/// подчёркивание, как было до цветов.
class HighlightColors {
  HighlightColors._();

  static const keys = ['yellow', 'green', 'blue', 'purple', 'red'];

  static const _dots = {
    'yellow': Color(0xFFFACC15),
    'green': Color(0xFF4ADE80),
    'blue': Color(0xFF60A5FA),
    'purple': Color(0xFFC084FC),
    'red': Color(0xFFF87171),
  };

  static const _alpha = {
    'yellow': 0.42,
    'green': 0.36,
    'blue': 0.36,
    'purple': 0.36,
    'red': 0.38,
  };

  static const labels = {
    'yellow': 'Жёлтый',
    'green': 'Зелёный',
    'blue': 'Синий',
    'purple': 'Фиолетовый',
    'red': 'Красный',
  };

  /// Незнакомый цвет от будущей версии превращается в подчёркивание.
  static String sanitize(Object? value) =>
      value is String && _dots.containsKey(value) ? value : '';

  static Color dot(String key) => _dots[key] ?? Colors.transparent;

  /// Полупрозрачный маркер: текст под ним читается на любой теме.
  static Color? marker(String key) {
    final base = _dots[key];
    return base?.withValues(alpha: _alpha[key]);
  }
}
