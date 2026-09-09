// Сгенерировано из design/tokens.json генератором tools/generate_design_tokens.py.
// Руками не править: правка живёт в tokens.json.

/// Единые длительности переходов. Новые анимации берут значения отсюда, а не
/// подбирают свои — иначе экраны «дышат» вразнобой.
///
/// Ориентиры: нажатие 100–140 мс, карточка 150–200 мс со сдвигом 6–8 px,
/// раскрытие пояснения 180–240 мс.
abstract final class AppMotion {
  /// Нажатие/вдавливание.
  static const press = Duration(milliseconds: 120);

  /// Появление карточки (слово, шторка) со сдвигом [cardShift].
  static const card = Duration(milliseconds: 180);

  /// Раскрытие пояснения/раздела.
  static const expand = Duration(milliseconds: 210);

  /// Сдвиг появления карточки в логических пикселях.
  static const double cardShift = 7;

  /// Шаг каскада появления списка.
  static const listStep = Duration(milliseconds: 40);
}

/// Радиусы скруглений в логических пикселях.
abstract final class AppRadius {
  static const double card = 18;
  static const double button = 14;
  static const double sheet = 26;
  static const double panel = 20;
}
