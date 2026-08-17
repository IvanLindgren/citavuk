import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/state/lesson_controller.dart';
import 'package:srbski_read/course/widgets/citavuk_sprite.dart';
import 'package:srbski_read/course/widgets/mascot_view.dart';

/// Читавук одним кадром.
///
/// На карте курса он крутился в шапке восемь кадров в секунду и перерисовывал
/// себя поверх всего списка — прокрутка дёргалась. Там, где Читавук просто
/// оформление, тикер заводиться не должен.
///
/// Оба случая проверяются в одном тесте: манифест анимаций кешируется
/// статически, а Future, созданный в другом тесте, в новом уже не завершится.
void main() {
  testWidgets('признак «один кадр» доходит от маскота до спрайта',
      (tester) async {
    MascotSprites.reset();

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Row(
            children: [
              MascotView(
                key: Key('still'),
                state: MascotState.idle,
                size: 64,
                still: true,
              ),
              MascotView(
                key: Key('animated'),
                state: MascotState.idle,
                size: 64,
              ),
            ],
          ),
        ),
      ),
    );

    // Манифест читается с диска: без реального ожидания FutureBuilder покажет
    // запасной статичный арт, а не спрайт.
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 200));
    });
    await tester.pump();

    CitavukSprite spriteOf(String key) => tester.widget<CitavukSprite>(
          find.descendant(
            of: find.byKey(Key(key)),
            matching: find.byType(CitavukSprite),
          ),
        );

    expect(spriteOf('still').still, isTrue);
    expect(spriteOf('animated').still, isFalse);
  });
}
