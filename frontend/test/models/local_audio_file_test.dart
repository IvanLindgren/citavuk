import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/models/local_audio_file.dart';

void main() {
  test('расшифровка сохраняет говорящих и точные таймкоды слов', () {
    final transcript = AudioTranscript.fromJson({
      'language_code': 'srp',
      'language_probability': .97,
      'duration': 2.4,
      'speakers': ['speaker_0', 'speaker_1'],
      'segments': [
        {
          'speaker': 'speaker_0',
          'start': .2,
          'end': 1.1,
          'text': 'Dobar dan.',
          'words': [
            {'text': 'Dobar', 'start': .2, 'end': .6},
            {'text': 'dan', 'start': .7, 'end': 1.0},
          ],
        },
      ],
    });

    expect(transcript.speakers, ['speaker_0', 'speaker_1']);
    expect(transcript.segments.single.words.last.start, .7);
    expect(AudioTranscript.fromEncoded(transcript.encode()).duration, 2.4);
  });

  test('ответ без подтверждённого сербского отклоняется', () {
    expect(
      () => AudioTranscript.fromJson({
        'language_code': 'eng',
        'segments': const [],
      }),
      throwsFormatException,
    );
  });
}
