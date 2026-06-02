import 'package:flutter/material.dart';

/// Тема приложения, выбираемая пользователем.
enum AppThemeMode { light, dark, system }

/// Шрифт для чтения (все три бандлятся в assets/fonts и покрывают
/// кириллицу + латиницу, поэтому «белых квадратов» больше нет).
enum ReaderFont { serif, lora, sans }

/// Уровень «диагонального»/бионического выделения основы слова.
enum BionicLevel { off, low, medium, high }

extension ReaderFontX on ReaderFont {
  String get family => switch (this) {
        ReaderFont.serif => 'NotoSerif',
        ReaderFont.lora => 'Lora',
        ReaderFont.sans => 'NotoSans',
      };

  String get label => switch (this) {
        ReaderFont.serif => 'С засечками',
        ReaderFont.lora => 'Lora',
        ReaderFont.sans => 'Без засечек',
      };
}

extension BionicLevelX on BionicLevel {
  /// Доля слова от начала, которую выделяем жирным.
  double get ratio => switch (this) {
        BionicLevel.off => 0.0,
        BionicLevel.low => 0.33,
        BionicLevel.medium => 0.5,
        BionicLevel.high => 0.66,
      };

  String get label => switch (this) {
        BionicLevel.off => 'Выкл',
        BionicLevel.low => 'Слабое',
        BionicLevel.medium => 'Среднее',
        BionicLevel.high => 'Сильное',
      };
}

extension AppThemeModeX on AppThemeMode {
  ThemeMode get material => switch (this) {
        AppThemeMode.light => ThemeMode.light,
        AppThemeMode.dark => ThemeMode.dark,
        AppThemeMode.system => ThemeMode.system,
      };

  String get label => switch (this) {
        AppThemeMode.light => 'Светлая',
        AppThemeMode.dark => 'Тёмная',
        AppThemeMode.system => 'Системная',
      };
}

/// Настройки чтения. Иммутабельны; меняются через copyWith и сохраняются
/// в SharedPreferences (см. AppSettings).
class ReaderSettings {
  final double fontSize;
  final double lineHeight;
  final double letterSpacing;
  final ReaderFont font;
  final BionicLevel bionic;
  final AppThemeMode themeMode;

  // Вёрстка абзаца
  final double paragraphSpacing; // отступ между абзацами
  final double firstLineIndent; // красная строка
  final bool justify; // выравнивание по ширине
  final double maxWidth; // комфортная ширина колонки (>=1100 => без ограничения)
  final int bgColor; // 0 => фон из темы; иначе ARGB-значение цвета

  const ReaderSettings({
    this.fontSize = 19,
    this.lineHeight = 1.6,
    this.letterSpacing = 0.2,
    this.font = ReaderFont.serif,
    this.bionic = BionicLevel.off,
    this.themeMode = AppThemeMode.light,
    this.paragraphSpacing = 16,
    this.firstLineIndent = 24,
    this.justify = true,
    this.maxWidth = 700,
    this.bgColor = 0,
  });

  /// true, если ширина колонки не ограничена.
  bool get fullWidth => maxWidth >= 1100;

  ReaderSettings copyWith({
    double? fontSize,
    double? lineHeight,
    double? letterSpacing,
    ReaderFont? font,
    BionicLevel? bionic,
    AppThemeMode? themeMode,
    double? paragraphSpacing,
    double? firstLineIndent,
    bool? justify,
    double? maxWidth,
    int? bgColor,
  }) =>
      ReaderSettings(
        fontSize: fontSize ?? this.fontSize,
        lineHeight: lineHeight ?? this.lineHeight,
        letterSpacing: letterSpacing ?? this.letterSpacing,
        font: font ?? this.font,
        bionic: bionic ?? this.bionic,
        themeMode: themeMode ?? this.themeMode,
        paragraphSpacing: paragraphSpacing ?? this.paragraphSpacing,
        firstLineIndent: firstLineIndent ?? this.firstLineIndent,
        justify: justify ?? this.justify,
        maxWidth: maxWidth ?? this.maxWidth,
        bgColor: bgColor ?? this.bgColor,
      );

  Map<String, dynamic> toMap() => {
        'fontSize': fontSize,
        'lineHeight': lineHeight,
        'letterSpacing': letterSpacing,
        'font': font.index,
        'bionic': bionic.index,
        'themeMode': themeMode.index,
        'paragraphSpacing': paragraphSpacing,
        'firstLineIndent': firstLineIndent,
        'justify': justify,
        'maxWidth': maxWidth,
        'bgColor': bgColor,
      };

  factory ReaderSettings.fromMap(Map<String, dynamic> m) {
    T pick<T>(List<T> values, dynamic idx, T fallback) {
      if (idx is int && idx >= 0 && idx < values.length) return values[idx];
      return fallback;
    }

    return ReaderSettings(
      fontSize: (m['fontSize'] as num?)?.toDouble() ?? 19,
      lineHeight: (m['lineHeight'] as num?)?.toDouble() ?? 1.6,
      letterSpacing: (m['letterSpacing'] as num?)?.toDouble() ?? 0.2,
      font: pick(ReaderFont.values, m['font'], ReaderFont.serif),
      bionic: pick(BionicLevel.values, m['bionic'], BionicLevel.off),
      themeMode: pick(AppThemeMode.values, m['themeMode'], AppThemeMode.light),
      paragraphSpacing: (m['paragraphSpacing'] as num?)?.toDouble() ?? 16,
      firstLineIndent: (m['firstLineIndent'] as num?)?.toDouble() ?? 24,
      justify: m['justify'] as bool? ?? true,
      maxWidth: (m['maxWidth'] as num?)?.toDouble() ?? 700,
      bgColor: (m['bgColor'] as num?)?.toInt() ?? 0,
    );
  }
}
