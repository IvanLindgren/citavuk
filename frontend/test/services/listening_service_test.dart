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
}
