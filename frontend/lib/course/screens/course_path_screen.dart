/// Карта курса: извилистая тропа больших круглых уровней (master-prompt §9).
///
/// Механика — как у современных language-learning apps: крупные кнопки-уровни,
/// пузырь «НАЧАТЬ» над текущим, попап уровня с теорией и упражнениями. Но в
/// визуальном языке Citavuk: пергамент, сербский красный, индиго, золото и
/// Читавук вместо чужих персонажей (§9.3).
library;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show listEquals;
import 'package:provider/provider.dart';
import 'package:scrollable_positioned_list/scrollable_positioned_list.dart';

import '../../state/app_settings.dart';
import '../../theme/app_theme.dart';
import '../../screens/grammar_cards_screen.dart';
import '../models/course.dart';
import '../models/exercise.dart';
import '../models/progress.dart';
import '../state/course_controller.dart';
import '../state/lesson_controller.dart';
import '../widgets/course_button.dart';
import '../widgets/intro_blocks_view.dart';
import '../widgets/path_node.dart';
import '../widgets/course_art.dart';
import '../../widgets/stove_icon.dart';
import 'lesson_screen.dart';
import 'trainer_screen.dart';
import '../../services/study_service.dart';

class CoursePathScreen extends StatefulWidget {
  const CoursePathScreen({super.key, required this.controller});

  final CourseController controller;

  @override
  State<CoursePathScreen> createState() => _CoursePathScreenState();
}

class _CoursePathScreenState extends State<CoursePathScreen> {
  bool _openingLocked = false;
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onChanged);
    if (widget.controller.state == CourseLoadState.idle) {
      widget.controller.load();
    }
  }

  void _onChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChanged);
    super.dispose();
  }

  /// Нажатие на уровень: попап с теорией и стартом. Закрытый уровень честно
  /// объясняет, чего не хватает, а не молчит.
  Future<void> _openNode(Lesson lesson) async {
    final controller = widget.controller;
    final course = controller.course;
    if (course == null) return;

    final status = controller.statusOf(lesson);
    if (status == LessonStatus.locked) {
      if (_openingLocked) return;
      _openingLocked = true;
      try {
        final start = await _showLockedSheet(lesson);
        if (!mounted || start != true) return;
        await controller.startFrom(lesson.id);
        if (mounted) await _startLesson(lesson);
      } catch (_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Не удалось открыть урок. Попробуй ещё раз.')));
        }
      } finally {
        _openingLocked = false;
      }
      return;
    }

    final action = await _showNodeSheet(lesson, status);
    if (!mounted) return;
    if (action == _NodeAction.theory) {
      final next = await _showTheorySheet(lesson);
      if (!mounted || next != _NodeAction.start) return;
      await _startLesson(lesson);
      return;
    }
    if (action == _NodeAction.start) {
      await _startLesson(lesson);
    }
  }

  Future<void> _startLesson(Lesson lesson) async {
    final controller = widget.controller;
    final course = controller.course;
    if (course == null || !controller.canOpen(lesson)) return;

    final active = controller.progress?.activeLesson;
    final restoreFrom =
        active != null && active['lessonId'] == lesson.id ? active : null;

    final summary = await Navigator.of(context).push<LessonSummary>(
      MaterialPageRoute(
        builder: (_) => LessonScreen(
          lesson: lesson,
          course: course,
          restoreFrom: restoreFrom,
          onSnapshot: controller.saveActiveLesson,
        ),
      ),
    );
    if (summary != null) {
      await controller.completeLesson(summary);
    }
  }

  /// Попап уровня: название, тема, статус и действия.
  Future<_NodeAction?> _showNodeSheet(Lesson lesson, LessonStatus status) {
    final controller = widget.controller;
    final skill = controller.course?.skillOfLesson(lesson.id);
    final record = controller.progress?.lessons[lesson.id];
    final hasTheory = lesson.intro != null;

    final startLabel = switch (status) {
      LessonStatus.needsReview => 'Повторить урок',
      LessonStatus.completed || LessonStatus.mastered => 'Пройти ещё раз',
      LessonStatus.inProgress => 'Продолжить урок',
      _ => lesson.isCheckpoint ? 'Начать проверку' : 'Начать урок',
    };

    return showModalBottomSheet<_NodeAction>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                lesson.title,
                style:
                    const TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
              ),
              if (skill != null) ...[
                const SizedBox(height: 4),
                Text(
                  skill.title,
                  style: TextStyle(
                    fontSize: 14,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.65),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              _StatusLine(
                status: status,
                isCheckpoint: lesson.isCheckpoint,
                exerciseCount: lesson.exercises.length,
                bestScore: record?.bestScore ?? 0,
              ),
              const SizedBox(height: 20),
              if (hasTheory) ...[
                CourseButton(
                  label: 'Теория',
                  icon: Icons.menu_book_outlined,
                  tone: CourseButtonTone.neutral,
                  onPressed: () =>
                      Navigator.of(context).pop(_NodeAction.theory),
                ),
                const SizedBox(height: 12),
              ],
              CourseButton(
                label: startLabel,
                icon: Icons.play_arrow,
                onPressed: () => Navigator.of(context).pop(_NodeAction.start),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Теория уровня: структурированное вступление без старта упражнений.
  Future<_NodeAction?> _showTheorySheet(Lesson lesson) {
    final blocks = lesson.intro?.effectiveBlocks ?? const <IntroBlock>[];
    return showModalBottomSheet<_NodeAction>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.75,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          builder: (context, scroll) => Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.menu_book_outlined, size: 32),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              lesson.title,
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      IntroBlocksView(blocks: blocks),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: CourseButton(
                  label: 'К упражнениям',
                  icon: Icons.play_arrow,
                  onPressed: () => Navigator.of(context).pop(_NodeAction.start),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<bool?> _showLockedSheet(Lesson lesson) {
    return showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.lock,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.55),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      lesson.title,
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Этот урок идёт после предыдущих тем. Если ты уже знаком с ними, можно начать отсюда.',
                style: TextStyle(fontSize: 15, height: 1.45),
              ),
              const SizedBox(height: 18),
              const Text(
                  'Пройденные уроки сохранятся. Пропущенные темы не дают опыт и серию. Незавершённая попытка будет сброшена.'),
              const SizedBox(height: 18),
              CourseButton(
                  label: 'Уже знаю, открыть урок',
                  onPressed: () => Navigator.of(context).pop(true)),
              const SizedBox(height: 12),
              CourseButton(
                label: 'Отмена',
                tone: CourseButtonTone.neutral,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Scaffold(
      appBar: AppBar(
        // Раздел открывается вкладкой нижней навигации, поэтому стрелки
        // «назад» здесь быть не должно.
        automaticallyImplyLeading: false,
        title: const Row(
          children: [
            Flexible(
              child: Text('Курс сербского', overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
        actions: [
          // Тренажёрка — вход в произвольный момент, а не по порядку курса,
          // поэтому она в шапке, а не только карточкой в конце карты.
          if (controller.course != null)
            IconButton(
              icon: const Icon(Icons.fitness_center),
              tooltip: 'Тренажёрка',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => TrainerScreen(course: controller.course!),
                ),
              ),
            ),
          Builder(builder: (context) {
            final settings = context.watch<AppSettings>();
            final on = settings.courseSoundEnabled;
            return TextButton.icon(
              icon: Icon(
                  on ? Icons.volume_up_outlined : Icons.volume_off_outlined,
                  size: 20),
              label: Text(on ? 'Звук' : 'Без звука'),
              onPressed: () => settings.setCourseSoundEnabled(!on),
            );
          }),
          IconButton(
            icon: const Icon(Icons.menu_book_outlined),
            tooltip: 'Справочник правил',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const GrammarCardsScreen()),
            ),
          ),
        ],
      ),
      body: switch (controller.state) {
        CourseLoadState.ready => _PathBody(
            controller: controller,
            onOpenNode: _openNode,
          ),
        CourseLoadState.error => _ErrorBody(
            error: controller.error,
            onRetry: controller.load,
          ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

/// Действие, выбранное в попапе уровня.
enum _NodeAction { theory, start }

/// Строка статуса в попапе уровня.
class _StatusLine extends StatelessWidget {
  const _StatusLine({
    required this.status,
    required this.isCheckpoint,
    required this.exerciseCount,
    required this.bestScore,
  });

  final LessonStatus status;
  final bool isCheckpoint;
  final int exerciseCount;
  final double bestScore;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = switch (status) {
      LessonStatus.available => 'Доступно',
      LessonStatus.inProgress => 'Начато',
      LessonStatus.completed => 'Пройдено',
      LessonStatus.mastered => 'Освоено',
      LessonStatus.needsReview => 'Пора повторить',
      LessonStatus.locked => 'Закрыто',
    };
    final parts = [
      isCheckpoint ? 'Контрольная точка' : '$exerciseCount заданий',
      label,
      if (bestScore > 0) 'лучший результат ${(bestScore * 100).round()}%',
    ];
    return Wrap(spacing: 10, runSpacing: 8, children: [
      for (final part in parts)
        Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(9)),
            child: Text(part,
                style:
                    TextStyle(fontSize: 13, color: scheme.onSurfaceVariant))),
    ]);
  }
}

class _PathBody extends StatefulWidget {
  const _PathBody({required this.controller, required this.onOpenNode});
  final CourseController controller;
  final ValueChanged<Lesson> onOpenNode;
  @override
  State<_PathBody> createState() => _PathBodyState();
}

class _PathBodyState extends State<_PathBody> {
  final _scroll = ItemScrollController();
  CourseController get controller => widget.controller;
  @override
  Widget build(BuildContext context) {
    final course = controller.course!;
    final scheme = Theme.of(context).colorScheme;
    final rows = <WidgetBuilder>[
      (_) => _HeaderCard(
          controller: controller,
          onContinue: () {
            final lesson = controller.nextLesson;
            if (lesson != null) widget.onOpenNode(lesson);
          }),
      (_) => const SizedBox(height: 24),
      for (var u = 0; u < course.units.length; u++) ...[
        (_) => _UnitSection(
            unit: course.units[u],
            index: u,
            controller: controller,
            onOpenNode: widget.onOpenNode),
        (_) => const SizedBox(height: 30),
      ],
      (_) => _TrainerCard(course: course),
    ];
    final list = ScrollablePositionedList.builder(
      itemScrollController: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      itemCount: rows.length,
      itemBuilder: (context, index) => rows[index](context),
    );
    return LayoutBuilder(builder: (context, limits) {
      if (limits.maxWidth < 1050) return list;
      return Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1320),
              child:
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(
                    width: 240,
                    child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(20, 30, 14, 20),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Твоя программа',
                                  style: TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600)),
                              const SizedBox(height: 20),
                              LinearProgressIndicator(
                                  value: controller.completionRatio,
                                  minHeight: 6,
                                  borderRadius: BorderRadius.circular(8)),
                              const SizedBox(height: 18),
                              for (var i = 0; i < course.units.length; i++)
                                TextButton(
                                    onPressed: () {
                                      if (!_scroll.isAttached) return;
                                      if (MediaQuery.disableAnimationsOf(
                                          context)) {
                                        _scroll.jumpTo(index: 2 + i * 2);
                                      } else {
                                        _scroll.scrollTo(
                                            index: 2 + i * 2,
                                            duration: const Duration(
                                                milliseconds: 280),
                                            curve: Curves.easeOutCubic);
                                      }
                                    },
                                    style: TextButton.styleFrom(
                                        alignment: Alignment.centerLeft,
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 14, horizontal: 8)),
                                    child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text('${i + 1}'.padLeft(2, '0'),
                                              style: TextStyle(
                                                  color: scheme.primary,
                                                  fontSize: 12)),
                                          const SizedBox(width: 12),
                                          Expanded(
                                              child: Text(course.units[i].title,
                                                  style: TextStyle(
                                                      fontSize: 13,
                                                      height: 1.5,
                                                      color: scheme
                                                          .onSurfaceVariant))),
                                        ])),
                              const SizedBox(height: 22),
                              Text(
                                  'Знакомые темы можно пропустить. Нажми на урок с замком и подтверди, что знаешь предыдущее.',
                                  style: TextStyle(
                                      fontSize: 12,
                                      height: 1.7,
                                      color: scheme.onSurfaceVariant)),
                            ]))),
                Expanded(child: list),
              ])));
    });
  }
}

/// На десктопе глава и её путь образуют одну сцену: описание занимает левую
/// колонку, уроки — правую. На телефоне блоки естественно складываются вниз.
class _UnitSection extends StatelessWidget {
  const _UnitSection({
    required this.unit,
    required this.index,
    required this.controller,
    required this.onOpenNode,
  });

  final CourseUnit unit;
  final int index;
  final CourseController controller;
  final ValueChanged<Lesson> onOpenNode;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final banner = _UnitBanner(unit: unit, index: index);
          final path = _LessonPath(
            unit: unit,
            unitIndex: index,
            controller: controller,
            onOpenNode: onOpenNode,
          );
          return Container(
              decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant)),
              child: Column(children: [
                banner,
                const SizedBox(height: 18),
                Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 720),
                        child: path))
              ]));
        },
      );
}

/// Баннер раздела: номер, название и описание на плашке основного цвета.
class _UnitBanner extends StatelessWidget {
  const _UnitBanner({required this.unit, required this.index});

  final CourseUnit unit;
  final int index;

  @override
  Widget build(BuildContext context) {
    const colors = [Color(0xFF94332D), Color(0xFF846035), Color(0xFF4E6B50)];
    final color = colors[index % colors.length];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
      decoration: BoxDecoration(
        color: color,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(23)),
        border: const Border(
            bottom: BorderSide(color: Color(0xFFD3B280), width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'РАЗДЕЛ ${index + 1}',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
              color: Color(0xFFF4DDC3),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            unit.title,
            style: const TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w600,
              color: Colors.white,
              height: 1.2,
            ),
          ),
          if (unit.description.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              unit.description,
              style: const TextStyle(
                fontSize: 13.5,
                height: 1.4,
                color: Color(0xFFF4E6D8),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Извилистая тропа уровней раздела.
///
/// Узлы смещаются влево-вправо по синусоидальному паттерну; на широких
/// экранах рядом с тропой парит Читавук.
class _LessonPath extends StatelessWidget {
  const _LessonPath(
      {required this.unit,
      required this.unitIndex,
      required this.controller,
      required this.onOpenNode});
  final CourseUnit unit;
  final int unitIndex;
  final CourseController controller;
  final ValueChanged<Lesson> onOpenNode;
  static const _wave = [.27, .27, .47, .67, .67, .47];

  @override
  Widget build(BuildContext context) {
    final lessons = unit.lessons.toList();
    final next = controller.nextLesson;
    final textScale =
        (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 2.5);
    final step = 214 * textScale;
    final done = lessons.isNotEmpty &&
        lessons.every((l) => [
              LessonStatus.completed,
              LessonStatus.mastered,
              LessonStatus.needsReview
            ].contains(controller.statusOf(l)));
    return LayoutBuilder(builder: (context, limits) {
      final points = [
        for (var i = 0; i < lessons.length; i++)
          Offset(limits.maxWidth * _wave[i % _wave.length], i * step + 82)
      ];
      final artSize = limits.maxWidth < 390
          ? 136.0
          : limits.maxWidth < 520
              ? 172.0
              : 225.0;
      return SizedBox(
          height: lessons.length * step + 24,
          width: double.infinity,
          child: Stack(clipBehavior: Clip.hardEdge, children: [
            Positioned.fill(
                child: RepaintBoundary(
                    child: CustomPaint(
                        painter: _CourseTrailPainter(
                            points: points,
                            statuses: [
                              for (final lesson in lessons)
                                controller.statusOf(lesson)
                            ],
                            line: Theme.of(context).colorScheme.outlineVariant,
                            done: Theme.of(context).colorScheme.success)))),
            if (lessons.isNotEmpty)
              Positioned(
                  top: 58,
                  left: limits.maxWidth * .74 - artSize / 2,
                  child: CourseArt(
                      pose: done
                          ? 'celebrate'
                          : unitIndex.isEven
                              ? 'guide'
                              : 'reading',
                      size: artSize)),
            for (var i = 0; i < lessons.length; i++)
              Positioned(
                  top: i * step,
                  left: points[i].dx - 70,
                  width: 140,
                  child: _buildNode(lessons[i], next)),
          ]));
    });
  }

  Widget _buildNode(Lesson lesson, Lesson? next) {
    final status = controller.statusOf(lesson);
    final record = controller.progress?.lessons[lesson.id];
    final isCurrent = next?.id == lesson.id;

    final bubble = !isCurrent
        ? null
        : switch (status) {
            LessonStatus.inProgress => 'ПРОДОЛЖИТЬ',
            LessonStatus.needsReview => 'ПОВТОРИТЬ',
            _ => 'НАЧАТЬ',
          };

    final statusLabel = switch (status) {
      LessonStatus.available => 'Доступно',
      LessonStatus.inProgress => 'Начато',
      LessonStatus.completed => 'Пройдено',
      LessonStatus.mastered => 'Освоено',
      LessonStatus.needsReview => 'Нужно повторить',
      LessonStatus.locked => 'Закрыто',
    };

    return PathNode(
      status: status,
      caption:
          record?.skipped == true ? '${lesson.title}\nПропущено' : lesson.title,
      isCheckpoint: lesson.isCheckpoint,
      bestScore: record?.bestScore ?? 0,
      bubbleText: bubble,
      lessonIcon: _lessonIcon(lesson),
      semanticLabel: '${lesson.title}. $statusLabel',
      onTap: () => onOpenNode(lesson),
    );
  }

  IconData _lessonIcon(Lesson lesson) {
    if (lesson.isCheckpoint) return Icons.emoji_events_rounded;
    if (lesson.optional) return Icons.explore_outlined;
    final exercises = lesson.exercises;
    if (exercises.any((exercise) => exercise is ReadingQaExercise)) {
      return Icons.auto_stories_rounded;
    }
    if (exercises.any((exercise) => exercise is FormHuntExercise)) {
      return Icons.search_rounded;
    }
    if (exercises.any((exercise) => exercise is MatchingExercise)) {
      return Icons.style_rounded;
    }
    if (exercises.any((exercise) =>
        exercise is SentenceBuilderExercise || exercise is FillBlankExercise)) {
      return Icons.account_tree_rounded;
    }
    if (exercises.any((exercise) =>
        exercise is LetterUnscrambleExercise ||
        exercise is EndingPickerExercise)) {
      return Icons.spellcheck_rounded;
    }
    return lesson.intro != null
        ? Icons.menu_book_rounded
        : Icons.play_arrow_rounded;
  }
}

class _CourseTrailPainter extends CustomPainter {
  const _CourseTrailPainter({
    required this.points,
    required this.statuses,
    required this.line,
    required this.done,
  });

  final List<Offset> points;
  final List<LessonStatus> statuses;
  final Color line;
  final Color done;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    for (var i = 0; i < points.length - 1; i++) {
      final from = points[i];
      final to = points[i + 1];
      final completed = statuses[i] == LessonStatus.completed ||
          statuses[i] == LessonStatus.mastered;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = completed ? 6 : 4
        ..strokeCap = StrokeCap.round
        ..color = completed ? done : line;
      final bend = (to.dy - from.dy) * .46;
      final route = Path()..moveTo(from.dx, from.dy);
      if ((to.dx - from.dx).abs() < 1 && to.dy > from.dy) {
        final side = from.dx > size.width / 2 ? 100.0 : -100.0;
        route.cubicTo(
            from.dx + side, from.dy, to.dx + side, to.dy, to.dx, to.dy);
      } else {
        route.cubicTo(
          from.dx,
          from.dy + bend,
          to.dx,
          to.dy - bend,
          to.dx,
          to.dy,
        );
      }
      canvas.drawPath(route, paint);
    }
  }

  @override
  bool shouldRepaint(_CourseTrailPainter old) =>
      !listEquals(old.points, points) ||
      !listEquals(old.statuses, statuses) ||
      old.line != line ||
      old.done != done;
}

/// Шапка: маскот, общий прогресс, серия и опыт.
class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.controller, required this.onContinue});
  final CourseController controller;
  final VoidCallback onContinue;
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final progress = controller.progress!;
    final next = controller.nextLesson;
    final completed = controller.course!.allLessons
        .where((l) => [
              LessonStatus.completed,
              LessonStatus.mastered,
              LessonStatus.needsReview
            ].contains(controller.statusOf(l)))
        .length;
    return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            border: Border.all(color: scheme.outlineVariant),
            borderRadius: BorderRadius.circular(26)),
        child: LayoutBuilder(builder: (context, limits) {
          final compact = limits.maxWidth < 600;
          final heading =
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('ТВОЙ МАРШРУТ',
                style: TextStyle(
                    color: scheme.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2)),
            const SizedBox(height: 12),
            Text(controller.course!.title,
                style: TextStyle(
                    fontFamily: 'NotoSans',
                    fontSize: compact ? 28 : 36,
                    fontWeight: FontWeight.w600,
                    height: 1.15,
                    color: scheme.onSurface)),
          ]);
          final details =
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const SizedBox(height: 16),
            Text(
                'От азбуки до причастий. Разбирайся в правилах и сразу пробуй их в деле.',
                style: TextStyle(
                    fontSize: 15, height: 1.7, color: scheme.onSurfaceVariant)),
            const SizedBox(height: 20),
            if (next != null)
              FilledButton.icon(
                  onPressed: onContinue,
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Продолжить занятия'),
                  style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 16))),
            if (next != null)
              Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text('Следующий урок: ${next.title}',
                      style: TextStyle(
                          fontSize: 12,
                          height: 1.5,
                          color: scheme.onSurfaceVariant))),
            const SizedBox(height: 20),
            LinearProgressIndicator(
                value: controller.completionRatio,
                minHeight: 6,
                borderRadius: BorderRadius.circular(8)),
            const SizedBox(height: 18),
            Wrap(spacing: 10, runSpacing: 8, children: [
              ListenableBuilder(
                  listenable: StudyService.instance,
                  builder: (context, _) => _StatChip(
                      icon: const StoveIcon(size: 18),
                      label: 'Серия',
                      value:
                          '${StudyService.instance.snapshot?['current'] ?? progress.streak.currentDays} дн.')),
              _StatChip(
                  icon: const Icon(Icons.star_outline),
                  label: 'Опыт',
                  value: '${progress.xp}'),
              _StatChip(
                  icon: const Icon(Icons.check_rounded),
                  label: 'Уроки',
                  value:
                      '$completed / ${controller.course!.allLessons.length}'),
            ]),
          ]);
          if (compact) {
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(child: heading),
                    const SizedBox(width: 8),
                    const CourseArt(size: 145)
                  ]),
                  details,
                ]);
          }
          return Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [heading, details])),
            const SizedBox(width: 20),
            const CourseArt(size: 245)
          ]);
        }));
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip(
      {required this.icon, required this.label, required this.value});

  /// Знак приходит виджетом: у серии дней это картинка печи, а не значок
  /// шрифта. Обычные значки размер и цвет берут из [IconTheme] ниже.
  final Widget icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: '$label: $value',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.primary.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconTheme(
              data: IconThemeData(size: 18, color: scheme.tertiary),
              child: icon,
            ),
            const SizedBox(width: 8),
            Flexible(
                child: Text.rich(
                    TextSpan(children: [
                      TextSpan(text: '$label: '),
                      TextSpan(
                          text: value,
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                    ]),
                    style: const TextStyle(fontSize: 13, height: 1.5))),
          ],
        ),
      ),
    );
  }
}

/// Вход в тренажёрку.
///
/// Стоит внизу карты, но открывает темы независимо от того, докуда дошёл
/// человек: сюда приходят, когда конкретное правило не даётся, а не по
/// порядку прохождения.
class _TrainerCard extends StatelessWidget {
  const _TrainerCard({required this.course});

  final Course course;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.primary.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => TrainerScreen(course: course)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Icon(Icons.fitness_center, color: scheme.primary, size: 28),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Тренажёрка',
                      style:
                          TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Задания по выбранной теме грамматики, без порядка уроков.',
                      style: TextStyle(
                        fontSize: 13.5,
                        height: 1.35,
                        color: scheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right,
                  color: scheme.onSurface.withValues(alpha: 0.45)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.error, required this.onRetry});

  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 42, color: scheme.error),
            const SizedBox(height: 14),
            const Text(
              'Не удалось загрузить курс',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              '$error',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: scheme.onSurface.withValues(alpha: 0.65),
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Повторить'),
            ),
          ],
        ),
      ),
    );
  }
}
