import 'package:flutter/material.dart';

/// Палитра в духе сербской вышивки (крестик): пергамент, сербский красный,
/// индиго, золото; тёплая «ночная» версия для тёмной темы.
class SerbColors {
  static const parchment = Color(0xFFF3E9D2);
  static const parchmentDark = Color(0xFFEADFC2);
  static const serbRed = Color(0xFF9E2B25);
  static const serbRedBright = Color(0xFFC23B33);
  static const indigo = Color(0xFF2E3B5B);
  static const indigoBright = Color(0xFF4A5B86);
  static const gold = Color(0xFFC9A24B);
  static const ink = Color(0xFF2B2118);

  static const nightBg = Color(0xFF161310);
  static const nightSurface = Color(0xFF221C16);
  static const nightSurface2 = Color(0xFF2C241C);
  static const nightText = Color(0xFFEDE2CC);
}

class AppTheme {
  static const uiFont = 'NotoSans';

  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: SerbColors.serbRed,
      onPrimary: Colors.white,
      secondary: SerbColors.indigo,
      onSecondary: Colors.white,
      tertiary: SerbColors.gold,
      surface: SerbColors.parchment,
      onSurface: SerbColors.ink,
      surfaceContainerHighest: SerbColors.parchmentDark,
    );
    return _base(scheme, SerbColors.parchment, SerbColors.parchmentDark);
  }

  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      primary: SerbColors.serbRedBright,
      onPrimary: Colors.white,
      secondary: SerbColors.indigoBright,
      onSecondary: Colors.white,
      tertiary: SerbColors.gold,
      surface: SerbColors.nightBg,
      onSurface: SerbColors.nightText,
      surfaceContainerHighest: SerbColors.nightSurface2,
    );
    return _base(scheme, SerbColors.nightBg, SerbColors.nightSurface);
  }

  static ThemeData _base(ColorScheme scheme, Color bg, Color card) {
    final isDark = scheme.brightness == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      fontFamily: uiFont,
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? SerbColors.nightSurface : SerbColors.serbRed,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: const TextStyle(
          fontFamily: uiFont,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
          color: Colors.white,
        ),
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: scheme.primary.withValues(alpha: 0.25)),
        ),
      ),
      dividerColor: scheme.primary.withValues(alpha: 0.25),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
      ),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: SerbColors.indigo,
        contentTextStyle: TextStyle(color: Colors.white, fontFamily: uiFont),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
      // Плавные переходы между экранами на всех платформах.
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.macOS: FadeUpwardsPageTransitionsBuilder(),
      }),
    );
  }
}
