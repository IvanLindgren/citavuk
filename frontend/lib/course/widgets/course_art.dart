import 'package:flutter/material.dart';

/// Общие с React иллюстрации: статичные, с прозрачностью, без фоновых тикеров.
class CourseArt extends StatelessWidget {
  const CourseArt({super.key, this.pose = 'guide', this.size = 220});
  final String pose;
  final double size;
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: RepaintBoundary(
            child: Image.asset(
          'assets/course/citavuk-$pose-v1.webp',
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
