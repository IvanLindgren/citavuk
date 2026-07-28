import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/materials_catalog.dart';

/// Каталог материалов приезжает из ассета, который собирает общий с сайтом
/// скрипт. Тест проверяет, что приложение действительно его читает и что
/// фильтры отбирают то, что обещают: расхождение здесь означает пустой раздел
/// в приложении при полном разделе на сайте.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late MaterialsCatalog catalog;

  setUpAll(() async {
    catalog = await MaterialsCatalog.load();
  });

  test('каталог читается из ассетов и не пуст', () {
    expect(catalog.documents, isNotEmpty);
    expect(catalog.subjects, isNotEmpty);
    expect(catalog.levels.map((l) => l.id), containsAll(['gimnazija', 'fakultet']));
    expect(catalog.sources, isNotEmpty);
  });

  test('у каждого документа есть ссылка, предмет и вид', () {
    for (final document in catalog.documents) {
      expect(document.id, isNotEmpty, reason: document.title);
      expect(document.url, startsWith('http'), reason: document.title);
      expect(document.subject, isNotEmpty, reason: document.url);
      expect(document.publisher, isNotEmpty, reason: document.url);
      expect(
        document.kindId,
        anyOf('test', 'key', 'guide', 'book'),
        reason: document.url,
      );
      expect(document.level, anyOf('gimnazija', 'fakultet'), reason: document.url);
    }
  });

  test('идентификаторы документов уникальны', () {
    final ids = catalog.documents.map((d) => d.id).toSet();
    expect(ids.length, catalog.documents.length);
  });

  test('фильтр по уровню отбирает только свой уровень', () {
    final faculty = catalog.filter(level: 'fakultet');
    expect(faculty, isNotEmpty);
    expect(faculty.every((d) => d.level == 'fakultet'), isTrue);

    final school = catalog.filter(level: 'gimnazija');
    expect(school, isNotEmpty);
    expect(school.length + faculty.length, catalog.documents.length);
  });

  test('предметы уровня не обещают документов, которых при нём нет', () {
    for (final level in ['gimnazija', 'fakultet']) {
      for (final subject in catalog.subjectsFor(level)) {
        final found = catalog.filter(level: level, subjectId: subject.id);
        expect(
          found.length,
          subject.count,
          reason: 'предмет ${subject.title} на уровне $level',
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
