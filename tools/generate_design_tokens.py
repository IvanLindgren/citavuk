#!/usr/bin/env python3
"""Разъезжает design/tokens.json в код обеих платформ.

Выход:
  web/src/lib/tokens.ts — длительности для framer-motion и радиусы;
  frontend/lib/theme/tokens.dart — класс AppMotion и радиусы.

Сгенерированные файлы руками не правят: правка живёт в tokens.json и
переживает повторный запуск. Запуск из корня репозитория:

    python tools/generate_design_tokens.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "design" / "tokens.json"
WEB_OUT = ROOT / "web" / "src" / "lib" / "tokens.ts"
APP_OUT = ROOT / "frontend" / "lib" / "theme" / "tokens.dart"

TS_TEMPLATE = """// Сгенерировано из design/tokens.json генератором tools/generate_design_tokens.py.
// Руками не править: правка живёт в tokens.json.

/** Длительности переходов в секундах (для framer-motion). */
export const MOTION_PRESS_S = @PRESS@;
export const MOTION_CARD_S = @CARD@;
export const MOTION_EXPAND_S = @EXPAND@;
/** Сдвиг появления карточки в пикселях. */
export const MOTION_CARD_SHIFT_PX = @SHIFT@;
/** Шаг каскада появления списка в секундах. */
export const MOTION_LIST_STEP_S = @STEP@;

/** Радиусы в пикселях. */
export const RADIUS_CARD_PX = @CARD_WEB@;
export const RADIUS_BUTTON_PX = @BUTTON_WEB@;
"""

DART_TEMPLATE = """// Сгенерировано из design/tokens.json генератором tools/generate_design_tokens.py.
// Руками не править: правка живёт в tokens.json.

/// Единые длительности переходов. Новые анимации берут значения отсюда, а не
/// подбирают свои — иначе экраны «дышат» вразнобой.
///
/// Ориентиры: нажатие 100–140 мс, карточка 150–200 мс со сдвигом 6–8 px,
/// раскрытие пояснения 180–240 мс.
abstract final class AppMotion {
  /// Нажатие/вдавливание.
  static const press = Duration(milliseconds: @PRESS_MS@);

  /// Появление карточки (слово, шторка) со сдвигом [cardShift].
  static const card = Duration(milliseconds: @CARD_MS@);

  /// Раскрытие пояснения/раздела.
  static const expand = Duration(milliseconds: @EXPAND_MS@);

  /// Сдвиг появления карточки в логических пикселях.
  static const double cardShift = @SHIFT@;

  /// Шаг каскада появления списка.
  static const listStep = Duration(milliseconds: @STEP_MS@);
}

/// Радиусы скруглений в логических пикселях.
abstract final class AppRadius {
  static const double card = @CARD_APP@;
  static const double button = @BUTTON_APP@;
  static const double sheet = @SHEET@;
  static const double panel = @PANEL@;
}
"""


def fill(template: str, values: dict) -> str:
    for key, value in values.items():
        template = template.replace(key, str(value))
    return template


def write_if_changed(path: Path, content: str) -> bool:
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True


def main() -> int:
    data = json.loads(TOKENS.read_text(encoding="utf-8"))
    motion = data["motion"]
    radius = data["radius"]

    ts = fill(TS_TEMPLATE, {
        "@PRESS@": motion["pressMs"] / 1000,
        "@CARD@": motion["cardMs"] / 1000,
        "@EXPAND@": motion["expandMs"] / 1000,
        "@SHIFT@": motion["cardShiftPx"],
        "@STEP@": motion["listStepMs"] / 1000,
        "@CARD_WEB@": radius["cardWebPx"],
        "@BUTTON_WEB@": radius["buttonWebPx"],
    })
    dart = fill(DART_TEMPLATE, {
        "@PRESS_MS@": motion["pressMs"],
        "@CARD_MS@": motion["cardMs"],
        "@EXPAND_MS@": motion["expandMs"],
        "@SHIFT@": motion["cardShiftPx"],
        "@STEP_MS@": motion["listStepMs"],
        "@CARD_APP@": radius["cardAppDp"],
        "@BUTTON_APP@": radius["buttonAppDp"],
        "@SHEET@": radius["sheetDp"],
        "@PANEL@": radius["panelDp"],
    })

    changed = []
    if write_if_changed(WEB_OUT, ts):
        changed.append(str(WEB_OUT))
    if write_if_changed(APP_OUT, dart):
        changed.append(str(APP_OUT))
    for path in changed:
        print(f"обновлено: {path}")
    if not changed:
        print("без изменений")
    return 0


if __name__ == "__main__":
    sys.exit(main())
