import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'speaking_models.dart';

/// Рисованный значок жанра — тем же штрихом, что значки Путешествия. Разметку
/// отдаёт сервер вместе с каталогом тем (`speaking.validArt` пропускает только
/// простые фигуры); сайт рисует тот же значок из того же поля.
class GenreIcon extends StatelessWidget {
  const GenreIcon({super.key, required this.genre, this.size = 24, this.color});

  final SpeakingGenre? genre;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final tint = color ?? IconTheme.of(context).color ?? Theme.of(context).colorScheme.onSurface;
    final art = genre?.art ?? '';
    if (art.isEmpty) return Icon(Icons.chat_bubble_outline, size: size, color: tint);
    return SvgPicture.string(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" '
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">$art</svg>',
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
    );
  }
}
