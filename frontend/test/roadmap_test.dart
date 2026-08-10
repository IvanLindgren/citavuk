import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/roadmap.dart';

RoadmapProgress _progress(int done, int total) => RoadmapProgress(
      done: done,
      total: total,
      ratio: total == 0 ? 0 : done / total,
      passed: total > 0 && done / total >= 0.8,
    );

const _categories = [
  RoadmapCategory(
      key: 'reading',
      title: 'Reading',
      local: 'Čitanje',
      about: '',
      planned: false),
  RoadmapCategory(
      key: 'grammar',
      title: 'Grammar',
      local: 'Gramatika',
      about: '',
      planned: false),
  RoadmapCategory(
      key: 'vocabulary',
      title: 'Vocabulary',
      local: 'Vokabular',
      about: '',
      planned: false),
  RoadmapCategory(
      key: 'writing',
      title: 'Writing',
      local: 'Pisanje',
      about: '',
      planned: false),
];

RoadmapLevelView _level(Map<String, RoadmapProgress> categories) =>
    RoadmapLevelView(
      level: 'B1',
      name: 'Читаю с переводчиком',
      categories: categories,
      passed: false,
    );

void main() {
  test('уровень берётся по всем четырём разделам', () {
    final level = _level({
      'reading': _progress(9, 10),
      'grammar': _progress(8, 10),
      'vocabulary': _progress(90, 100),
      'writing': _progress(8, 10),
    });
    expect(roadmapLevelPassed(level, _categories), isTrue);
  });

  test('один раздел ниже порога — уровень не взят', () {
    final level = _level({
      'reading': _progress(9, 10),
      'grammar': _progress(5, 10),
      'vocabulary': _progress(90, 100),
      'writing': _progress(9, 10),
    });
    expect(roadmapLevelPassed(level, _categories), isFalse);
  });

  // Ненаполненный уровень не открывает дорогу дальше сам собой.
  test('пустой раздел — уровень не взят', () {
    final level = _level({
      'reading': _progress(9, 10),
      'grammar': _progress(0, 0),
      'vocabulary': _progress(90, 100),
      'writing': _progress(9, 10),
    });
    expect(roadmapLevelPassed(level, _categories), isFalse);
  });

  test('на пустой карте уровень не взят', () {
    expect(roadmapLevelPassed(_level({}), _categories), isFalse);
  });

  test('следующая ступень идёт по шкале, а с вершины пуста', () {
    final levels = [
      for (final name in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
        RoadmapLevelView(
            level: name, name: name, categories: const {}, passed: false),
    ];
    expect(roadmapNextLevel('A1', levels), 'A2');
    expect(roadmapNextLevel('B2', levels), 'C1');
    expect(roadmapNextLevel('C2', levels), '');
    expect(roadmapNextLevel('чепуха', levels), '');
  });

  test('неизвестный раздел не роняет разбор прогресса', () {
    final level = _level({'reading': _progress(1, 2)});
    expect(level.progressOf('grammar').total, 0);
    expect(level.progressOf('grammar').passed, isFalse);
  });

  test('пример разбирается по разметке', () {
    final parts = splitExample('Naša *mačka* spava.');
    expect(parts.length, 3);
    expect(parts[1].text, 'mačka');
    expect(parts[1].target, isTrue);
    expect(parts[0].target, isFalse);
  });

  // Примеры, добавленные автором руками, звёздочек могут не иметь — фраза
  // должна показаться целиком, а не пропасть.
  test('фраза без разметки отдаётся целиком', () {
    final parts = splitExample('Bez oznake.');
    expect(parts.length, 1);
    expect(parts.single.target, isFalse);
    expect(splitExample('   '), isEmpty);
  });
}
