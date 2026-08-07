import 'package:srbski_read/models/reader_settings.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ReaderSettings', () {
    test('старые настройки остаются в постраничном режиме', () {
      final settings = ReaderSettings.fromMap(const {'fontSize': 22});

      expect(settings.flow, ReaderFlow.pages);
      expect(settings.fontSize, 22);
    });

    test('режим прокрутки сохраняется и восстанавливается', () {
      const source = ReaderSettings(flow: ReaderFlow.scroll);
      final restored = ReaderSettings.fromMap(source.toMap());

      expect(restored.flow, ReaderFlow.scroll);
    });

    test('неизвестный индекс режима не ломает настройки', () {
      final settings = ReaderSettings.fromMap(const {'flow': 99});

      expect(settings.flow, ReaderFlow.pages);
    });
  });
}
