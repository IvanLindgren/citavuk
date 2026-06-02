import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/grammar_engine.dart';
import '../services/user_db.dart';
import '../state/app_settings.dart';
import '../utils/tokenizer.dart';
import '../widgets/reader_text.dart';
import '../widgets/wolf_mascot.dart';
import 'grammar_screen.dart';
import 'vocabulary_screen.dart';

class BookReaderScreen extends StatefulWidget {
  final int bookId;
  final String title;
  final List<String> paragraphs;
  final int initialParagraph;

  const BookReaderScreen({
    super.key,
    required this.bookId,
    required this.title,
    required this.paragraphs,
    required this.initialParagraph,
  });

  @override
  State<BookReaderScreen> createState() => _BookReaderScreenState();
}

class _BookReaderScreenState extends State<BookReaderScreen> {
  late PageController _pageController;
  final List<List<String>> _pages = [];
  final FocusNode _kbFocus = FocusNode();

  bool _phraseMode = false;
  int _startPage = 0;
  bool _resumeHintVisible = false;

  // Состояние выделения (страница/абзац/диапазон токенов).
  int? _selPage;
  int? _selPara;
  int? _selStart;
  int? _selEnd;

  @override
  void initState() {
    super.initState();
    _chunkParagraphs();
    var startPage = widget.initialParagraph;
    if (startPage >= _pages.length) startPage = _pages.isNotEmpty ? _pages.length - 1 : 0;
    _startPage = startPage;
    _pageController = PageController(initialPage: startPage);
    if (startPage > 0) {
      _resumeHintVisible = true; // лапка-указатель «вы остановились здесь»
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) setState(() => _resumeHintVisible = false);
      });
    }
  }

  void _goToPage(int delta) {
    if (!_pageController.hasClients || _pages.isEmpty) return;
    final cur = _pageController.page?.round() ?? _startPage;
    final target = (cur + delta).clamp(0, _pages.length - 1);
    if (target != cur) {
      _pageController.animateToPage(target,
          duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
    }
  }

  void _onKey(KeyEvent e) {
    if (e is! KeyDownEvent) return;
    final k = e.logicalKey;
    if (k == LogicalKeyboardKey.arrowRight || k == LogicalKeyboardKey.pageDown) {
      _goToPage(1);
    } else if (k == LogicalKeyboardKey.arrowLeft || k == LogicalKeyboardKey.pageUp) {
      _goToPage(-1);
    }
  }

  void _chunkParagraphs() {
    List<String> current = [];
    int len = 0;
    for (final p in widget.paragraphs) {
      if (len + p.length > 1500 && current.isNotEmpty) {
        _pages.add(current);
        current = [p];
        len = p.length;
      } else {
        current.add(p);
        len += p.length;
      }
    }
    if (current.isNotEmpty) _pages.add(current);
  }

  @override
  void dispose() {
    _pageController.dispose();
    _kbFocus.dispose();
    super.dispose();
  }

  void _clearSelection() {
    setState(() {
      _selPage = null;
      _selPara = null;
      _selStart = null;
      _selEnd = null;
    });
  }

  void _onTapWord(int pageIndex, int pIndex, int tokenIndex, Token token,
      List<Token> tokens) {
    if (_phraseMode &&
        _selStart != null &&
        _selEnd == null &&
        _selPage == pageIndex &&
        _selPara == pIndex) {
      // Второй тап — закрываем фразу.
      var start = _selStart!;
      var end = tokenIndex;
      if (start > end) {
        final t = start;
        start = end;
        end = t;
      }
      final phrase = tokens.sublist(start, end + 1).map((t) => t.text).join();
      setState(() {
        _selStart = start;
        _selEnd = end;
      });
      _showAnalysisSheet(
        Token(text: phrase, start: tokens[start].start, end: tokens[end].end, isWord: true),
        _pages[pageIndex][pIndex],
      );
      return;
    }

    if (_phraseMode) {
      // Первый тап фразы — ждём второй.
      setState(() {
        _selPage = pageIndex;
        _selPara = pIndex;
        _selStart = tokenIndex;
        _selEnd = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Тапни на последнее слово фразы'), duration: Duration(seconds: 2)),
      );
      return;
    }

    // Обычный режим — одно слово.
    setState(() {
      _selPage = pageIndex;
      _selPara = pIndex;
      _selStart = tokenIndex;
      _selEnd = tokenIndex;
    });
    _showAnalysisSheet(token, _pages[pageIndex][pIndex]);
  }

  void _showAnalysisSheet(Token token, String sentence) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => WordAnalysisSheet(
        bookId: widget.bookId,
        sentence: sentence,
        token: token,
      ),
    ).then((_) => _clearSelection());
  }

  void _openReaderSettings() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const ReaderSettingsSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final settings = context.watch<AppSettings>().reader;

    // Пользовательский фон чтения (если выбран) + контрастный цвет текста.
    final customBg = settings.bgColor != 0 ? Color(settings.bgColor) : null;
    final textColor = customBg != null
        ? (customBg.computeLuminance() > 0.5
            ? const Color(0xFF20160E)
            : const Color(0xFFECE3D2))
        : scheme.onSurface;

    final pageNum = _pages.isEmpty
        ? 0
        : ((_pageController.hasClients ? _pageController.page?.round() : null) ??
                widget.initialParagraph) +
            1;

    return Scaffold(
      backgroundColor: customBg,
      appBar: AppBar(
        title: Text('${widget.title}  ($pageNum/${_pages.length})',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            tooltip: _phraseMode ? 'Режим фразы: вкл' : 'Режим фразы: выкл',
            icon: Icon(_phraseMode ? Icons.short_text : Icons.notes),
            color: _phraseMode ? scheme.tertiary : Colors.white,
            onPressed: () {
              setState(() => _phraseMode = !_phraseMode);
              _clearSelection();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(_phraseMode
                      ? 'Режим фразы: тапни первое и последнее слово'
                      : 'Режим одного слова'),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
          ),
          IconButton(
            tooltip: 'Настройки чтения',
            icon: const Icon(Icons.text_fields),
            onPressed: _openReaderSettings,
          ),
          IconButton(
            tooltip: 'Словарь книги',
            icon: const Icon(Icons.folder_open),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => VocabularyScreen(
                    bookId: widget.bookId,
                    bookTitle: widget.title,
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: _pages.isEmpty
          ? const Center(child: Text('Нет текста для отображения'))
          : KeyboardListener(
              focusNode: _kbFocus,
              autofocus: true,
              onKeyEvent: _onKey,
              child: Stack(
                children: [
                  ScrollConfiguration(
                    behavior: const _DragScrollBehavior(),
                    child: PageView.builder(
                      controller: _pageController,
                      itemCount: _pages.length,
                      onPageChanged: (i) {
                        UserDb.instance.updateBookProgress(widget.bookId, i);
                        _clearSelection();
                        setState(() {});
                      },
                      itemBuilder: (context, pageIndex) {
                        final paras = _pages[pageIndex];
                        return SingleChildScrollView(
                          padding: const EdgeInsets.fromLTRB(40, 18, 40, 60),
                          child: Center(
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth: settings.fullWidth
                                    ? double.infinity
                                    : settings.maxWidth,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (pageIndex == _startPage && _resumeHintVisible)
                                    _resumeHint(scheme),
                                  ...List.generate(paras.length, (pIndex) {
                                    final isSel = _selPage == pageIndex &&
                                        _selPara == pIndex;
                                    return Padding(
                                      padding: EdgeInsets.only(
                                          bottom: settings.paragraphSpacing),
                                      child: ReaderParagraph(
                                        text: paras[pIndex],
                                        settings: settings,
                                        textColor: textColor,
                                        highlightColor: scheme.primary,
                                        highlightTextColor: scheme.onPrimary,
                                        selStart: isSel ? _selStart : null,
                                        selEnd: isSel ? _selEnd : null,
                                        justify: settings.justify,
                                        firstLineIndent: settings.firstLineIndent,
                                        onTapWord: (ti, token, tokens) =>
                                            _onTapWord(
                                                pageIndex, pIndex, ti, token, tokens),
                                      ),
                                    );
                                  }),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  _buildArrow(scheme, left: true),
                  _buildArrow(scheme, left: false),
                ],
              ),
            ),
    );
  }

  Widget _resumeHint(ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Image.asset(Wolf.ukaz, height: 40),
            const SizedBox(width: 8),
            Flexible(
              child: Text('Вы остановились здесь',
                  style: TextStyle(
                      fontStyle: FontStyle.italic,
                      color: scheme.primary,
                      fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );

  Widget _buildArrow(ColorScheme scheme, {required bool left}) => Positioned(
        left: left ? 6 : null,
        right: left ? null : 6,
        top: 0,
        bottom: 0,
        child: Center(
          child: Material(
            color: scheme.surface.withValues(alpha: 0.55),
            shape: const CircleBorder(),
            elevation: 1,
            child: IconButton(
              icon: Icon(left ? Icons.chevron_left : Icons.chevron_right),
              color: scheme.primary,
              onPressed: () => _goToPage(left ? -1 : 1),
            ),
          ),
        ),
      );
}

/// Позволяет листать PageView мышью (на десктопе по умолчанию нельзя).
class _DragScrollBehavior extends MaterialScrollBehavior {
  const _DragScrollBehavior();
  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
        PointerDeviceKind.trackpad,
        PointerDeviceKind.stylus,
      };
}

/// Нижняя панель настроек чтения: шрифт, размер, межстрочный, трекинг,
/// bionic-режим и тема. Меняет глобальные настройки в реальном времени.
class ReaderSettingsSheet extends StatelessWidget {
  const ReaderSettingsSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final appSettings = context.watch<AppSettings>();
    final s = appSettings.reader;

    void set(ReaderSettings next) => context.read<AppSettings>().update(next);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
      child: SingleChildScrollView(
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: scheme.onSurface.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Настройки чтения',
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold, color: scheme.onSurface)),
          const SizedBox(height: 16),

          _label('Шрифт', scheme),
          Wrap(
            spacing: 8,
            children: ReaderFont.values
                .map((f) => ChoiceChip(
                      label: Text(f.label),
                      selected: s.font == f,
                      onSelected: (_) => set(s.copyWith(font: f)),
                    ))
                .toList(),
          ),
          const SizedBox(height: 14),

          _slider(
            context,
            'Размер: ${s.fontSize.round()}',
            s.fontSize,
            14,
            32,
            (v) => set(s.copyWith(fontSize: v)),
          ),
          _slider(
            context,
            'Межстрочный: ${s.lineHeight.toStringAsFixed(2)}',
            s.lineHeight,
            1.2,
            2.4,
            (v) => set(s.copyWith(lineHeight: v)),
          ),
          _slider(
            context,
            'Трекинг: ${s.letterSpacing.toStringAsFixed(1)}',
            s.letterSpacing,
            0,
            3,
            (v) => set(s.copyWith(letterSpacing: v)),
          ),

          const SizedBox(height: 6),
          _label('Выделение основы слова (быстрое чтение)', scheme),
          Wrap(
            spacing: 8,
            children: BionicLevel.values
                .map((b) => ChoiceChip(
                      label: Text(b.label),
                      selected: s.bionic == b,
                      onSelected: (_) => set(s.copyWith(bionic: b)),
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),

          _label('Тема', scheme),
          Wrap(
            spacing: 8,
            children: AppThemeMode.values
                .map((m) => ChoiceChip(
                      label: Text(m.label),
                      selected: s.themeMode == m,
                      onSelected: (_) => set(s.copyWith(themeMode: m)),
                    ))
                .toList(),
          ),
          const SizedBox(height: 16),

          _label('Вёрстка страницы', scheme),
          _slider(
            context,
            s.fullWidth
                ? 'Ширина колонки: вся ширина'
                : 'Ширина колонки: ${s.maxWidth.round()}',
            s.maxWidth,
            360,
            1100,
            (v) => set(s.copyWith(maxWidth: v)),
          ),
          _slider(
            context,
            'Отступ между абзацами: ${s.paragraphSpacing.round()}',
            s.paragraphSpacing,
            4,
            40,
            (v) => set(s.copyWith(paragraphSpacing: v)),
          ),
          _slider(
            context,
            'Красная строка: ${s.firstLineIndent.round()}',
            s.firstLineIndent,
            0,
            48,
            (v) => set(s.copyWith(firstLineIndent: v)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Выравнивание по ширине'),
            value: s.justify,
            onChanged: (v) => set(s.copyWith(justify: v)),
          ),
          const SizedBox(height: 12),

          _label('Фон страницы', scheme),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _bgSwatch(context, s, 0),
              for (final c in _bgPresets) _bgSwatch(context, s, c),
            ],
          ),
          const SizedBox(height: 10),
          Text('Свой оттенок',
              style: TextStyle(
                  fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.7))),
          Slider(
            value: _hueOf(s.bgColor),
            min: 0,
            max: 360,
            onChanged: (h) => set(s.copyWith(
                bgColor:
                    HSVColor.fromAHSV(1, h, 0.16, 0.97).toColor().toARGB32())),
          ),
        ],
        ),
      ),
    );
  }

  static const _bgPresets = [
    0xFFF3E9D2, // пергамент
    0xFFF4ECD8, // сепия
    0xFFFFFDF7, // тёплый белый
    0xFFE9E9E6, // светло-серый
    0xFFE2EFE3, // мятный
    0xFFE3ECF5, // небесный
    0xFFF5E6E8, // розовый
    0xFFEDE7F4, // лавандовый
    0xFF201A14, // тёмный
    0xFF000000, // чёрный
  ];

  double _hueOf(int argb) =>
      argb == 0 ? 0 : HSVColor.fromColor(Color(argb)).hue;

  Widget _bgSwatch(BuildContext context, ReaderSettings s, int argb) {
    final scheme = Theme.of(context).colorScheme;
    final selected = s.bgColor == argb;
    final color = argb == 0 ? scheme.surface : Color(argb);
    return GestureDetector(
      onTap: () =>
          context.read<AppSettings>().update(s.copyWith(bgColor: argb)),
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.2),
            width: selected ? 3 : 1,
          ),
        ),
        child: argb == 0
            ? Icon(Icons.format_color_reset,
                size: 18, color: scheme.onSurface.withValues(alpha: 0.6))
            : (selected
                ? Icon(Icons.check,
                    size: 18,
                    color: color.computeLuminance() > 0.5
                        ? Colors.black54
                        : Colors.white)
                : null),
      ),
    );
  }

  Widget _label(String text, ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: scheme.onSurface.withValues(alpha: 0.7))),
      );

  Widget _slider(BuildContext context, String label, double value, double min,
      double max, ValueChanged<double> onChanged) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: scheme.onSurface)),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class WordAnalysisSheet extends StatefulWidget {
  final int bookId;
  final String sentence;
  final Token token;

  const WordAnalysisSheet({
    super.key,
    required this.bookId,
    required this.sentence,
    required this.token,
  });

  @override
  State<WordAnalysisSheet> createState() => _WordAnalysisSheetState();
}

class _WordAnalysisSheetState extends State<WordAnalysisSheet> {
  late Future<WordAnalysis> _future;
  bool _isSaved = false;

  @override
  void initState() {
    super.initState();
    _future = AnalysisRepository.instance.analyzeToken(
      sentence: widget.sentence,
      startOffset: widget.token.start,
      endOffset: widget.token.end,
      tokenText: widget.token.text,
    );
  }

  Future<void> _save(WordAnalysis data) async {
    await UserDb.instance.addVocabulary(
      bookId: widget.bookId,
      word: data.surface,
      lemma: data.lemma,
      pos: data.upos,
      translation: data.translation,
      forms: data.forms,
    );
    setState(() => _isSaved = true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: FutureBuilder<WordAnalysis>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 220,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return SizedBox(
              height: 180,
              child: Center(
                child: Text('Ошибка при анализе',
                    style: TextStyle(color: scheme.error)),
              ),
            );
          }

          final data = snapshot.data!;
          final surface = data.surface;
          final lemma = data.lemma;
          final upos = data.upos;
          final feats = data.feats;
          final forms = data.forms;
          final translation = data.translation;
          final isOffline = data.isOffline;
          final isPhrase = data.isPhrase;

          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: scheme.onSurface.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(surface,
                            style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: scheme.onSurface)),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: isPhrase ? scheme.secondary : scheme.primary,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                  isPhrase ? 'фраза' : GrammarEngine.posShort(upos),
                                  style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white)),
                            ),
                            if (!isPhrase)
                              Text('лемма: $lemma',
                                  style: TextStyle(
                                      color: scheme.onSurface.withValues(alpha: 0.6),
                                      fontSize: 13)),
                            if (isOffline)
                              Icon(Icons.wifi_off,
                                  size: 14, color: scheme.onSurface.withValues(alpha: 0.5)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isSaved ? scheme.surfaceContainerHighest : scheme.primary,
                      foregroundColor: _isSaved ? scheme.onSurface : scheme.onPrimary,
                    ),
                    icon: Icon(_isSaved ? Icons.check : Icons.bookmark_add, size: 18),
                    label: Text(_isSaved ? 'В словаре' : 'В словарь'),
                    onPressed: _isSaved ? null : () => _save(data),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              WolfBubble(title: 'Перевод', text: translation, asset: Wolf.gram),
              if (!isPhrase &&
                  const {'NOUN', 'PROPN', 'ADJ', 'VERB', 'AUX', 'PRON'}
                      .contains(upos)) ...[
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(
                    icon: const Text('🐺', style: TextStyle(fontSize: 16)),
                    label: const Text('Почему так?'),
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => GrammarScreen(
                            word: surface,
                            lemma: lemma,
                            upos: upos,
                            feats: feats,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
              if (feats.isNotEmpty && !isPhrase) ...[
                const SizedBox(height: 18),
                _section('Грамматика', scheme),
                const SizedBox(height: 6),
                _chips(
                  GrammarEngine.humanFacts(upos, feats)
                      .map((f) => '${f.label}: ${f.value}')
                      .toList(),
                  scheme,
                  scheme.secondary,
                ),
              ],
              if (forms.isNotEmpty && !isPhrase) ...[
                const SizedBox(height: 18),
                _section('Основные формы', scheme),
                const SizedBox(height: 6),
                _chips(
                  forms.entries
                      .map((e) => '${GrammarEngine.formKeyRu(e.key)}: ${e.value}')
                      .toList(),
                  scheme,
                  scheme.primary,
                ),
              ],
              const SizedBox(height: 8),
            ],
          );
        },
      ),
    );
  }

  Widget _section(String text, ColorScheme scheme) => Text(text,
      style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface.withValues(alpha: 0.6)));

  Widget _chips(List<String> items, ColorScheme scheme, Color border) => Wrap(
        spacing: 8,
        runSpacing: 6,
        children: items
            .map((t) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: border.withValues(alpha: 0.4)),
                  ),
                  child: Text(t,
                      style: TextStyle(fontSize: 12, color: scheme.onSurface)),
                ))
            .toList(),
      );
}
