/// Читалка события «Одиссея»: 24 песни, порядок прохождения и награда.
///
/// Отдельно от [BookReaderScreen] намеренно: там книга пользователя со своей
/// разбивкой на страницы, прогрессом и синхронизацией, а здесь фиксированный
/// текст из ассетов и совсем другой прогресс. Общими остаются разбор слова и
/// настройки чтения — их и переиспользуем.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../events/events_controller.dart';
import '../events/odyssey.dart';
import '../events/odyssey_content.dart';
import '../models/reader_settings.dart';
import '../state/app_settings.dart';
import '../utils/tokenizer.dart';
import '../widgets/reader_text.dart';
import 'book_reader_screen.dart' show WordAnalysisSheet, ReaderSettingsSheet;

class OdysseyScreen extends StatefulWidget {
  const OdysseyScreen({super.key});

  @override
  State<OdysseyScreen> createState() => _OdysseyScreenState();
}

class _OdysseyScreenState extends State<OdysseyScreen> {
  final ScrollController _scroll = ScrollController();

  List<OdysseyChapterInfo> _chapters = const [];
  OdysseyChapter? _chapter;
  int _number = 1;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final events = context.read<EventsController>();
    await events.refresh();
    if (!mounted) return;
    final progress = events.odyssey;
    // Открываем ту песню, на которой человек остановился, но не дальше первой
    // незакрытой: события проходятся по порядку.
    final target = progress.lastChapter < progress.firstIncomplete
        ? progress.lastChapter
        : progress.firstIncomplete;
    await _load(target);
    try {
      final manifest = await OdysseyContent.manifest();
      if (mounted) setState(() => _chapters = manifest.chapters);
    } catch (_) {
      // Список песен — только для выпадающего меню; без него читалка работает.
    }
  }

  Future<void> _load(int number) async {
    setState(() {
      _number = number;
      _chapter = null;
      _failed = false;
    });
    try {
      final chapter = await OdysseyContent.chapter(number);
      if (!mounted) return;
      setState(() => _chapter = chapter);
      if (_scroll.hasClients) _scroll.jumpTo(0);
      await context.read<EventsController>().rememberOdysseyChapter(number);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  void _choose(int number, OdysseyProgress progress) {
    final allowed =
        number > progress.firstIncomplete ? progress.firstIncomplete : number;
    if (allowed != _number) _load(allowed);
  }

  Future<void> _finish(OdysseyProgress progress) async {
    final events = context.read<EventsController>();
    await events.completeOdysseyChapter(_number);
    if (!mounted) return;
    if (_number < kOdysseyChapterCount) {
      await _load(_number + 1);
      return;
    }
    if (mounted && events.odyssey.rewardUnlocked) _showRewardDialog();
  }

  void _showRewardDialog() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Спартанские шлемы открыты'),
        content: const Text(
          'Открой любую книгу, зайди в настройки чтения и выбери новый '
          'фон страницы.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Понятно'),
          ),
        ],
      ),
    );
  }

  void _showWord(Token token, String sentence) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      // bookId = 0 — «слово не из книги». Это уже используемое в базе значение:
      // синхронизация отправляет такие слова без книги и не теряет их.
      builder: (_) => WordAnalysisSheet(
        bookId: 0,
        sentence: sentence,
        token: token,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.watch<AppSettings>().reader;
    final progress = context.watch<EventsController>().odyssey;
    final chapter = _chapter;
    final done = progress.isCompleted(_number);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Одиссея'),
        actions: [
          IconButton(
            tooltip: 'Настройки чтения',
            icon: const Icon(Icons.text_fields),
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              builder: (_) => const ReaderSettingsSheet(),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: LinearProgressIndicator(
            value: progress.fraction,
            minHeight: 3,
            backgroundColor: scheme.surfaceContainerHighest,
          ),
        ),
      ),
      body: _failed
          ? _error()
          : chapter == null
              ? const Center(child: CircularProgressIndicator())
              : _content(chapter, progress, settings, scheme, done),
    );
  }

  Widget _error() => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Не удалось открыть песнь'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => _load(_number),
              child: const Text('Повторить'),
            ),
          ],
        ),
      );

  Widget _content(
    OdysseyChapter chapter,
    OdysseyProgress progress,
    ReaderSettings settings,
    ColorScheme scheme,
    bool done,
  ) {
    final illustration = OdysseyContent.illustrations[_number];
    const textColor = Color(0xFF2B2118);

    return Container(
      color: const Color(0xFFFBF6EA),
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 48),
        children: [
          _chapterPicker(progress, scheme),
          const SizedBox(height: 16),
          if (illustration != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.asset(illustration.asset,
                  fit: BoxFit.cover, height: 240, width: double.infinity),
            ),
            const SizedBox(height: 6),
            Text(illustration.caption,
                style: TextStyle(
                    fontSize: 11,
                    height: 1.35,
                    color: textColor.withValues(alpha: 0.6))),
            const SizedBox(height: 18),
          ],
          Center(
            child: Column(
              children: [
                Text(chapter.title,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: Color(0xFF8D3038))),
                const SizedBox(height: 6),
                Text(chapter.subtitle,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: textColor)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: settings.fullWidth ? double.infinity : settings.maxWidth,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final paragraph in chapter.paragraphs) ...[
                  ReaderParagraph(
                    text: paragraph,
                    settings: settings,
                    textColor: textColor,
                    highlightColor: const Color(0xFFF2CA81),
                    highlightTextColor: textColor,
                    // Стих набран построчно, красная строка его ломает.
                    firstLineIndent: 0,
                    justify: false,
                    onTapWord: (_, token, __) => _showWord(token, paragraph),
                  ),
                  SizedBox(height: settings.paragraphSpacing),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Divider(color: Color(0x332B2118)),
          const SizedBox(height: 16),
          Center(
            child: done
                ? const Text('Песнь завершена',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, color: Color(0xFF6D563E)))
                : FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF8D3038),
                      foregroundColor: Colors.white,
                    ),
                    icon: Icon(_number == kOdysseyChapterCount
                        ? Icons.card_giftcard
                        : Icons.arrow_forward),
                    label: Text(_number == kOdysseyChapterCount
                        ? 'Завершить и получить награду'
                        : 'Завершить песнь'),
                    onPressed: () => _finish(progress),
                  ),
          ),
          const SizedBox(height: 24),
          Text(
            'Гомер, «Одиссея». Перевод Томо Маретича, 1915, Public Domain '
            'Mark 1.0. Текст оцифрован Internet Archive и представлен сербской '
            'кириллицей; язык и орфография перевода сохранены.',
            style: TextStyle(
                fontSize: 11,
                height: 1.4,
                color: textColor.withValues(alpha: 0.55)),
          ),
        ],
      ),
    );
  }

  /// Выбор песни. Закрытые доступны для перечитывания, следующие — нет: иначе
  /// открытая напрямую последняя песня засчиталась бы за пройденную поэму.
  Widget _chapterPicker(OdysseyProgress progress, ColorScheme scheme) {
    final items = _chapters.isEmpty
        ? [
            OdysseyChapterInfo(
                number: _number, title: '$_number. песма', subtitle: '')
          ]
        : _chapters;

    return Row(
      children: [
        const Icon(Icons.map_outlined, size: 18, color: Color(0xFF8D3038)),
        const SizedBox(width: 8),
        Expanded(
          child: DropdownButton<int>(
            value: _number,
            isExpanded: true,
            underline: const SizedBox.shrink(),
            style: const TextStyle(fontSize: 14, color: Color(0xFF2B2118)),
            items: [
              for (final info in items)
                DropdownMenuItem(
                  value: info.number,
                  enabled: info.number <= progress.firstIncomplete,
                  child: Text(
                    '${progress.isCompleted(info.number) ? '✓ ' : ''}'
                    '${info.title}',
                    style: TextStyle(
                      color: info.number <= progress.firstIncomplete
                          ? const Color(0xFF2B2118)
                          : const Color(0xFF2B2118).withValues(alpha: 0.35),
                    ),
                  ),
                ),
            ],
            onChanged: (value) {
              if (value != null) _choose(value, progress);
            },
          ),
        ),
        Text('${(progress.fraction * 100).round()}%',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: scheme.onSurface.withValues(alpha: 0.6))),
      ],
    );
  }
}
