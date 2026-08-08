import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/trainer_catalog.dart';
import 'package:srbski_read/course/services/course_content_loader.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('каталог одинаково покрывает уровни и три режима', () async {
    final course = CourseContentLoader.parseBundle(
      await rootBundle.loadString('assets/course/course_bundle.json'),
    );
    final specs = await loadTrainerCatalog();
    final topics = buildTrainerTopics(course, specs);

    final grammar =
        topics.where((item) => item.domain == TrainerDomain.grammar).toList();
    expect(
        grammar.where(
            (item) => const {'A1', 'A2', 'B1', 'B2'}.contains(item.level)),
        hasLength(60));
    expect(grammar.where((item) => item.level == 'C1' || item.level == 'C2'),
        isEmpty);
    expect(grammar.every((item) => item.exercises.isNotEmpty), isTrue);
    expect(grammar.every((item) => item.roadmapItemId.isNotEmpty), isTrue);

    expect(topics.any((item) => item.domain == TrainerDomain.reading), isTrue);
    expect(topics.any((item) => item.domain == TrainerDomain.writing), isTrue);
  });
}
