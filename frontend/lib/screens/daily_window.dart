import 'package:flutter/material.dart';

import '../models/daily.dart';
import '../models/level.dart';
import '../services/daily_service.dart';
import '../services/sync_service.dart';
import '../services/user_db.dart';
import '../widgets/stove_icon.dart';
import '../widgets/wolf_mascot.dart';

/// Окно «На каждый день»: десять слов, текст с ними и упражнения.
///
/// Раз в день, а не при каждом заходе. Набор собирает сервер и хранит сутки:
/// окно, сайт и виджет на рабочем столе показывают одно и то же.
Future<void> showDailyWindow(
  BuildContext context,
  DailyService daily, {
  SyncService? sync,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _DailySheet(daily: daily, sync: sync),
  );
}

class _DailySheet extends StatefulWidget {
  const _DailySheet({required this.daily, this.sync});

  final DailyService daily;
  final SyncService? sync;

  @override
  State<_DailySheet> createState() => _DailySheetState();
}

class _DailySheetState extends State<_DailySheet> {
  DailyState? _state;
  String _error = '';
  bool _tuning = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final state = await widget.daily.load();
      if (!mounted) return;
      setState(() {
        _state = state;
        // Пока темы и уровень не названы, показывать нечего: набор собирается
        // ровно по ним.
        _tuning = !state.ready;
        _error = '';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось открыть слова дня');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return DraggableScrollableSheet(
      initialChildSize: .9,
      minChildSize: .5,
      maxChildSize: .95,
      expand: false,
      builder: (context, controller) => Column(
        children: [
          _header(context),
          Expanded(
            // Переход «загрузка → вопрос о темах → слова» плавный: окно
            // открывается на кружке, и мгновенная подмена содержимого читается
            // как рывок.
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              switchInCurve: Curves.easeOut,
              layoutBuilder: (current, previous) => Stack(
                alignment: Alignment.topCenter,
                children: [...previous, if (current != null) current],
              ),
              child: ListView(
              key: ValueKey(
                  '${state == null}-$_tuning-${_error.isNotEmpty}'),
              controller: controller,
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
              children: [
                if (_error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error,
                        style: const TextStyle(color: Color(0xFFB3261E))),
                  ),
                if (state == null && _error.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                if (state != null && _tuning)
                  _Tuning(
                    daily: widget.daily,
                    level: state.level,
                    chosen: state.themes,
                    onDone: () {
                      setState(() => _tuning = false);
                      _load();
                    },
                  ),
                if (state != null && !_tuning)
                  _SetView(
                    daily: widget.daily,
                    sync: widget.sync,
                    state: state,
                    onChange: (next) => setState(() => _state = next),
                  ),
              ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const WolfSticker(asset: Wolf.zdravo, size: 64, frame: false),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('НА КАЖДЫЙ ДЕНЬ',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: theme.colorScheme.primary,
                    )),
                const SizedBox(height: 2),
                Text(
                  _tuning ? 'Что тебе интересно' : 'Десять слов и текст с ними',
                  style: theme.textTheme.titleLarge,
                ),
              ],
            ),
          ),
          if (_state != null && !_tuning)
            IconButton(
              tooltip: 'Настроить темы',
              icon: const Icon(Icons.tune),
              onPressed: () => setState(() => _tuning = true),
            ),
          IconButton(
            tooltip: 'Закрыть',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}

/// Выбор тем и уровня. Спрашивается один раз, потом — по кнопке настроек.
class _Tuning extends StatefulWidget {
  const _Tuning({
    required this.daily,
    required this.level,
    required this.chosen,
    required this.onDone,
  });

  final DailyService daily;
  final String level;
  final List<String> chosen;
  final VoidCallback onDone;

  @override
  State<_Tuning> createState() => _TuningState();
}

class _TuningState extends State<_Tuning> {
  List<DailyTheme> _themes = const [];
  late final Set<String> _picked = widget.chosen.toSet();
  late String _level = widget.level;
  bool _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadThemes();
  }

  Future<void> _loadThemes() async {
    try {
      final settings = await widget.daily.settings();
      if (!mounted) return;
      setState(() {
        _themes = settings.available;
        if (_level.isEmpty) _level = settings.level;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Не удалось загрузить темы');
    }
  }

  Future<void> _save({required bool all}) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await widget.daily.saveSettings(
        themes: all ? const [] : _picked.toList(),
        level: _level,
      );
      widget.onDone();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Не удалось сохранить';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Твой уровень', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          'По нему подбираются слова: на A1 они самые частые, на C1 — редкие.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final level in serbianLevels)
              ChoiceChip(
                selected: _level == level,
                label: Text(level),
                tooltip: serbianLevelNames[level],
                onSelected: (_) => setState(() => _level = level),
              ),
          ],
        ),
        const SizedBox(height: 22),
        Text('Что интересно', style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(
          'Выбери темы или возьми всё подряд — тогда слова будут из всех тем '
          'уровня.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        if (_themes.isEmpty && _error.isEmpty)
          const Center(child: CircularProgressIndicator())
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in _themes)
                FilterChip(
                  selected: _picked.contains(item.theme),
                  label: Text('${item.theme}  ${item.words}'),
                  onSelected: (on) => setState(() {
                    if (on) {
                      _picked.add(item.theme);
                    } else {
                      _picked.remove(item.theme);
                    }
                  }),
                ),
            ],
          ),
        if (_error.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(_error, style: const TextStyle(color: Color(0xFFB3261E))),
        ],
        const SizedBox(height: 22),
        FilledButton(
          onPressed: _busy || _picked.isEmpty || _level.isEmpty
              ? null
              : () => _save(all: false),
          child: Text('Учить выбранное (${_picked.length})'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _busy || _level.isEmpty ? null : () => _save(all: true),
          child: const Text('Всё подряд'),
        ),
      ],
    );
  }
}

/// Слова дня, сводка повторений, текст и упражнения.
class _SetView extends StatefulWidget {
  const _SetView({
    required this.daily,
    required this.state,
    required this.onChange,
    this.sync,
  });

  final DailyService daily;
  final SyncService? sync;
  final DailyState state;
  final ValueChanged<DailyState> onChange;

  @override
  State<_SetView> createState() => _SetViewState();
}

class _SetViewState extends State<_SetView>
    with SingleTickerProviderStateMixin {
  bool _composing = false;
  String _error = '';

  /// Слова выезжают по очереди, а не появляются стопкой: десять строк разом
  /// глаз читает как список, по одной — как что-то, что ему принесли.
  late final AnimationController _entry = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..forward();

  @override
  void dispose() {
    _entry.dispose();
    super.dispose();
  }

  Future<void> _compose() async {
    setState(() {
      _composing = true;
      _error = '';
    });
    try {
      final lesson = await widget.daily.compose();
      if (!mounted) return;
      final set = widget.state.set;
      if (set != null) {
        widget.onChange(widget.state.copyWith(set: set.copyWith(lesson: lesson)));
      }
      setState(() => _composing = false);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _composing = false;
        _error = 'Текст сейчас не составить. Слова остаются на месте.';
      });
    }
  }

  Future<void> _add(DailyWord word) async {
    final bookId = await UserDb.instance.ensureBook('Слова дня');
    await UserDb.instance.addVocabulary(
      bookId: bookId,
      word: word.lemma,
      lemma: word.lemma,
      pos: word.pos.isEmpty ? 'UNKNOWN' : word.pos,
      translation: word.translation,
      forms: {
        'контекст': plainExample(word.example),
        'перевод': plainExample(word.exampleTranslation),
        'источник': 'Слова дня · ${word.theme}',
      },
    );
    widget.sync?.sync();

    final learned = await widget.daily.markLearned(word.lemma);
    if (!mounted) return;
    final set = widget.state.set;
    if (set != null) {
      widget.onChange(widget.state.copyWith(set: set.copyWith(learned: learned)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final set = widget.state.set;
    if (set == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Text(
          'На сегодня слов не нашлось. Загляни завтра — набор соберётся заново.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium,
        ),
      );
    }

    final lesson = set.lesson;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Progress(progress: widget.state.progress),
        const SizedBox(height: 16),
        for (var index = 0; index < set.words.length; index++)
          _Appear(
            controller: _entry,
            index: index,
            total: set.words.length,
            child: _WordTile(
              word: set.words[index],
              learned: set.isLearned(set.words[index].lemma),
              onAdd: () => _add(set.words[index]),
            ),
          ),
        const SizedBox(height: 16),
        if (lesson != null)
          // Текст ждали секунд двадцать: появиться разом он не должен —
          // проявляется, чтобы взгляд успел за ним.
          TweenAnimationBuilder<double>(
            key: ValueKey(lesson.title),
            tween: Tween(begin: 0, end: 1),
            duration: const Duration(milliseconds: 420),
            curve: Curves.easeOut,
            builder: (context, value, child) => Opacity(
              opacity: value,
              child: Transform.translate(
                offset: Offset(0, (1 - value) * 10),
                child: child,
              ),
            ),
            child: _LessonView(lesson: lesson),
          )
        else if (widget.state.canCompose) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Icon(Icons.menu_book_outlined,
                      color: theme.colorScheme.outline),
                  const SizedBox(height: 8),
                  Text(
                    'Читавук может собрать из этих слов маленький текст '
                    'с упражнениями.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium,
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(_error,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFB3261E))),
                  ],
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _composing ? null : _compose,
                    child: Text(_composing ? 'Пишу…' : 'Составить текст'),
                  ),
                  if (_composing) ...[
                    const SizedBox(height: 8),
                    Text('Это занимает секунд двадцать.',
                        style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Появление одной строки списка: своя доля общей анимации.
///
/// Отдельного контроллера на строку нет намеренно — десять контроллеров ради
/// одного въезда это десять таймеров, которые кто-то забудет закрыть.
class _Appear extends StatelessWidget {
  const _Appear({
    required this.controller,
    required this.index,
    required this.total,
    required this.child,
  });

  final AnimationController controller;
  final int index;
  final int total;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Уважаем системное «убрать анимации»: там въезд не нужен вовсе.
    if (MediaQuery.disableAnimationsOf(context)) return child;

    final start = total <= 1 ? 0.0 : (index / total) * 0.5;
    final animation = CurvedAnimation(
      parent: controller,
      curve: Interval(start, (start + 0.5).clamp(0.0, 1.0),
          curve: Curves.easeOutCubic),
    );
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, .12), end: Offset.zero)
            .animate(animation),
        child: child,
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.progress});

  final DailyProgress progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                _stat(
                  context,
                  const StoveIcon(size: 18),
                  progress.streak > 0
                      ? '${progress.streak} дн. подряд'
                      : 'Начнём сегодня',
                ),
                _stat(context, const Icon(Icons.check_circle_outline),
                    'Повторено сегодня: ${progress.reviewedToday}'),
                _stat(context, const Icon(Icons.schedule),
                    'Ждёт повторения: ${progress.dueNow}'),
              ],
            ),
            if (progress.faded.isNotEmpty) ...[
              const Divider(height: 22),
              Text('Пора вспомнить',
                  style: theme.textTheme.labelLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final word in progress.faded)
                    Tooltip(
                      message: 'Просрочено на ${word.overdueDays} дн.',
                      child: Chip(
                        label: Text('${word.word} — ${word.translation}'),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Строка сводки. Текст обязан быть гибким: `Wrap` даёт ребёнку всю ширину
  /// полосы, и «Повторено сегодня: 128» при крупном шрифте вылезает за неё.
  ///
  /// Знак приходит виджетом, а не [IconData]: у серии дней это картинка печи,
  /// а не значок шрифта. Размер и цвет обычные значки берут отсюда сами.
  Widget _stat(BuildContext context, Widget icon, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconTheme(
            data: IconThemeData(
                size: 16, color: Theme.of(context).colorScheme.primary),
            child: icon,
          ),
          const SizedBox(width: 4),
          Flexible(
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      );
}

class _WordTile extends StatefulWidget {
  const _WordTile({
    required this.word,
    required this.learned,
    required this.onAdd,
  });

  final DailyWord word;
  final bool learned;
  final Future<void> Function() onAdd;

  @override
  State<_WordTile> createState() => _WordTileState();
}

class _WordTileState extends State<_WordTile> {
  bool _busy = false;
  bool _added = false;

  Future<void> _add() async {
    if (_busy || _added || widget.learned) return;
    setState(() => _busy = true);
    try {
      await widget.onAdd();
      if (mounted) setState(() => _added = true);
    } catch (_) {
      // Слово остаётся в наборе, и кнопку можно нажать ещё раз.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final word = widget.word;
    final done = widget.learned || _added;
    final example = plainExample(word.example);
    final exampleRu = plainExample(word.exampleTranslation);

    return AnimatedContainer(
      // Слово, ушедшее в карточки, подкрашивается плавно: резкая смена рамки
      // читается как ошибка ввода, а не как «принято».
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: done
              ? theme.colorScheme.primary.withValues(alpha: .5)
              : theme.colorScheme.outlineVariant,
        ),
        color: done
            ? theme.colorScheme.primary.withValues(alpha: .06)
            : Colors.transparent,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 8,
                  children: [
                    Text(word.lemma,
                        style: theme.textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    Text(word.translation, style: theme.textTheme.bodyMedium),
                    if (word.note.isNotEmpty)
                      Text(word.note, style: theme.textTheme.bodySmall),
                  ],
                ),
                if (example.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(example, style: theme.textTheme.bodyMedium),
                  if (exampleRu.isNotEmpty)
                    Text(exampleRu, style: theme.textTheme.bodySmall),
                ],
              ],
            ),
          ),
          IconButton(
            onPressed: done || _busy ? null : _add,
            tooltip: done ? 'Уже в карточках' : 'Добавить в карточки',
            icon: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (child, animation) =>
                  ScaleTransition(scale: animation, child: child),
              child: _busy
                  ? const SizedBox(
                      key: ValueKey('busy'),
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(done ? Icons.check : Icons.add, key: ValueKey(done)),
            ),
          ),
        ],
      ),
    );
  }
}

class _LessonView extends StatelessWidget {
  const _LessonView({required this.lesson});

  final DailyLesson lesson;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(lesson.title, style: theme.textTheme.titleLarge),
            const SizedBox(height: 10),
            Text(lesson.text,
                style: theme.textTheme.bodyLarge?.copyWith(height: 1.5)),
            if (lesson.exercises.isNotEmpty) ...[
              const Divider(height: 28),
              for (final exercise in lesson.exercises)
                _ExerciseView(exercise: exercise),
            ],
          ],
        ),
      ),
    );
  }
}

class _ExerciseView extends StatefulWidget {
  const _ExerciseView({required this.exercise});

  final DailyExercise exercise;

  @override
  State<_ExerciseView> createState() => _ExerciseViewState();
}

class _ExerciseViewState extends State<_ExerciseView> {
  final TextEditingController _typed = TextEditingController();
  String _answer = '';
  bool _checked = false;

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  bool get _right =>
      _answer.trim().toLowerCase() ==
      widget.exercise.answer.trim().toLowerCase();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final exercise = widget.exercise;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(exercise.question,
              style: theme.textTheme.bodyLarge
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          if (exercise.hasOptions)
            for (final option in exercise.options)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: OutlinedButton(
                  onPressed: _checked
                      ? null
                      : () => setState(() {
                            _answer = option;
                            _checked = true;
                          }),
                  style: OutlinedButton.styleFrom(
                    alignment: Alignment.centerLeft,
                    backgroundColor: _checked && option == exercise.answer
                        ? theme.colorScheme.primary.withValues(alpha: .12)
                        : null,
                  ),
                  child: SizedBox(width: double.infinity, child: Text(option)),
                ),
              )
          else ...[
            // Поле и кнопка стоят друг под другом, а не в ряд: при крупном
            // системном шрифте «Проверить» съедала строку ввода до нуля.
            TextField(
              controller: _typed,
              enabled: !_checked,
              decoration: const InputDecoration(
                hintText: 'Твой ответ',
                isDense: true,
                border: OutlineInputBorder(),
              ),
              onSubmitted: (value) => setState(() {
                _answer = value;
                _checked = true;
              }),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _checked
                    ? null
                    : () => setState(() {
                          _answer = _typed.text;
                          _checked = true;
                        }),
                child: const Text('Проверить'),
              ),
            ),
          ],
          // Разбор разворачивается, а не выпрыгивает: карточка меняет высоту, и
          // резкий скачок сбивает место, куда человек смотрел.
          AnimatedSize(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: !_checked
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _right
                              ? 'Верно'
                              : 'Правильный ответ: ${exercise.answer}',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: _right
                                ? theme.colorScheme.primary
                                : theme.colorScheme.error,
                          ),
                        ),
                        if (exercise.hint.isNotEmpty)
                          Text(exercise.hint,
                              style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
