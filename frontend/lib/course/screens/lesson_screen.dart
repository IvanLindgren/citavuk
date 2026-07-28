/// Экран прохождения урока (master-prompt §10).
///
/// Структура: AppBar с прогрессом, прокручиваемое упражнение, компактная зона
/// маскота, нижняя кнопка действия и панель обратной связи.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../state/app_settings.dart';
import '../../widgets/animated_widgets.dart';
import '../models/course.dart';
import '../services/answer_evaluator.dart';
import '../services/course_sounds.dart';
import '../state/lesson_controller.dart';
import '../widgets/course_button.dart';
import '../widgets/exercise_host.dart';
import '../widgets/feedback_panel.dart';
import '../widgets/intro_blocks_view.dart';
import '../widgets/mascot_view.dart';

class LessonScreen extends StatefulWidget {
  const LessonScreen({
    super.key,
    required this.lesson,
    required this.course,
    this.restoreFrom,
    this.onFinished,
    this.onSnapshot,
  });

  final Lesson lesson;
  final Course course;

  /// Снимок незавершённой попытки, если она была.
  final Map<String, dynamic>? restoreFrom;

  /// Вызывается при успешном завершении урока.
  final void Function(LessonSummary summary)? onFinished;

  /// Сохраняет незавершённую попытку. null — прогресс не пишется (тренажёрка).
  final void Function(Map<String, dynamic> snapshot)? onSnapshot;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  final _keyboard = FocusNode();
  late LessonController _controller;

  /// Фаза, для которой звук уже проигран.
  LessonPhase? _soundedPhase;

  /// Шаг и фаза последнего сохранённого снимка.
  String? _snapshotKey;

  @override
  void initState() {
    super.initState();
    final evaluator = AnswerEvaluator(widget.course.config);
    final restored = widget.restoreFrom == null
        ? null
        : LessonController.restore(
            widget.restoreFrom!,
            lesson: widget.lesson,
            evaluator: evaluator,
            courseVersion: widget.course.courseVersion,
            contentChecksum: widget.course.contentChecksum,
          );
    _controller = restored ??
        LessonController(
          lesson: widget.lesson,
          evaluator: evaluator,
          courseVersion: widget.course.courseVersion,
          contentChecksum: widget.course.contentChecksum,
        );
    _controller.addListener(_onControllerChanged);
  }

  void _onControllerChanged() {
    if (!mounted) return;
    _playSoundForPhase();
    setState(() {});
    if (_controller.phase == LessonPhase.finished) {
      widget.onFinished?.call(_controller.summary);
      return;
    }
    // Снимок на смене шага, а не на каждом нажатии: сохранение уходит и на
    // сервер. Черновик текущего ответа дописывается при выходе из урока.
    if (_controller.phase == LessonPhase.intro) return;
    final key = '${_controller.step}:${_controller.phase.name}';
    if (key == _snapshotKey) return;
    _snapshotKey = key;
    widget.onSnapshot?.call(_controller.toSnapshot());
  }

  /// Звук привязан к смене фазы, а не к rebuild: иначе он повторялся бы при
  /// каждой перерисовке.
  void _playSoundForPhase() {
    final phase = _controller.phase;
    if (phase == _soundedPhase) return;
    _soundedPhase = phase;

    CourseSounds.instance.enabled =
        context.read<AppSettings>().courseSoundEnabled;
    switch (phase) {
      case LessonPhase.checked:
        CourseSounds.instance.play(_controller.result?.correct == true
            ? CourseSound.correct
            : CourseSound.incorrect);
      case LessonPhase.finished:
        CourseSounds.instance.play(CourseSound.lessonComplete);
      case LessonPhase.intro:
      case LessonPhase.answering:
        break;
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    _controller.dispose();
    _keyboard.dispose();
    super.dispose();
  }

  /// Системная кнопка «Назад» подтверждает выход, если урок начат (§10).
  Future<bool> _confirmExit() async {
    if (_controller.phase == LessonPhase.finished ||
        _controller.attempts.isEmpty) {
      return true;
    }
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Выйти из урока?'),
        content: const Text(
            'Прогресс урока сохранится, его можно продолжить позже.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Остаться'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  /// Закрывает урок, спросив подтверждение.
  Future<void> _closeLesson() async {
    final leave = await _confirmExit();
    if (!mounted || !leave) return;
    if (_controller.phase != LessonPhase.intro &&
        _controller.phase != LessonPhase.finished) {
      widget.onSnapshot?.call(_controller.toSnapshot());
    }
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _closeLesson();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Закрыть урок',
            onPressed: _closeLesson,
          ),
          title: _LessonProgressBar(
            progress: _controller.progress,
            step: _controller.step,
            total: _controller.totalSteps,
          ),
        ),
        body: SafeArea(
          child: Focus(
            focusNode: _keyboard,
            autofocus: true,
            onKeyEvent: _onKey,
            child: switch (_controller.phase) {
            LessonPhase.intro => _IntroView(
                lesson: widget.lesson,
                onStart: _controller.startExercises,
              ),
            LessonPhase.finished => _ResultView(
                summary: _controller.summary,
                passThreshold: widget.course.config.passThreshold,
                onClose: () => Navigator.of(context).pop(_controller.summary),
              ),
            _ => _ExerciseView(controller: _controller),
            },
          ),
        ),
      ),
    );
  }

  /// Enter ведёт урок дальше: проверяет ответ, а на разобранном экране —
  /// переходит к следующему заданию. Мышь для этого больше не нужна.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;

    if (key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter) {
      switch (_controller.phase) {
        case LessonPhase.intro:
          _controller.startExercises();
        case LessonPhase.answering:
          if (_controller.canCheck) _controller.check();
        case LessonPhase.checked:
          _controller.next();
        case LessonPhase.finished:
          Navigator.of(context).pop(_controller.summary);
      }
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.escape) {
      _closeLesson();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }
}

/// Индикатор прогресса в AppBar.
class _LessonProgressBar extends StatelessWidget {
  const _LessonProgressBar({
    required this.progress,
    required this.step,
    required this.total,
  });

  final double progress;
  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Прогресс урока: шаг $step из $total',
      child: Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              // Полоса доезжает плавно, а не прыгает на новое значение.
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: progress),
                duration: const Duration(milliseconds: 420),
                curve: Curves.easeOutCubic,
                builder: (context, value, _) => LinearProgressIndicator(
                  value: value,
                  minHeight: 10,
                  backgroundColor:
                      scheme.primary.withValues(alpha: 0.18),
                  valueColor: AlwaysStoppedAnimation(scheme.primary),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            '$step/$total',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _IntroView extends StatelessWidget {
  const _IntroView({required this.lesson, required this.onStart});

  final Lesson lesson;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    return _CenteredColumn(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                Row(
                  children: [
                    const MascotView(state: MascotState.idle, size: 64),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        lesson.title,
                        style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            height: 1.25),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                IntroBlocksView(
                  blocks: lesson.intro?.effectiveBlocks ?? const [],
                ),
              ],
            ),
          ),
        ),
        _BottomBar(
          child: CourseButton(
            label: 'Начать',
            icon: Icons.play_arrow,
            onPressed: onStart,
          ),
        ),
      ],
    );
  }
}

class _ExerciseView extends StatefulWidget {
  const _ExerciseView({required this.controller});

  final LessonController controller;

  @override
  State<_ExerciseView> createState() => _ExerciseViewState();
}

class _ExerciseViewState extends State<_ExerciseView> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final exercise = controller.current;
    if (exercise == null) return const SizedBox.shrink();
    final checked = controller.phase == LessonPhase.checked;
    final result = controller.result;

    return _CenteredColumn(
      children: [
        Expanded(
          child: _AlwaysVisibleScrollbar(
            controller: _scrollController,
            child: SingleChildScrollView(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExerciseHost(
                  exercise: exercise,
                  answer: controller.draft,
                  enabled: !checked,
                  onChanged: controller.setAnswer,
                ),
                if (!checked &&
                    exercise.hint != null &&
                    exercise.hint!.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  if (controller.hintShown)
                    _HintBox(text: exercise.hint!)
                  else
                    TextButton.icon(
                      onPressed: controller.showHint,
                      icon: const Icon(Icons.lightbulb_outline, size: 18),
                      label: const Text('Подсказка'),
                    ),
                ],
                if (checked && result != null) ...[
                  const SizedBox(height: 20),
                  // Панель въезжает снизу: взгляд сам переходит к разбору.
                  MediaQuery.disableAnimationsOf(context)
                      ? FeedbackPanel(result: result)
                      : FadeSlideIn(
                          key: ValueKey(
                              'feedback_${exercise.id}_${controller.step}'),
                          child: FeedbackPanel(result: result),
                        ),
                ],
                const SizedBox(height: 12),
              ],
            ),
            ),
          ),
        ),
        _BottomBar(
          // Маскот компактный и стоит рядом с кнопкой, не перекрывая её (§11.8).
          leading: MascotView(state: controller.mascot, size: 52),
          child: checked
              ? CourseButton(
                  label: 'Продолжить',
                  icon: Icons.arrow_forward,
                  tone: result?.correct == true
                      ? CourseButtonTone.success
                      : CourseButtonTone.primary,
                  onPressed: controller.next,
                )
              : CourseButton(
                  label: 'Проверить',
                  onPressed: controller.canCheck ? controller.check : null,
                ),
        ),
      ],
    );
  }
}

class _HintBox extends StatelessWidget {
  const _HintBox({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.secondary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.secondary.withValues(alpha: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.lightbulb_outline, size: 20, color: scheme.secondary),
          const SizedBox(width: 10),
          Expanded(
            child:
                Text(text, style: const TextStyle(fontSize: 15, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView({
    required this.summary,
    required this.passThreshold,
    required this.onClose,
  });

  final LessonSummary summary;
  final double passThreshold;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final passed = summary.score >= passThreshold;
    final percent = (summary.score * 100).round();

    return _CenteredColumn(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 12),
                const MascotView(state: MascotState.lessonComplete, size: 120),
                const SizedBox(height: 20),
                Text(
                  passed ? 'Урок пройден' : 'Урок завершён',
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Text(
                  'С первой попытки: ${summary.firstTryCorrect} из ${summary.total} ($percent%)',
                  style: const TextStyle(fontSize: 16),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Время: ${summary.elapsed.inMinutes} мин ${summary.elapsed.inSeconds % 60} с',
                  style: TextStyle(
                    fontSize: 14,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.65),
                  ),
                ),
                if (summary.weakObjectiveIds.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  _WeakTopicsCard(count: summary.weakObjectiveIds.length),
                ],
              ],
            ),
          ),
        ),
        _BottomBar(
          child: CourseButton(
            label: 'Готово',
            icon: Icons.check,
            tone: passed ? CourseButtonTone.success : CourseButtonTone.primary,
            onPressed: onClose,
          ),
        ),
      ],
    );
  }
}

class _WeakTopicsCard extends StatelessWidget {
  const _WeakTopicsCard({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.secondary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.secondary.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.replay, color: scheme.secondary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              count == 1
                  ? 'Одна тема добавлена в повторение'
                  : 'Тем добавлено в повторение: $count',
              style: const TextStyle(fontSize: 15),
            ),
          ),
        ],
      ),
    );
  }
}

/// На десктопе полоса прокрутки видна всегда: иначе не понять, что ниже ещё
/// есть содержимое.
class _AlwaysVisibleScrollbar extends StatelessWidget {
  const _AlwaysVisibleScrollbar({
    required this.controller,
    required this.child,
  });

  final ScrollController controller;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final desktop = switch (defaultTargetPlatform) {
      TargetPlatform.windows ||
      TargetPlatform.linux ||
      TargetPlatform.macOS =>
        true,
      _ => false,
    };
    return Scrollbar(
      controller: controller,
      thumbVisibility: desktop,
      child: child,
    );
  }
}

/// Ограничивает ширину контента на desktop, чтобы упражнение не растягивалось
/// на весь монитор (§21).
class _CenteredColumn extends StatelessWidget {
  const _CenteredColumn({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Column(children: children),
      ),
    );
  }
}

/// Нижняя панель действия. Остаётся доступной при открытой клавиатуре.
class _BottomBar extends StatelessWidget {
  const _BottomBar({required this.child, this.leading});

  final Widget child;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        12 + MediaQuery.viewInsetsOf(context).bottom * 0,
      ),
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          top: BorderSide(color: scheme.primary.withValues(alpha: 0.2)),
        ),
      ),
      child: Row(
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 12),
          ],
          Expanded(
            child: SizedBox(
              height: 52,
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
