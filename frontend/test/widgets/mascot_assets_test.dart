import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Пути маскота живут строками: опечатка видна только на экране, а не в
/// анализаторе. Проверяем, что все позы волка и орла лежат на месте.
void main() {
  const poses = [
    'assets/imgs/citavuk_zdravo.webp',
    'assets/imgs/citavuk_povtor.webp',
    'assets/imgs/citavuk_ukaz.webp',
    'assets/imgs/citavuk_gram.webp',
    'assets/imgs/citavuk_rule.webp',
    'assets/imgs/citavuk_english.webp',
    'assets/imgs/citavuk_zadumch.webp',
    'assets/imgs/citavuk_roadmap.webp',
    'assets/imgs/citavuk_utesi.webp',
    'assets/imgs/citavuk_slavlje.webp',
    'assets/imgs/citavuk_cita.webp',
    'assets/imgs/citavuk_zbunjen.webp',
    'assets/imgs/citavuk_vukotok.webp',
    'assets/imgs/sluhao_zdravo.webp',
    'assets/imgs/sluhao_slusa.webp',
    'assets/imgs/sluhao_savet.webp',
  ];

  test('все позы маскота существуют', () {
    for (final pose in poses) {
      expect(File(pose).existsSync(), isTrue, reason: pose);
    }
  });

  test('старых тяжёлых PNG не осталось', () {
    for (final pose in poses) {
      expect(File(pose.replaceAll('.webp', '.png')).existsSync(), isFalse,
          reason: pose);
    }
  });
}
