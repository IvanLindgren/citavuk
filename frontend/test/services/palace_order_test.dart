import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/palace_store.dart';

/// Порядок обхода обязан совпадать с `walkOrder` из `web/src/lib/palace.ts`:
/// дворец синхронизируется между устройствами, и маршрут, разный на телефоне и
/// в браузере, обесценил бы весь приём — вспоминается ведь именно путь.
///
/// Примеры здесь намеренно те же, что в `web/src/lib/palace.test.ts`.

Palace palace(Map<String, PalacePin> pins) => Palace(
      uuid: '11111111-1111-4111-8111-111111111111',
      name: 'Кухня',
      sceneId: 'kuhinja',
      pins: pins,
      updatedAt: 0,
    );

void main() {
  group('порядок обхода', () {
    test('идёт в порядке развески, а не в порядке предметов сцены', () {
      final filled = palace({
        'lampa': const PalacePin(word: 'лампа', translation: 'лампа', at: 10),
        'prozor': const PalacePin(word: 'прозор', translation: 'окно', at: 20),
      });
      final route = walkOrder(filled, ['prozor', 'frizider', 'lampa']);
      expect(route.map((step) => step.spotId), ['lampa', 'prozor']);
    });

    // Маршрут, выученный до появления порядка развески, менять задним числом
    // нельзя: человек его уже запомнил.
    test('старая развеска без пометки времени идёт по сцене и первой', () {
      final filled = palace({
        'lampa': const PalacePin(word: 'лампа', translation: 'лампа'),
        'prozor': const PalacePin(word: 'прозор', translation: 'окно'),
        'sto': const PalacePin(word: 'сто', translation: 'стол', at: 99),
      });
      final route = walkOrder(filled, ['prozor', 'sto', 'lampa']);
      expect(route.map((step) => step.spotId), ['prozor', 'lampa', 'sto']);
    });

    test('замена слова на предмете не переносит его в конец маршрута', () {
      var filled = palace({
        'lampa': const PalacePin(word: 'лампа', translation: 'лампа', at: 10),
        'prozor': const PalacePin(word: 'прозор', translation: 'окно', at: 20),
      });
      filled = withPin(filled, 'lampa',
          const PalacePin(word: 'сијалица', translation: 'лампочка'));

      final route = walkOrder(filled, ['prozor', 'lampa']);
      expect(route.map((step) => step.spotId), ['lampa', 'prozor']);
      expect(filled.pins['lampa']!.at, 10);
    });

    test('пропускает предметы без слова', () {
      expect(walkOrder(palace({}), ['prozor', 'sto']), isEmpty);
    });

    test('пустое слово снимает развеску', () {
      var filled = palace({
        'lampa': const PalacePin(word: 'лампа', translation: 'лампа', at: 10),
      });
      filled = withPin(
          filled, 'lampa', const PalacePin(word: '  ', translation: ''));
      expect(filled.pins, isEmpty);
    });
  });

  group('обмен с сервером', () {
    // Поле `at` обязано пережить круг «телефон — сервер — браузер»: без него
    // устройства обходили бы один дворец в разном порядке.
    test('порядок развески переживает запись и разбор', () {
      const pin = PalacePin(
        word: 'кућа',
        translation: 'дом',
        vocabId: 'abc',
        at: 1234,
      );
      final back = PalacePin.fromJson(pin.toJson());
      expect(back.word, 'кућа');
      expect(back.translation, 'дом');
      expect(back.vocabId, 'abc');
      expect(back.at, 1234);
    });

    // Сервер хранит vocabId строкой: отсутствие связи со словарём — пустая
    // строка, а не null.
    test('пустая связь со словарём не превращается в слово «null»', () {
      const pin = PalacePin(word: 'кућа', translation: 'дом');
      expect(pin.toJson()['vocabId'], '');
      expect(PalacePin.fromJson(pin.toJson()).vocabId, isNull);
    });
  });
}
