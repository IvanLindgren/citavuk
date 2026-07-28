import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/services/sprite_manifest.dart';

const String _valid = '''
{
  "version": 1,
  "animations": [
    {
      "id": "citavuk_learning",
      "asset": "assets/animations/generated/citavuk_learning.png",
      "frameWidth": 451,
      "frameHeight": 512,
      "columns": 2,
      "rows": 2,
      "frames": 4,
      "fps": 8,
      "loop": true,
      "anchor": {"x": 0.5, "y": 1},
      "sourceChecksum": "sha256:abc",
      "states": ["idle", "thinking"]
    }
  ]
}
''';

void main() {
  group('разбор manifest', () {
    test('читает поля анимации', () {
      final m = SpriteManifest.parse(_valid);
      expect(m.version, 1);
      final spec = m.byId['citavuk_learning']!;
      expect(spec.frames, 4);
      expect(spec.columns, 2);
      expect(spec.fps, 8);
      expect(spec.loop, isTrue);
      expect(spec.anchorY, 1.0);
      expect(spec.sourceChecksum, 'sha256:abc');
    });

    test('строит индекс по состояниям маскота', () {
      final m = SpriteManifest.parse(_valid);
      expect(m.byState['idle']?.id, 'citavuk_learning');
      expect(m.byState['thinking']?.id, 'citavuk_learning');
      expect(m.byState['correct'], isNull);
    });

    test('вычисляет длительность кадра из fps', () {
      final spec = SpriteManifest.parse(_valid).byId['citavuk_learning']!;
      expect(spec.frameDuration.inMilliseconds, 125);
    });

    test('вычисляет пропорции кадра', () {
      final spec = SpriteManifest.parse(_valid).byId['citavuk_learning']!;
      expect(spec.aspectRatio, closeTo(451 / 512, 0.0001));
    });

    test('отклоняет анимацию без id', () {
      final broken = _valid.replaceAll('"id": "citavuk_learning"', '"id": ""');
      expect(() => SpriteManifest.parse(broken), throwsFormatException);
    });

    test('отклоняет нулевое число кадров', () {
      final broken = _valid.replaceAll('"frames": 4', '"frames": 0');
      expect(() => SpriteManifest.parse(broken), throwsFormatException);
    });

    test('отклоняет сетку меньше числа кадров', () {
      final broken = _valid.replaceAll('"frames": 4', '"frames": 9');
      expect(
        () => SpriteManifest.parse(broken),
        throwsA(isA<FormatException>()
            .having((e) => e.message, 'message', contains('сетка'))),
      );
    });

    test('отклоняет пустой список анимаций', () {
      expect(
        () => SpriteManifest.parse('{"version": 1, "animations": []}'),
        throwsFormatException,
      );
    });
  });

  group('сгенерированный manifest', () {
    test('разбирается и ссылается на существующие atlas', () {
      final file = File('assets/animations/generated/manifest.json');
      expect(
        file.existsSync(),
        isTrue,
        reason: 'atlas не собран: запусти `go run .` в tools/sprite_build',
      );
      final manifest = SpriteManifest.parse(file.readAsStringSync());
      expect(manifest.byId, isNotEmpty);

      for (final spec in manifest.byId.values) {
        expect(File(spec.asset).existsSync(), isTrue,
            reason: 'нет файла atlas ${spec.asset}');
        expect(spec.columns * spec.rows, greaterThanOrEqualTo(spec.frames),
            reason: spec.id);
        expect(spec.sourceChecksum, startsWith('sha256:'), reason: spec.id);
      }
    });

    test('покрывает все состояния маскота, используемые уроком', () {
      final manifest = SpriteManifest.parse(
          File('assets/animations/generated/manifest.json').readAsStringSync());
      // Состояния из MascotState: каждое должно иметь анимацию или
      // осознанный статичный fallback.
      for (final state in [
        'idle',
        'thinking',
        'correct',
        'incorrect',
        'lessonComplete'
      ]) {
        expect(manifest.byState.containsKey(state), isTrue,
            reason: 'нет анимации для состояния $state');
      }
    });
  });
}
