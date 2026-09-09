import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../course/widgets/course_art.dart';

class PersonalLessonHero extends StatelessWidget {
  const PersonalLessonHero(
      {super.key,
      required this.day,
      required this.kind,
      required this.title,
      required this.theme});
  final int day;
  final String kind, title, theme;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: scheme.outlineVariant)),
        child: LayoutBuilder(builder: (context, limits) {
          final emblem = SizedBox(
              width: limits.maxWidth > 600 ? 150 : 94,
              height: limits.maxWidth > 600 ? 150 : 94,
              child: RepaintBoundary(
                  child: Stack(alignment: Alignment.center, children: [
                Container(
                    decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: scheme.primary.withValues(alpha: .07),
                        border: Border.all(
                            color: scheme.tertiary.withValues(alpha: .4)))),
                FractionallySizedBox(
                    widthFactor: .8,
                    heightFactor: .8,
                    child: SvgPicture.asset('assets/course/lesson-swords.svg',
                        colorFilter: ColorFilter.mode(
                            scheme.tertiary, BlendMode.srcIn))),
                FractionallySizedBox(
                    widthFactor: .5,
                    heightFactor: .5,
                    child: SvgPicture.asset('assets/course/lesson-helm.svg',
                        colorFilter:
                            ColorFilter.mode(scheme.primary, BlendMode.srcIn))),
              ])));
          return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text('КАРТА $day',
                            style: TextStyle(
                                color: scheme.primary,
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                                letterSpacing: 1.2)),
                        const SizedBox(height: 8),
                        Text(kind,
                            style: TextStyle(
                                color: scheme.onSurfaceVariant, fontSize: 14)),
                      ])),
                  emblem
                ]),
                const SizedBox(height: 12),
                Text(title,
                    style: TextStyle(
                        fontFamily: 'Lora',
                        fontWeight: FontWeight.w700,
                        fontSize: limits.maxWidth > 600 ? 34 : 26,
                        height: 1.25)),
                const SizedBox(height: 14),
                Container(width: 42, height: 3, color: scheme.primary),
                const SizedBox(height: 14),
                Text(theme,
                    style: TextStyle(
                        fontSize: 15,
                        height: 1.6,
                        color: scheme.onSurfaceVariant)),
              ]);
        }));
  }
}

class LessonRuleNote extends StatelessWidget {
  const LessonRuleNote({super.key, required this.index, required this.text});
  final int index;
  final String text;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(14),
            border: Border(left: BorderSide(color: scheme.primary, width: 3))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$index'.padLeft(2, '0'),
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: scheme.primary)),
          const SizedBox(width: 14),
          Expanded(
              child: SelectableText(text,
                  style: const TextStyle(fontSize: 16, height: 1.7)))
        ]));
  }
}

class PersonalDeckIntro extends StatelessWidget {
  const PersonalDeckIntro({super.key});
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
        padding: const EdgeInsets.all(22),
        margin: const EdgeInsets.only(bottom: 20),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            border: Border.all(color: scheme.outlineVariant),
            borderRadius: BorderRadius.circular(24)),
        child: LayoutBuilder(builder: (context, limits) {
          final copy =
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('ТВОЯ ЛИЧНАЯ КОЛОДА',
                style: TextStyle(
                    color: scheme.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.1)),
            const SizedBox(height: 12),
            Text('Колода сербского. Ого!',
                style: TextStyle(
                    fontFamily: 'Lora',
                    fontSize: limits.maxWidth > 600 ? 32 : 26,
                    fontWeight: FontWeight.w700,
                    height: 1.3)),
            const SizedBox(height: 14),
            Text(
                'Волк Читавук разрисовал игральные карты, и теперь с помощью колоды вы можете самостоятельно создать себе уроки... На каждый день!',
                style: TextStyle(
                    color: scheme.onSurfaceVariant, fontSize: 15, height: 1.7)),
          ]);
          return limits.maxWidth > 650
              ? Row(children: [
                  Expanded(child: copy),
                  const SizedBox(width: 30),
                  const CourseArt(pose: 'reading', size: 190)
                ])
              : copy;
        }));
  }
}
