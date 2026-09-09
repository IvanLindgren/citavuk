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
import '../../widgets/stove_icon.dart';
import 'lesson_screen.dart';
import 'trainer_screen.dart';
import 'course_entry_picker.dart';
import '../../services/study_service.dart';

class CoursePathScreen extends StatefulWidget {
  const CoursePathScreen({super.key, required this.controller});

  final CourseController controller;

  @override
  State<CoursePathScreen> createState() => _CoursePathScreenState();
}

class _CoursePathScreenState extends State<CoursePathScreen> {
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
      final start = await _showLockedSheet(lesson);
      if (mounted && start == true) await _chooseStart(lesson);
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
      builder: (context) => SafeArea(
        child: Padding(
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
              CourseButton(
                  label: 'Начать с этого урока',
                  onPressed: () => Navigator.of(context).pop(true)),
              const SizedBox(height: 12),
              CourseButton(
                label: 'Понятно',
                tone: CourseButtonTone.neutral,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _chooseStart(Lesson lesson) async {
    final course = widget.controller.course;
    if (course == null) return;
    final before = course.allLessons
        .takeWhile((l) => l.id != lesson.id)
        .where((l) =>
            !(widget.controller.progress?.lessons[l.id]?.isDone ?? false))
        .length;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: Text('Начать: ${lesson.title}?'),
              content: Text(
                  'Предыдущих тем будет отмечено как пропущенные: $before. Результаты пройденных уроков сохранятся. За пропуск не начисляются опыт, серия и награды. Незавершённая попытка будет сброшена.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Отмена')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Начать отсюда'))
              ],
            ));
    if (!mounted || confirmed != true) return;
    await widget.controller.startFrom(lesson.id);
    if (mounted) await _openNode(lesson);
  }

  Future<void> _pickStart() async {
    final course = widget.controller.course;
    if (course == null) return;
    final lesson = await showCourseEntryPicker(context, course);
    if (mounted && lesson != null) await _chooseStart(lesson);
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
          if (controller.course != null)
            IconButton(
                icon: const Icon(Icons.playlist_play),
                tooltip: 'Начать с любого урока',
                onPressed: _pickStart),
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
            return IconButton(
              icon: Icon(on ? Icons.volume_up : Icons.volume_off),
              tooltip: on ? 'Выключить звук' : 'Включить звук',
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
    return Text(
      parts.join(' · '),
      style: TextStyle(
        fontSize: 14,
        color: scheme.onSurface.withValues(alpha: 0.7),
      ),
    );
  }
}

class _PathBody extends StatelessWidget {
  const _PathBody({required this.controller, required this.onOpenNode});

  final CourseController controller;
  final ValueChanged<Lesson> onOpenNode;

  @override
  Widget build(BuildContext context) {
    final course = controller.course!;

    // Строки списка собираются замыканиями, а сам список — ListView.builder.
    //
    // Раньше здесь был ListView со списком children, то есть вся карта курса
    // строилась сразу: десять разделов, в каждом тропа из узлов с градиентами,
    // тенями и спрайтами. На телефоне это не влезало в бюджет кадра, список
    // дёргался и вверх прокручивался рывками — часть событий прокрутки просто
    // терялась. Замыкания дают ленивую отрисовку: строится только видимое.
    final rows = <WidgetBuilder>[
      (_) => _HeaderCard(controller: controller),
      (_) => const SizedBox(height: 24),
      for (var u = 0; u < course.units.length; u++) ...[
        (_) => _UnitSection(
              unit: course.units[u],
              index: u,
              controller: controller,
              onOpenNode: onOpenNode,
            ),
        (_) => const SizedBox(height: 30),
      ],
      (_) => _TrainerCard(course: course),
    ];

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1260),
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          itemCount: rows.length,
          itemBuilder: (context, index) => rows[index](context),
        ),
      ),
    );
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
            controller: controller,
            onOpenNode: onOpenNode,
          );
          return Column(children: [banner, const SizedBox(height: 24), path]);
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
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.primary.withValues(alpha: .5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'РАЗДЕЛ ${index + 1}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: scheme.primary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            unit.title,
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w800,
              color: scheme.onSurface,
              height: 1.2,
            ),
          ),
          if (unit.description.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              unit.description,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.4,
                color: scheme.onSurfaceVariant,
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
  const _LessonPath({
    required this.unit,
    required this.controller,
    required this.onOpenNode,
  });

  final CourseUnit unit;
  final CourseController controller;
  final ValueChanged<Lesson> onOpenNode;

  /// Горизонтальные смещения узлов, повторяются циклически.
  static const List<double> _wave = [0, -58, -92, -58, 0, 58, 92, 58];
  // Текущий узел выше остальных из-за пузыря «Начать». При меньшем шаге
  // прозрачная область следующего PressableScale перекрывала его подпись и
  // перехватывала нажатие.
  static const double _step = 214;

  @override
  Widget build(BuildContext context) {
    final lessons = unit.lessons.toList();
    final next = controller.nextLesson;

    return LayoutBuilder(builder: (context, constraints) {
      if (constraints.maxWidth >= 880) {
        final columns = lessons.length <= 4 ? 2 : 3;
        final cellWidth = constraints.maxWidth / columns;
        final points = <Offset>[
          for (var i = 0; i < lessons.length; i++)
            Offset(
                ((i ~/ columns).isEven
                            ? i % columns
                            : columns - 1 - i % columns) *
                        cellWidth +
                    cellWidth / 2,
                (i ~/ columns) * _step + 110),
        ];
        return SizedBox(
            height: (lessons.length / columns).ceil() * _step,
            child: Stack(clipBehavior: Clip.none, children: [
              Positioned.fill(
                  child: CustomPaint(
                      painter: _CourseTrailPainter(
                          points: points,
                          statuses: [
                            for (final lesson in lessons)
                              controller.statusOf(lesson)
                          ],
                          line: Theme.of(context).colorScheme.outlineVariant,
                          done: Theme.of(context).colorScheme.success))),
              for (var i = 0; i < lessons.length; i++)
                Positioned(
                    top: (i ~/ columns) * _step +
                        (next?.id == lessons[i].id ? 0 : 60),
                    left: points[i].dx - 74,
                    width: 148,
                    child: _buildNode(lessons[i], next)),
            ]));
      }
      // На узких экранах уменьшаем амплитуду волны, чтобы узел с подписью
      // не выходил за края.
      final scale = (constraints.maxWidth - 180) / 168 < 1 ? 0.6 : 1.0;
      // Маскот показывается только когда точно не наедет на крайний узел:
      // половина ширины должна вместить смещение волны (84), подпись (74)
      // и саму фигуру с отступом (116).

      final center = constraints.maxWidth / 2;
      final points = <Offset>[
        for (var i = 0; i < lessons.length; i++)
          Offset(
            center + _wave[i % _wave.length] * scale,
            i * _step + (next?.id == lessons[i].id ? 110 : 50),
          ),
      ];
      final path = SizedBox(
        width: double.infinity,
        height: lessons.length * _step,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _CourseTrailPainter(
                  points: points,
                  statuses: [
                    for (final lesson in lessons) controller.statusOf(lesson),
                  ],
                  line: Theme.of(context).colorScheme.outlineVariant,
                  done: Theme.of(context).colorScheme.success,
                ),
              ),
            ),
            for (var i = 0; i < lessons.length; i++)
              Positioned(
                top: i * _step,
                left: points[i].dx - 74,
                width: 148,
                child: _buildNode(lessons[i], next),
              ),
          ],
        ),
      );

      return path;
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
  const _HeaderCard({required this.controller});

  final CourseController controller;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final progress = controller.progress!;
    final percent = (controller.completionRatio * 100).round();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Один кадр: в шапке Читавук ничего не показывает и ничему не
              // радуется, а тикер спрайта перерисовывал его поверх всего
              // списка карты курса — прокрутка от этого дёргалась.
              Icon(Icons.school_outlined, size: 36, color: scheme.primary),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      controller.course!.title,
                      style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          height: 1.25),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Пройдено $percent%',
                      style: TextStyle(
                        fontSize: 14,
                        color: scheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: controller.completionRatio),
              duration: const Duration(milliseconds: 600),
              curve: Curves.easeOutCubic,
              builder: (context, value, _) => LinearProgressIndicator(
                value: value,
                minHeight: 8,
                backgroundColor: scheme.primary.withValues(alpha: 0.15),
              ),
            ),
          ),
          const SizedBox(height: 14),
          // Wrap, а не Row: на узком экране и при увеличенном системном шрифте
          // плашки переносятся на вторую строку вместо overflow.
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
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
                value: '${progress.xp}',
              ),
            ],
          ),
        ],
      ),
    );
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
            Text('$label: ', style: const TextStyle(fontSize: 13)),
            Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
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
