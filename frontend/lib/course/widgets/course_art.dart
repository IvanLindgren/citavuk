import 'package:flutter/material.dart';

/// Общие с React иллюстрации: статичные, с прозрачностью, без фоновых тикеров.
class CourseArt extends StatelessWidget {
  const CourseArt({super.key, this.pose = 'guide', this.size = 220});
  final String pose;
  final double size;
  @override
  Widget build(BuildContext context) {
    const generated = {
      'reading-new', 'teaching', 'celebrating', 'thinking',
      'writing', 'listening', 'speaking', 'supporting'
    };
    final version = generated.contains(pose) ? 'v2' : 'v1';
    return ExcludeSemantics(
        child: RepaintBoundary(
            child: Image.asset(
          'assets/course/citavuk-$pose-$version.webp',
          width: size,
          height: size,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.medium,
          cacheWidth: (size * MediaQuery.devicePixelRatioOf(context))
              .ceil()
              .clamp(1, 720),
        )),
      );
  }
}
