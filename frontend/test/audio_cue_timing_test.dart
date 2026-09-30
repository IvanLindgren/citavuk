import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/audio_lesson.dart';

void main() {
  test('ASR seeks repeated words and never invents recording word times', () {
    final cue = AudioCue.fromJson({'text': 'Ovo je ovo.', 'start': 1, 'end': 5, 'words': [
      {'text': 'Ovo', 'start': 1, 'end': 1.5}, {'text': 'je', 'start': 2, 'end': 2.2}, {'text': 'ovo.', 'start': 4, 'end': 4.6},
    ]});
    expect(cue.characterAt(4.1), 7);
    expect(cue.timeAtCharacter(8), 4);
    expect(cue.characterAt(3), -1);
    expect(const AudioCue(text: 'Bez tajminga', start: 1, end: 5).characterAt(2), -1);
  });
}
