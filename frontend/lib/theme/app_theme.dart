import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Палитра в духе сербской вышивки (крестик): пергамент, сербский красный,
/// индиго, золото; тёплая «ночная» версия для тёмной темы.
class SerbColors {
  static const parchment = Color(0xFFF7EFDC);
  static const parchmentDark = Color(0xFFEADFC2);
  static const serbRed = Color(0xFF9E2B25);
  static const serbRedBright = Color(0xFFC23B33);
  static const indigo = Color(0xFF2E3B5B);
  static const indigoBright = Color(0xFF4A5B86);
  static const gold = Color(0xFFC9A24B);
  static const ink = Color(0xFF2B2118);

  /// Успех. Золото для «верно» не годится — читается как предупреждение.
  static const success = Color(0xFF3F7A43);
  static const successBright = Color(0xFF6FB275);

  static const nightBg = Color(0xFF161310);
  static const nightSurface = Color(0xFF221C16);
  static const nightSurface2 = Color(0xFF2C241C);
  static const nightText = Color(0xFFEDE2CC);
}

extension SuccessColor on ColorScheme {
  Color get success => brightness == Brightness.dark
      ? SerbColors.successBright
      : SerbColors.success;
}

class AppTheme {
  static const uiFont = 'NotoSans';

  /// Скругления. Одно место на всё приложение — иначе радиусы разъезжаются.
  static const radiusCard = 18.0;
  static const radiusButton = 14.0;
  static const radiusSheet = 26.0;

  static ThemeData light() {
    // Роли заполнены целиком намеренно: ColorScheme.light() достраивает
    // незаданные своей дефолтной палитрой, и меню, диалоги и чипы выезжали
    // сиренево-серыми поверх пергамента.
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: SerbColors.serbRed,
      onPrimary: Colors.white,
      primaryContainer: Color(0xFFF6DAD4),
      onPrimaryContainer: Color(0xFF5C120E),
      secondary: SerbColors.indigo,
      onSecondary: Colors.white,
      secondaryContainer: Color(0xFFDCE2F0),
      onSecondaryContainer: Color(0xFF1B2440),
      tertiary: Color(0xFF8A6A1F),
      onTertiary: Colors.white,
      tertiaryContainer: Color(0xFFF5E4BE),
      onTertiaryContainer: Color(0xFF4A3708),
      error: Color(0xFFA3271F),
      onError: Colors.white,
      errorContainer: Color(0xFFF7D9D6),
      onErrorContainer: Color(0xFF52100C),
      surface: SerbColors.parchment,
      onSurface: SerbColors.ink,
      onSurfaceVariant: Color(0xFF5C4F41),
      surfaceContainerLowest: Color(0xFFFFFBF2),
      surfaceContainerLow: Color(0xFFFAF3E4),
      surfaceContainer: Color(0xFFF2E8D3),
      surfaceContainerHigh: Color(0xFFECE0C9),
      surfaceContainerHighest: SerbColors.parchmentDark,
      surfaceTint: SerbColors.serbRed,
      outline: Color(0xFFA08E77),
      outlineVariant: Color(0xFFD9CBB2),
      shadow: Color(0xFF2B2118),
      scrim: Color(0xFF2B2118),
      inverseSurface: Color(0xFF322A21),
      onInverseSurface: Color(0xFFF7EFDC),
      inversePrimary: Color(0xFFF0A79F),
    );
    return _base(scheme);
  }

  static ThemeData dark() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: SerbColors.serbRedBright,
      onPrimary: Colors.white,
      primaryContainer: Color(0xFF5E1B16),
      onPrimaryContainer: Color(0xFFF6D6D2),
      secondary: SerbColors.indigoBright,
      onSecondary: Colors.white,
      secondaryContainer: Color(0xFF29344F),
      onSecondaryContainer: Color(0xFFD6DEF2),
      tertiary: SerbColors.gold,
      onTertiary: Color(0xFF2B2118),
      tertiaryContainer: Color(0xFF4A3708),
      onTertiaryContainer: Color(0xFFF3E1B8),
      error: Color(0xFFE58A80),
      onError: Color(0xFF3A0906),
      errorContainer: Color(0xFF5C1611),
      onErrorContainer: Color(0xFFF8D7D3),
      surface: SerbColors.nightBg,
      onSurface: SerbColors.nightText,
      onSurfaceVariant: Color(0xFFC3B49B),
      surfaceContainerLowest: Color(0xFF110E0B),
      surfaceContainerLow: Color(0xFF1C1813),
      surfaceContainer: SerbColors.nightSurface,
      surfaceContainerHigh: SerbColors.nightSurface2,
      surfaceContainerHighest: Color(0xFF362C22),
      surfaceTint: SerbColors.serbRedBright,
      outline: Color(0xFF897B68),
      outlineVariant: Color(0xFF473C30),
      shadow: Colors.black,
      scrim: Colors.black,
      inverseSurface: Color(0xFFEDE2CC),
      onInverseSurface: Color(0xFF322A21),
      inversePrimary: SerbColors.serbRed,
    );
    return _base(scheme);
  }

  static ThemeData _base(ColorScheme scheme) {
    final isDark = scheme.brightness == Brightness.dark;
    // Шапка в тон страницы, а не сплошная красная плашка: кирпичный прямоугольник
    // поверх пергамента выглядел тяжело, а красный остался акцентом на иконках.
    final appBarColor =
        isDark ? SerbColors.nightSurface : scheme.surfaceContainerLow;
    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radiusButton),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      fontFamily: uiFont,
      splashFactory: InkSparkle.splashFactory,
      textTheme: _textTheme(scheme),
      appBarTheme: AppBarTheme(
        backgroundColor: appBarColor,
        foregroundColor: scheme.onSurface,
        iconTheme: IconThemeData(color: scheme.primary),
        actionsIconTheme: IconThemeData(color: scheme.primary),
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness:
              isDark ? Brightness.light : Brightness.dark,
          statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
          systemNavigationBarColor: scheme.surfaceContainerHigh,
          systemNavigationBarIconBrightness:
              isDark ? Brightness.light : Brightness.dark,
        ),
        titleTextStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
          color: scheme.onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainerLow,
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusCard),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        thickness: 1,
        space: 1,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: buttonShape,
          textStyle: const TextStyle(
            fontFamily: uiFont,
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: buttonShape,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.primary,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          side: BorderSide(color: scheme.primary.withValues(alpha: 0.45)),
          shape: buttonShape,
          textStyle: const TextStyle(
            fontFamily: uiFont,
            fontSize: 14.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          shape: buttonShape,
          textStyle: const TextStyle(
            fontFamily: uiFont,
            fontSize: 14.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          highlightColor: scheme.primary.withValues(alpha: 0.10),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 2,
        highlightElevation: 3,
        extendedTextStyle: const TextStyle(
          fontFamily: uiFont,
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primary.withValues(alpha: 0.16),
        elevation: 0,
        height: 72,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: uiFont,
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? scheme.primary
                : scheme.onSurfaceVariant,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 24,
            color: states.contains(WidgetState.selected)
                ? scheme.primary
                : scheme.onSurfaceVariant,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainer,
        selectedColor: scheme.primaryContainer,
        checkmarkColor: scheme.onPrimaryContainer,
        side: BorderSide(color: scheme.outlineVariant),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
        labelStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 13.5,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
        secondaryLabelStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: scheme.onPrimaryContainer,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: scheme.onSurfaceVariant,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        elevation: 1,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        titleTextStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: scheme.onSurface,
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(radiusSheet)),
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: scheme.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        elevation: 3,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 14.5,
          color: scheme.onSurface,
        ),
      ),
      menuTheme: MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(scheme.surfaceContainerLow),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainer,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusButton),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusButton),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusButton),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: scheme.primary,
        inactiveTrackColor: scheme.primary.withValues(alpha: 0.18),
        thumbColor: scheme.primary,
        overlayColor: scheme.primary.withValues(alpha: 0.12),
        trackHeight: 4,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? scheme.onPrimary : null),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? scheme.primary : null),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: scheme.inverseSurface,
          borderRadius: BorderRadius.circular(8),
        ),
        textStyle: TextStyle(
          fontFamily: uiFont,
          fontSize: 12.5,
          color: scheme.onInverseSurface,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: TextStyle(
          color: scheme.onInverseSurface,
          fontFamily: uiFont,
          fontSize: 14,
        ),
        actionTextColor: isDark ? SerbColors.gold : SerbColors.serbRedBright,
        behavior: SnackBarBehavior.floating,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.primary.withValues(alpha: 0.15),
        circularTrackColor: scheme.primary.withValues(alpha: 0.15),
      ),
      // FadeUpwards — переход из Material 1: экран уезжает вверх и мигает.
      // На Android теперь системный предиктивный переход (он же учитывает жест
      // «назад»), на iOS — привычный сдвиг, на десктопе — короткое затухание.
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: PredictiveBackPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.macOS: ZoomPageTransitionsBuilder(),
      }),
    );
  }

  static TextTheme _textTheme(ColorScheme scheme) {
    final ink = scheme.onSurface;
    final muted = scheme.onSurfaceVariant;
    return TextTheme(
      headlineMedium: TextStyle(
        fontFamily: uiFont,
        fontSize: 26,
        height: 1.2,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.3,
        color: ink,
      ),
      headlineSmall: TextStyle(
        fontFamily: uiFont,
        fontSize: 22,
        height: 1.25,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.2,
        color: ink,
      ),
      titleLarge: TextStyle(
        fontFamily: uiFont,
        fontSize: 19,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      titleMedium: TextStyle(
        fontFamily: uiFont,
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      titleSmall: TextStyle(
        fontFamily: uiFont,
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      bodyLarge: TextStyle(
        fontFamily: uiFont,
        fontSize: 16,
        height: 1.45,
        color: ink,
      ),
      bodyMedium: TextStyle(
        fontFamily: uiFont,
        fontSize: 14.5,
        height: 1.45,
        color: ink,
      ),
      bodySmall: TextStyle(
        fontFamily: uiFont,
        fontSize: 12.5,
        height: 1.4,
        color: muted,
      ),
      labelLarge: TextStyle(
        fontFamily: uiFont,
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: ink,
      ),
      labelMedium: TextStyle(
        fontFamily: uiFont,
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: muted,
      ),
      labelSmall: TextStyle(
        fontFamily: uiFont,
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.3,
        color: muted,
      ),
    );
  }
}
