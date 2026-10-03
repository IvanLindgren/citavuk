import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Вместо кадра из Flutter снимаем экран симулятора целиком: статус-бар и
/// Dynamic Island рисует система, во Flutter-кадре их нет.
Future<void> main() => integrationDriver(
      onScreenshot: (name, _, [args]) async {
        final dir = Platform.environment['SCREENSHOT_DIR'] ?? 'screenshots';
        await Directory(dir).create(recursive: true);
        final device = Platform.environment['SIMULATOR_UDID'] ?? 'booted';
        final result = await Process.run(
            'xcrun', ['simctl', 'io', device, 'screenshot', '$dir/$name.png']);
        if (result.exitCode != 0) stderr.writeln(result.stderr);
        return true;
      },
    );
