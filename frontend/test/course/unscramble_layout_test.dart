import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/course/widgets/course_chip.dart';

void main() {
  testWidgets('плитки букв встают в ряд, а не по одной на строку',
      (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final letter in ['š', 'u', 'm', 'a', 'k', 'p'])
                    CourseChip(label: letter, onTap: () {}),
                ],
              ),
            ],
          ),
        ),
      ),
    ));

    for (final element in find.byType(CourseChip).evaluate()) {
      expect(element.size!.width, lessThan(100));
    }
    // Шесть плиток по ~48 пикселей помещаются в одну строку.
    expect(find.byType(Wrap).evaluate().first.size!.height, lessThan(60));
  });
}
