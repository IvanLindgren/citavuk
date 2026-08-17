import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:srbski_read/services/listening_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('selected Serbian voice is persisted and included in TTS URL', () async {
    SharedPreferences.setMockInitialValues({});
    final service = ListeningService.instance;

    await service.setVoice('nicholas');

    expect(service.voice, 'nicholas');
    expect(service.ttsUrl('Dobar dan'), contains('voice=nicholas'));
    expect(
      (await SharedPreferences.getInstance()).getString('citavuk_tts_voice'),
      'nicholas',
    );
    await service.setVoice('sophie');
  });

  group('список эпизодов', () {
    test('эпизод без реплик остаётся: расшифровка приходит отдельно', () {
      final lessons = ListeningService.parseLessons('''
        {"items": [
          {"id": "moze-kafa-1", "title": "Može kafa 1",
           "subtitle": "Može kafa · 24 мин",
           "audio_url": "https://cdn.example/1.mp3",
           "cues": [],
           "transcript_url": "https://citavuk.ru/transcripts/1.json",
           "duration": 1440}
        ]}
      ''');

      expect(lessons, hasLength(1));
      expect(lessons.single.cues, isEmpty);
      expect(lessons.single.transcriptUrl, isNotNull);
    });

    test('эпизод без аудио и без реплик отбрасывается', () {
      final lessons = ListeningService.parseLessons('''
        {"items": [
          {"id": "empty", "title": "Пусто", "audio_url": "", "cues": []},
          {"id": "", "title": "Без id", "audio_url": "https://cdn/2.mp3"}
        ]}
      ''');

      expect(lessons, isEmpty);
    });
  });
}
