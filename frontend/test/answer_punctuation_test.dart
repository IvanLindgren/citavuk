import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/services/serbian_text.dart';

// Повод для этих тестов — жалоба читателя: «отменил мои верные ответы из-за
// отсутствия запятых». Проверка срезала только точку в конце, и запятая внутри
// фразы валила перевод целиком. Правило то же, что в вебе
// (web/src/lib/answerMatch.test.ts) — расхождение между платформами означало
// бы, что «принято» значит разное на телефоне и в браузере.
void main() {
  bool same(String left, String right) =>
      normalizeAnswer(left) == normalizeAnswer(right);

  group('пунктуация в ответе', () {
    test('пропущенная запятая не отменяет ответ', () {
      expect(same('Я забыл, что ключи дома', 'Я забыл что ключи дома'), isTrue);
    });

    test('лишняя запятая тоже не отменяет', () {
      expect(same('Солнце встаёт из-за горы', 'Солнце встаёт, из-за горы'), isTrue);
    });

    test('точка, восклицательный и вопросительный знаки не считаются', () {
      expect(same('Zdravo', 'Zdravo!'), isTrue);
      expect(same('Kako si', 'Kako si?'), isTrue);
      expect(same('Dobar dan', 'Dobar dan.'), isTrue);
    });

    test('кавычки и тире между словами не считаются', () {
      expect(same('он сказал «да»', 'он сказал да'), isTrue);
      expect(same('Москва — столица', 'Москва столица'), isTrue);
    });

    // Иначе снятие знаков склеивало бы слова в одно и меняло ответ.
    test('на месте знака остаётся разрыв слов', () {
      expect(stripAnswerPunctuation('да,нет'), 'да нет');
      expect(stripAnswerPunctuation('раз... два'), 'раз два');
    });

    test('дефис внутри слова сохраняется', () {
      expect(stripAnswerPunctuation('из-за горы'), 'из-за горы');
      expect(same('из-за горы', 'изза горы'), isFalse);
    });

    test('лишние пробелы схлопываются', () {
      expect(same('  Dobar   dan  ', 'Dobar dan'), isTrue);
    });

    test('сербские диакритики считаются', () {
      expect(same('ČAJ', 'čaj'), isTrue);
      expect(same('čaj', 'ćaj'), isFalse);
    });

    // Задел на упражнение, где знаки и проверяются: с флагом всё остаётся.
    test('с keepTerminalPunctuation знаки сохраняются', () {
      expect(
        normalizeAnswer('Zdravo!', keepTerminalPunctuation: true),
        'zdravo!',
      );
    });
  });
}
