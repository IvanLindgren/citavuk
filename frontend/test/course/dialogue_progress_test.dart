import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/models/progress.dart';

void main() {
  test('dialogue progress survives course progress JSON round-trip', () {
    final progress = CourseProgress(
      courseId: 'course',
      courseVersion: '1',
      dialogues: {
        'drinkit': DialogueProgress(
          dialogueId: 'drinkit',
          status: 'inProgress',
          currentNodeId: 'bus',
          choices: const ['invent-directions', 'point-left'],
          updatedAt: DateTime.utc(2026, 7, 30, 12),
        ),
      },
    );

    final restored = CourseProgress.fromJson(progress.toJson());

    expect(restored.dialogues['drinkit']?.currentNodeId, 'bus');
    expect(restored.dialogues['drinkit']?.choices, hasLength(2));
    expect(restored.dialogues['drinkit']?.isCompleted, isFalse);
  });
}
