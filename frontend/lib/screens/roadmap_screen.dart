import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/roadmap.dart';
import '../services/auth_service.dart';
import '../services/roadmap_service.dart';
import '../widgets/wolf_mascot.dart';
import 'roadmap_section_screen.dart';
import 'roadmap_comments.dart';

/// Дорожная карта сербского языка.
///
/// Вводный текст и описания разделов приходят с сервера вместе с каркасом: это
/// авторские формулировки, и держать их вторую копию в приложении значило бы
/// однажды показать в телефоне не то, что на сайте.
class RoadmapScreen extends StatefulWidget {
  const RoadmapScreen({super.key});

  @override
  State<RoadmapScreen> createState() => _RoadmapScreenState();
}

class _RoadmapScreenState extends State<RoadmapScreen> {
  RoadmapOverview? _overview;
  String _error = '';
  String _selected = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final overview = await context.read<RoadmapService>().overview();
      if (!mounted) return;
      setState(() {
        _overview = overview;
        _error = '';
        // Открывается то, к чему человек идёт; нет цели — его уровень; нет и
        // его — начало. Пустой экран при первом заходе читался бы как ошибка.
        if (_selected.isEmpty) {
          _selected = overview.target.isNotEmpty
              ? overview.target
              : overview.current.isNotEmpty
                  ? overview.current
                  : 'A1';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Карта не загрузилась. $e');
    }
  }

  Future<void> _setTarget(String level) async {
    final service = context.read<RoadmapService>();
    try {
      final target = await service.setTarget(level);
      if (!mounted) return;
      setState(() {
        if (target.isNotEmpty) _selected = target;
        _overview = _overview == null
            ? null
            : RoadmapOverview(
                levels: _overview!.levels,
                categories: _overview!.categories,
                target: target,
                current: _overview!.current,
                passingScore: _overview!.passingScore,
                signedIn: _overview!.signedIn,
              );
      });
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить цель.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final overview = _overview;
    return Scaffold(
      appBar: AppBar(title: const Text('Дорожная карта')),
      body: _error.isNotEmpty
          ? _ErrorView(message: _error, onRetry: _load)
          : overview == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    children: [
                      const _Intro(),
                      const SizedBox(height: 24),
                      _CategoryCards(categories: overview.categories),
                      const SizedBox(height: 24),
                      _HowItWorks(categories: overview.categories),
                      const SizedBox(height: 24),
                      Text('Уровни',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      RoadmapTrail(
                        levels: overview.levels,
                        categories: overview.categories,
                        selected: _selected,
                        target: overview.target,
                        current: overview.current,
                        onSelect: (level) => setState(() => _selected = level),
                      ),
                      const SizedBox(height: 24),
                      _LevelPanel(
                        overview: overview,
                        level: _selected,
                        onSetTarget: _setTarget,
                        onSelect: (level) => setState(() => _selected = level),
                        onChanged: _load,
                      ),
                      const SizedBox(height: 32),
                      FilledButton.tonalIcon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) =>
                                RoadmapCommentsScreen(level: _selected),
                          ),
                        ),
                        icon: const Icon(Icons.forum_outlined),
                        label: Text('Обсуждение уровня $_selected'),
                      ),
                    ],
                  ),
                ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('Повторить')),
            ],
          ),
        ),
      );
}

/// Авторский текст страницы. Приведён дословно.
class _Intro extends StatelessWidget {
  const _Intro();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const WolfSticker(asset: Wolf.roadmap, size: 96),
            const SizedBox(width: 12),
            Expanded(
              child: Text('Дорожная карта сербского языка',
                  style: theme.textTheme.headlineSmall),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          'Всегда, когда начинаешь учить язык, а особенно такой редкий, как '
          'сербский, задаешься вопросом — что делать после пары тройки '
          'грамматических упражнений и быстрых онлайн-курсов? Откуда брать '
          'новые слова, что смотреть? На этой странице я, разработчик сайта '
          'Читавук (см. страницу обо мне: citavuk.ru/about), постарался '
          'распределить слова, темы, упражнения сербского языка по уровням '
          'CERF и по знакомым из английского категориям языка: Reading '
          '(Čitanje), Grammar (Gramatika), Vocabulary (Vokabular), Writing '
          '(Pisanje); увы, категория Speaking, при всей ей важности, не может '
          'быть развита через интернет (даже при условии, если бы я сделал '
          'условное распознавание вашей речи и затем общение таким образом '
          'через голосового чат-бота — это будет выглядеть максимально '
          'искусственно), тут уже только ваши силы находить носителей '
          'сербского или профессиональных учителей и общаться с ними.',
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
      ],
    );
  }
}

class _CategoryCards extends StatelessWidget {
  const _CategoryCards({required this.categories});

  final List<RoadmapCategory> categories;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        for (final category in categories)
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Категория ${category.title} · ${category.local}',
                      style: theme.textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(category.about,
                      style: theme.textTheme.bodySmall?.copyWith(height: 1.45)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _HowItWorks extends StatelessWidget {
  const _HowItWorks({required this.categories});

  final List<RoadmapCategory> categories;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Как устроена дорожная карта?', style: theme.textTheme.titleLarge),
        const SizedBox(height: 10),
        Text(
          'Вы выбираете (или просто смотрите) любой уровень, к которому вы '
          'сейчас стремитесь в сербском языке. Затем, вы можете нажать на '
          'каждый раздел освоения языка по данному уровню, и увидеть:',
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
        const SizedBox(height: 10),
        const _Bullet(
          'Reading — предлагаемые книги, статьи и тексты для данного уровня '
          '(можно импортировать сразу в Читавук) или упражнения на данный текст.',
        ),
        const _Bullet(
          'Grammar — список тем по грамматике и, если есть, предлагаемые уроки '
          'и упражнения на грамматику для данного уровня.',
        ),
        const _Bullet(
          'Vocabulary — страница со списком слов по распределенным категориям '
          '(типа, животные, дом, семья и т.к далее); их можно добавлять в '
          'словарь и отмечать прямо на сайте, какие слова вы уже выучили.',
        ),
        const _Bullet(
          'Writing (пока планируется) — упражнения на написание предложений и '
          'игра против переводчика (will be soon/ускоро ће бити)',
        ),
        const SizedBox(height: 10),
        Text(
          'Читавук автоматически отслеживает прогресс и показывает его в личном '
          'кабинете По каждому разделу для данного уровня, и, как только вы '
          'наберете >80% по каждому разделу, вы сможете перейти на следующий '
          'уровень, если вы заранее выбрали уровень; если же вы не выбирали '
          'уровень, то вы можете свободно передвигаться между разделами любого '
          'уровня.',
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
        const SizedBox(height: 10),
        Text(
          'К этой странице создан раздел комментариев, на которые можно '
          'отвечать, — потому что любая дорожная карта требует обсуждений и '
          'дополнений, которые мог не учесть автор.',
          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        ),
      ],
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('•  '),
            Expanded(
              child: Text(text,
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(height: 1.45)),
            ),
          ],
        ),
      );
}

/// Тропа со стоянками.
///
/// Кривая рисуется CustomPainter'ом на фоне, а стоянки — обычные кнопки поверх.
/// Так же, как на сайте: текст внутри рисованной фигуры не читается голосовым
/// сопровождением и не переносится.
class RoadmapTrail extends StatelessWidget {
  const RoadmapTrail({
    super.key,
    required this.levels,
    required this.categories,
    required this.selected,
    required this.target,
    required this.current,
    required this.onSelect,
  });

  final List<RoadmapLevelView> levels;
  final List<RoadmapCategory> categories;
  final String selected;
  final String target;
  final String current;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    var passed = 0;
    for (final level in levels) {
      if (!roadmapLevelPassed(level, categories)) break;
      passed += 1;
    }

    return CustomPaint(
      painter: _TrailPainter(
        stations: levels.length,
        passed: passed,
        line: scheme.outlineVariant,
        done: scheme.primary,
      ),
      child: Column(
        children: [
          for (var index = 0; index < levels.length; index += 1)
            Align(
              alignment:
                  index.isEven ? Alignment.centerLeft : Alignment.centerRight,
              child: _Station(
                level: levels[index],
                categories: categories,
                selected: selected == levels[index].level,
                isTarget: target == levels[index].level,
                isCurrent: current == levels[index].level,
                onTap: () => onSelect(levels[index].level),
              ),
            ),
        ],
      ),
    );
  }
}

/// Насколько стоянка отклоняется от середины, в долях ширины.
const _swing = 0.24;

class _TrailPainter extends CustomPainter {
  _TrailPainter({
    required this.stations,
    required this.passed,
    required this.line,
    required this.done,
  });

  final int stations;
  final int passed;
  final Color line;
  final Color done;

  Offset _point(int index, Size size) => Offset(
        (0.5 + (index.isEven ? -_swing : _swing)) * size.width,
        (index + 0.5) / stations * size.height,
      );

  Path _path(Size size, int upTo) {
    final path = Path();
    if (stations == 0) return path;
    final first = _point(0, size);
    path.moveTo(first.dx, first.dy);
    for (var index = 1; index < upTo; index += 1) {
      final from = _point(index - 1, size);
      final to = _point(index, size);
      // Управляющие точки строго по вертикали от концов: тогда линия входит в
      // стоянку сверху и не даёт петель на узких экранах.
      final bend = (to.dy - from.dy) / 2;
      path.cubicTo(from.dx, from.dy + bend, to.dx, to.dy - bend, to.dx, to.dy);
    }
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = line;
    canvas.drawPath(_path(size, stations), base);

    if (passed > 0) {
      canvas.drawPath(
        _path(size, passed.clamp(1, stations)),
        base..color = done,
      );
    }
  }

  @override
  bool shouldRepaint(_TrailPainter old) =>
      old.stations != stations ||
      old.passed != passed ||
      old.line != line ||
      old.done != done;
}

class _Station extends StatelessWidget {
  const _Station({
    required this.level,
    required this.categories,
    required this.selected,
    required this.isTarget,
    required this.isCurrent,
    required this.onTap,
  });

  final RoadmapLevelView level;
  final List<RoadmapCategory> categories;
  final bool selected;
  final bool isTarget;
  final bool isCurrent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final counted = categories.where((category) => !category.planned).toList();
    final ratio = counted.isEmpty
        ? 0.0
        : counted
                .map((category) => level.progressOf(category.key).ratio)
                .reduce((a, b) => a + b) /
            counted.length;

    final marks = <String>[
      if (isCurrent) 'ваш уровень',
      if (isTarget) 'цель',
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Material(
        color: selected
            ? scheme.primary.withValues(alpha: 0.12)
            : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 250),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected ? scheme.primary : scheme.outlineVariant,
                width: selected ? 2 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 44,
                  height: 44,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: ratio,
                        strokeWidth: 4,
                        backgroundColor: scheme.outlineVariant,
                      ),
                      Text(level.level,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(level.name,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(
                        '${(ratio * 100).round()}%'
                        '${marks.isEmpty ? '' : ' · ${marks.join(' · ')}'}',
                        style: TextStyle(
                            fontSize: 12, color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Разделы выбранного уровня и переход на следующий.
class _LevelPanel extends StatelessWidget {
  const _LevelPanel({
    required this.overview,
    required this.level,
    required this.onSetTarget,
    required this.onSelect,
    required this.onChanged,
  });

  final RoadmapOverview overview;
  final String level;
  final ValueChanged<String> onSetTarget;
  final ValueChanged<String> onSelect;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final view = overview.levels.where((item) => item.level == level).toList();
    if (view.isEmpty) return const SizedBox.shrink();
    final current = view.first;
    final theme = Theme.of(context);
    final signedIn = context.watch<AuthService>().account != null;
    final done = roadmapLevelPassed(current, overview.categories);
    final next = roadmapNextLevel(level, overview.levels);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('${current.level} · ${current.name}',
                  style: theme.textTheme.titleLarge),
            ),
            if (signedIn && overview.target != current.level)
              TextButton.icon(
                onPressed: () => onSetTarget(current.level),
                icon: const Icon(Icons.flag_outlined, size: 18),
                label: const Text('Сделать целью'),
              ),
          ],
        ),
        if (done) ...[
          const SizedBox(height: 8),
          Card(
            color: theme.colorScheme.primary.withValues(alpha: 0.10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Уровень ${current.level} взят: '
                      'больше 80% по каждому разделу.'),
                  if (next.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: () {
                        onSetTarget(next);
                        onSelect(next);
                      },
                      child: Text('Перейти на $next'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 12),
        for (final category in overview.categories)
          _CategoryTile(
            level: current.level,
            category: category,
            progress: current.progressOf(category.key),
            onChanged: onChanged,
          ),
      ],
    );
  }
}

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.level,
    required this.category,
    required this.progress,
    required this.onChanged,
  });

  final String level;
  final RoadmapCategory category;
  final RoadmapProgress progress;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text('${category.title} · ${category.local}'),
        subtitle: category.planned
            ? const Text('ускоро ће бити')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${progress.done} из ${progress.total} · '
                      '${(progress.ratio * 100).round()}%'),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: progress.ratio,
                    minHeight: 5,
                    backgroundColor: scheme.surfaceContainerHighest,
                  ),
                ],
              ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) =>
                  RoadmapSectionScreen(level: level, category: category),
            ),
          );
          await onChanged();
        },
      ),
    );
  }
}
