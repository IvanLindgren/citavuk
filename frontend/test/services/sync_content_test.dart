import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/sync_service.dart';
import 'package:srbski_read/utils/uuid.dart';

// Спецсимволы собираются из кодов, а не пишутся escape-строками: U+2028 и
// нулевой байт невидимы в редакторе, и случайная замена такого символа на
// пробел тихо превратила бы проверку в бессмысленную.
final lineSeparator = String.fromCharCode(0x2028); // разделитель строк из Word
final paragraphSeparator = String.fromCharCode(0x2029);
final nul = String.fromCharCode(0);
final formFeed = String.fromCharCode(0x0c); // разрыв страницы из PDF

void main() {
  group('адрес текста книги', () {
    // Эталоны посчитаны сервером и зафиксированы там же:
    // server/internal/store/content_test.go, набор contentSHACases.
    //
    // Совпадение обязательно: клиент считает адрес перед выгрузкой, сервер
    // пересчитывает его и отвергает запрос при расхождении. Разойдись
    // вычисление хоть на байт — синхронизация книг перестала бы работать
    // целиком, и ни один другой тест этого бы не заметил.
    final cases = <String, (List<String>, String)>{
      'пустая книга': (
        <String>[],
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ),
      'кириллица': (
        ['Ово је прва глава књиге.'],
        'f3fb817fbd63a9ec257919e9e49f6e996a3796d56cf23729b4d8e76bdbbe0416',
      ),
      'латиница с диакритикой и символы разметки': (
        ['Čitao sam je celu noć.', 'Услов a < b & c > d важен.'],
        'e31a9b3cbf2739c71b14dc31ea5814972e365fbb8e3e758cca18d3e7fbcb0c8a',
      ),
      'кавычки и обратный слеш': (
        [r'Строка с "кавычками" и \обратным слешем'],
        'd986a5435558931f70725e03c17cd555695ddafd92b528f09a59244779358190',
      ),
      'эмодзи и перевод строки': (
        ['Эмодзи 🐺 и перевод строки\nвнутри абзаца'],
        '103c345eb3ea11a8b1dba09c9143ede26dfb2c86113f84e6a79fb5de2dd6528f',
      ),
    };

    cases.forEach((name, data) {
      test('совпадает с сервером: $name', () {
        expect(contentSha(data.$1), data.$2);
      });
    });

    // Ровно на этих символах Go расходился с Dart, пока адрес считался из
    // JSON: Go экранирует их всегда, jsonEncode — никогда.
    test('совпадает с сервером: разделители строк из Word', () {
      expect(
        contentSha(['текст${lineSeparator}ещё', 'и${paragraphSeparator}ещё']),
        'db90688d1131f3c24c0817de7216cad03ab41c3cb984be2316940b52df80b46a',
      );
    });

    test('совпадает с сервером: перевод страницы и табуляция', () {
      expect(
        contentSha(['Прва глава.${formFeed}Друга глава.', 'с\tтабуляцией']),
        '08c885fe43153e27e85bac24c9ccdb818f8bb3dd9fab8928829eac326a991289',
      );
    });

    test('меняется при любой правке текста', () {
      final base = contentSha(['Први пасус.', 'Други пасус.']);
      expect(contentSha(['Први пасус.', 'Други пасус!']), isNot(base),
          reason: 'исправленная книга не доехала бы до других устройств');
      expect(contentSha(['Други пасус.', 'Први пасус.']), isNot(base),
          reason: 'перестановка абзацев обязана менять адрес');
    });

    test('разбиение на абзацы влияет на адрес при любом содержимом', () {
      final two = contentSha(['а', 'б']);

      // Тот же текст одним абзацем, склеенный любым разделителем — включая
      // тот, которым выглядит сама рамка.
      for (final join in ['', nul, '\n', ' ', '\t', lineSeparator, '2\n']) {
        expect(contentSha(['а${join}б']), isNot(two),
            reason: 'разделитель ${join.codeUnits} склеил разные книги');
      }

      expect(contentSha(['аб', 'вг']), isNot(contentSha(['а', 'бвг'])));
    });

    test('не зависит от того, как текст оказался в приложении', () {
      // Одна и та же книга из PDF на одном устройстве и из DOCX на другом даёт
      // разные файлы, но одинаковые абзацы — и не должна храниться дважды.
      expect(
        contentSha(['Прва глава.', 'Друга глава.']),
        contentSha(['Прва глава.', 'Друга глава.']),
      );
    });
  });

  group('UUID', () {
    test('имеет канонический вид', () {
      final id = newUuid();
      expect(id.length, 36);
      expect(id[14], '4', reason: 'версия должна быть 4');
      expect('89ab'.contains(id[19]), isTrue, reason: 'вариант RFC 4122');
      expect(isUuid(id), isTrue);
    });

    test('не повторяется', () {
      final ids = List.generate(2000, (_) => newUuid()).toSet();
      expect(ids.length, 2000,
          reason: 'совпадение id склеило бы разные записи');
    });

    test('отбраковывает мусор', () {
      const bad = [
        '',
        'не-uuid',
        '123',
        '00000000-0000-4000-8000-00000000000', // на символ короче
        '00000000-0000-4000-8000-0000000000000', // на символ длиннее
        '00000000_0000_4000_8000_000000000000', // не те разделители
        'zzzzzzzz-0000-4000-8000-000000000000', // не hex
      ];
      for (final value in bad) {
        expect(isUuid(value), isFalse, reason: 'принят мусор: "$value"');
      }
    });

    test('принимает верхний регистр', () {
      expect(isUuid('A1B2C3D4-0000-4000-8000-00000000000F'), isTrue);
    });
  });
}
