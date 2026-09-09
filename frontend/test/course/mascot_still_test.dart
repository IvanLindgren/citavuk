import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/state/lesson_controller.dart';
import 'package:srbski_read/course/widgets/bone_mascot.dart';
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

    BoneMascot mascotOf(String key) => tester.widget<BoneMascot>(
          find.descendant(
            of: find.byKey(Key(key)),
            matching: find.byType(BoneMascot),
          ),
        );

    expect(mascotOf('still').still, isTrue);
    expect(mascotOf('animated').still, isFalse);
  });
}
