import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/games/speaking/highlight.dart';
import 'package:srbski_read/games/speaking/speaking_models.dart';

SpeakingMistake mistake(String original) =>
    SpeakingMistake(original: original, fixed: 'x', kind: 'case', label: 'Падеж', explanation: '');

void main() {
  test('подсвечивает ошибки и сохраняет текст целиком', () {
    const text = 'Ja volim Beograd jer je on veliki grad.';
    final parts = annotate(text, [mistake('veliki grad'), mistake('Ja volim')]);
    expect(parts.map((p) => p.text).join(), text);
    expect(
      [for (final p in parts) if (p.mistake != null) (p.text, p.mistake)],
      [('Ja volim', 1), ('veliki grad', 0)],
    );
  });

  test('регистр не важен, но текст возвращается как написан', () {
    final parts = annotate('Volim ĐAK i đaka', [mistake('đak')]);
    expect(parts[1].text, 'ĐAK');
    expect(parts[1].mistake, 0);
  });

  test('повторная ошибка занимает следующее свободное вхождение', () {
    final parts = annotate('kuća kuća', [mistake('kuća'), mistake('kuća')]);
    expect([for (final p in parts) if (p.mistake != null) p.mistake], [0, 1]);
  });

  test('пересекающиеся ошибки не накладываются', () {
    final parts = annotate('u velikom gradu', [mistake('velikom gradu'), mistake('gradu')]);
    expect([for (final p in parts) if (p.mistake != null) p.text], ['velikom gradu']);
  });

  test('ошибка, которой нет в тексте, не подсвечивается', () {
    final parts = annotate('Dobar dan', [mistake('noć')]);
    expect(parts.length, 1);
    expect(parts.single.mistake, isNull);
  });

  test('счёт слов совпадает с серверным', () {
    expect(countWords('  Ja   volim\nBeograd '), 3);
    expect(countWords('   '), 0);
  });
}
