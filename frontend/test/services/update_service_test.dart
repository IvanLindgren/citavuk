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
}
