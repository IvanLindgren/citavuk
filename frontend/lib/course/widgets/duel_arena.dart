/// Части дуэли с переводчиком: спрайт Читавука и счётная полоса.
///
/// Своего оформления у дуэли нет. Цвета берутся из темы приложения: сторона
/// человека — `colorScheme.primary`, сторона машины — индиго палитры. Первая
/// версия была тёмной ареной с неоном и искрами; выглядела как чужая игра,
/// вставленная в Читавук, и была выброшена.
library;

import 'package:flutter/material.dart';

/// Сторона машины. Индиго из палитры проекта: холоднее акцента, но той же
/// семьи — читается как «другая сторона», а не как чужеродная подсветка.
const Color duelMachine = Color(0xFF2E3B5B);
const Color duelMachineDark = Color(0xFF7D8DB8);

/// Цвет стороны машины под текущую тему.
Color duelMachineOf(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? duelMachineDark : duelMachine;

/// Атлас поз: 5 колонок на 4 строки. Порядок задан листом, менять его нельзя.
enum DuelPose {
  taunt,
  card,
  study,
  compare,
  cheer,
  think,
  hurry,
  inspect,
  judge,
  know,
  typing,
  rhythm,
  strike,
  listen,
  smug,
  options,
  globe,
  hurt,
  hush,
  trophy;

  // Порядковый номер значения и есть место в атласе — поэтому позы перечислены
  // ровно в том порядке, в каком нарисованы на листе. Своего поля `index`
  // заводить нельзя: у Enum оно уже есть.
  static const int cols = 5;
  static const int rows = 4;
}

/// Один спрайт Читавука, вырезанный из общего листа.
///
/// Вырезается выравниванием, а не отдельными файлами: двадцать поз одним
/// изображением декодируются один раз, и смена позы происходит без подгрузки.
class DuelFighter extends StatelessWidget {
  const DuelFighter({super.key, required this.pose, this.width = 72});

  final DuelPose pose;
  final double width;

  @override
  Widget build(BuildContext context) {
    final col = pose.index % DuelPose.cols;
    final row = pose.index ~/ DuelPose.cols;
    const ratio = 250 / 285; // клетка исходника: ширина к высоте
    return SizedBox(
      width: width,
      height: width / ratio,
      child: ClipRect(
        child: Align(
          alignment: Alignment(
            col / (DuelPose.cols - 1) * 2 - 1,
            row / (DuelPose.rows - 1) * 2 - 1,
          ),
          widthFactor: 1 / DuelPose.cols,
          heightFactor: 1 / DuelPose.rows,
          child: Image.asset(
            'assets/imgs/citavuk_sprites_gamevsperevodchik.png',
            // Лист декодируется в память целиком, поэтому его сразу ужимают:
            // без cacheWidth это 1254 на 1254 точки и шесть мегабайт.
            cacheWidth: (width * DuelPose.cols * 2).round(),
            filterQuality: FilterQuality.medium,
          ),
        ),
      ),
    );
  }
}

/// Счёт раунда двумя встречными полосами.
///
/// Цифрами показываются выигранные предложения, а не внутренние очки полос:
/// «72 : 32» человеку ничего не говорит, «3 : 1» говорит всё.
class DuelScoreBar extends StatelessWidget {
  const DuelScoreBar({
    super.key,
    required this.hero,
    required this.foe,
    required this.max,
    required this.wonHero,
    required this.wonFoe,
    required this.foeName,
  });

  final int hero;
  final int foe;
  final int max;
  final int wonHero;
  final int wonFoe;
  final String foeName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final mine = theme.colorScheme.primary;
    final machine = duelMachineOf(context);
    final label = theme.textTheme.labelSmall?.copyWith(
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
    );
    return Column(
      children: [
        Row(
          children: [
            Text('ВЫ', style: label?.copyWith(color: mine)),
            const Spacer(),
            Text(
              '$wonHero : $wonFoe',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const Spacer(),
            Flexible(
              child: Text(
                foeName.toUpperCase(),
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: label?.copyWith(color: machine),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(child: _Half(value: hero, max: max, color: mine, flip: true)),
            const SizedBox(width: 6),
            Expanded(child: _Half(value: foe, max: max, color: machine)),
          ],
        ),
      ],
    );
  }
}

class _Half extends StatelessWidget {
  const _Half({required this.value, required this.max, required this.color, this.flip = false});

  final int value;
  final int max;
  final Color color;
  final bool flip;

  @override
  Widget build(BuildContext context) {
    final share = (value / max).clamp(0.0, 1.0);
    return Transform.scale(
      scaleX: flip ? -1 : 1,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: SizedBox(
          height: 6,
          child: Stack(
            children: [
              Positioned.fill(
                child: ColoredBox(color: Theme.of(context).colorScheme.surfaceContainerHighest),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: AnimatedFractionallySizedBox(
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOut,
                  widthFactor: share,
                  heightFactor: 1,
                  child: ColoredBox(color: color),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
