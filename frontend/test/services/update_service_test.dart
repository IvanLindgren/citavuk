import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/services/update_service.dart';

void main() {
  group('сравнение версий', () {
    test('более новая версия распознаётся', () {
      expect(UpdateService.isNewer('1.5.1', '1.5.0'), isTrue);
      expect(UpdateService.isNewer('1.6.0', '1.5.9'), isTrue);
      expect(UpdateService.isNewer('2.0.0', '1.9.9'), isTrue);
    });

    test('та же или более старая версия обновлением не считается', () {
      expect(UpdateService.isNewer('1.5.0', '1.5.0'), isFalse);
      expect(UpdateService.isNewer('1.4.9', '1.5.0'), isFalse);
    });

    // Строковое сравнение здесь ошибается: «1.5.10» < «1.5.9» как текст.
    test('числа сравниваются как числа', () {
      expect(UpdateService.isNewer('1.5.10', '1.5.9'), isTrue);
      expect(UpdateService.isNewer('1.5.9', '1.5.10'), isFalse);
    });

    test('номер сборки не мешает', () {
      expect(UpdateService.isNewer('1.5.1+17', '1.5.0+16'), isTrue);
      expect(UpdateService.isNewer('1.5.0+17', '1.5.0+16'), isTrue);
    });
  });

  group('что предлагается платформе', () {
    final manifest = <String, dynamic>{
      'version': '1.19.0',
      'notes': 'Что нового',
      'windows': {
        'version': '1.19.0',
        'url': 'https://citavuk.ru/files/citavuk-setup.exe',
        'size': 45198498,
      },
      'linux': {
        'version': '1.18.1',
        'url': 'https://citavuk.ru/files/citavuk-linux-x64.tar.gz',
        'size': 47727414,
      },
    };

    test('свежая сборка предлагается с её ссылкой и размером', () {
      final offer = UpdateService.offerFor(manifest, 'windows', '1.18.1+42');
      expect(offer?.version, '1.19.0');
      expect(offer?.url, endsWith('citavuk-setup.exe'));
      expect(offer?.size, 45198498);
      expect(offer?.notes, 'Что нового');
    });

    // Главное здесь: под Linux лежит старый архив, и обещать 1.19.0 нельзя.
    // Такое обновление ставится, версию не меняет и предлагается снова.
    test('версия берётся у платформы, а не общая', () {
      expect(UpdateService.offerFor(manifest, 'linux', '1.18.1+42'), isNull);
      expect(UpdateService.offerFor(manifest, 'linux', '1.18.0+41')?.version,
          '1.18.1');
    });

    test('без своей версии платформа читает общую', () {
      final old = <String, dynamic>{
        'version': '1.19.0',
        'windows': {'url': 'https://citavuk.ru/files/citavuk-setup.exe'},
      };
      expect(UpdateService.offerFor(old, 'windows', '1.18.1')?.version,
          '1.19.0');
    });

    test('своей сборки в манифесте нет — предлагать нечего', () {
      expect(UpdateService.offerFor(manifest, 'macos', '1.0.0'), isNull);
    });
  });
}
