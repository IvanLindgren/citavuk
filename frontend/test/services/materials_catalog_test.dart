import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/materials_catalog.dart';

/// Каталог материалов приезжает из ассета, который собирает общий с сайтом
/// скрипт. Тест проверяет, что приложение действительно его читает и что
/// фильтры отбирают то, что обещают: расхождение здесь означает пустой раздел
/// в приложении при полном разделе на сайте.
///
/// Уровни и виды берутся из самого каталога. Список в тесте краснел не на
/// поломке, а на пополнении: каталог оброс уровнем «Сербский как иностранный»
/// и видом `research`, а копия списка в тесте об этом не знала.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MaterialsCatalog catalog;

  setUpAll(() async {
    catalog = await MaterialsCatalog.load();
  });

  test('каталог читается из ассетов и не пуст', () {
    expect(catalog.documents, isNotEmpty);
    expect(catalog.subjects, isNotEmpty);
    expect(catalog.levels, isNotEmpty);
    expect(catalog.sources, isNotEmpty);
    // Проверка на присутствие, а не на полный состав: пополнение каталога
    // ломать тест не должно, а вот исчезновение этих двух — должно, на них
    // держится весь раздел.
    expect(catalog.levels.map((l) => l.id), containsAll(['gimnazija', 'fakultet']));
  });

  test('у каждого документа есть ссылка, предмет и вид', () {
    final levels = catalog.levels.map((l) => l.id).toSet();
    for (final document in catalog.documents) {
      expect(document.id, isNotEmpty, reason: document.title);
      expect(document.url, startsWith('http'), reason: document.title);
      expect(document.subject, isNotEmpty, reason: document.url);
      expect(document.publisher, isNotEmpty, reason: document.url);
      expect(document.kindId, isNotEmpty, reason: document.url);
      expect(document.kind, isNotEmpty, reason: document.url);
      // Документ с уровнем, которого нет в списке уровней, в приложении не
      // покажется вовсе: выбрать такой уровень не через что.
      expect(levels, contains(document.level), reason: document.url);
    }
  });

  test('идентификаторы документов уникальны', () {
    final ids = catalog.documents.map((d) => d.id).toSet();
    expect(ids.length, catalog.documents.length);
  });

  // Число рядом с уровнем обещано на кнопке. Обещать 139 и показать 134 —
  // ровно то, из-за чего человек решает, что фильтр сломан.
  test('обещанное число документов у уровня совпадает с настоящим', () {
    var counted = 0;
    for (final level in catalog.levels) {
      final found = catalog.filter(level: level.id);
      expect(found.length, level.count, reason: 'уровень ${level.title}');
      counted += found.length;
    }
    expect(counted, catalog.documents.length);
  });

  test('фильтр по уровню отбирает только свой уровень', () {
    for (final level in catalog.levels) {
      final found = catalog.filter(level: level.id);
      expect(found, isNotEmpty, reason: level.title);
      expect(found.every((d) => d.level == level.id), isTrue, reason: level.title);
    }
  });

  // То же для видов, и по той же причине: вид, который фильтр не отбирает,
  // делает часть каталога недостижимой.
  test('фильтр по виду разбирает каталог без остатка', () {
    final kinds = catalog.documents.map((d) => d.kindId).toSet();
    var counted = 0;
    for (final kind in kinds) {
      final found = catalog.filter(kindId: kind);
      expect(found, isNotEmpty, reason: kind);
      expect(found.every((d) => d.kindId == kind), isTrue, reason: kind);
      counted += found.length;
    }
    expect(counted, catalog.documents.length);
  });

  test('предметы уровня не обещают документов, которых при нём нет', () {
    for (final level in catalog.levels) {
      for (final subject in catalog.subjectsFor(level.id)) {
        final found = catalog.filter(level: level.id, subjectId: subject.id);
        expect(
          found.length,
          subject.count,
          reason: 'предмет ${subject.title} на уровне ${level.title}',
        );
      }
    }
  });

  test('поиск находит по названию и по учреждению', () {
    final byPublisher = catalog.filter(query: 'матфак');
    expect(byPublisher, isNotEmpty);
    expect(
      byPublisher.every((d) => d.publisher.toLowerCase().contains('матфак') ||
          d.title.toLowerCase().contains('матфак')),
      isTrue,
    );
  });

  test('размер показывается по-человечески', () {
    const small = MaterialDocument(
      id: 'a',
      title: 't',
      subjectId: 's',
      subject: 'Предмет',
      track: null,
      year: 2024,
      kindId: 'test',
      kind: 'Тест',
      level: 'fakultet',
      levelTitle: 'Университет',
      bytes: 240 * 1024,
      url: 'https://example.com/a.pdf',
      publisher: 'Кто-то',
      publisherShort: 'Кто-то',
      sourcePage: 'https://example.com/',
    );
    expect(small.sizeLabel, '240 КБ');

    const big = MaterialDocument(
      id: 'b',
      title: 't',
      subjectId: 's',
      subject: 'Предмет',
      track: null,
      year: null,
      kindId: 'book',
      kind: 'Пособие',
      level: 'fakultet',
      levelTitle: 'Университет',
      bytes: 3 * 1024 * 1024 + 512 * 1024,
      url: 'https://example.com/b.pdf',
      publisher: 'Кто-то',
      publisherShort: 'Кто-то',
      sourcePage: 'https://example.com/',
    );
    expect(big.sizeLabel, '3,5 МБ');

    expect(
      const MaterialDocument(
        id: 'c',
        title: 't',
        subjectId: 's',
        subject: 'Предмет',
        track: null,
        year: null,
        kindId: 'test',
        kind: 'Тест',
        level: 'fakultet',
        levelTitle: 'Университет',
        bytes: 0,
        url: 'https://example.com/c.pdf',
        publisher: 'Кто-то',
        publisherShort: 'Кто-то',
        sourcePage: 'https://example.com/',
      ).sizeLabel,
      isEmpty,
    );
  });
}
