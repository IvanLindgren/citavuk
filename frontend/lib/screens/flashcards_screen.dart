import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/grammar_engine.dart';
import '../services/phrase_builder.dart';
import '../services/user_db.dart';
import '../services/vocab_tags.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/shortcuts_sheet.dart';
import '../widgets/wolf_mascot.dart';
import 'writing_review_screen.dart';

class FlashcardsScreen extends StatefulWidget {
  final int bookId;
  final String bookTitle;

  /// Готовая очередь вместо «что подошло по сроку в этой книге».
  ///
  /// Ею открывается заход по метке из словаря: попросив повторить «#трудное»,
  /// человек хочет пройти именно эти слова, а не те из них, у которых сегодня
  /// подошла очередь, — иначе кнопка чаще выдавала бы пустой экран, чем
  /// работала.
  final List<Map<String, dynamic>>? cards;

  /// Чем сужен словарь. Показывается в шапке, чтобы заход не выглядел обычным.
  final String? focusLabel;

  const FlashcardsScreen({
    super.key,
    required this.bookId,
    required this.bookTitle,
    this.cards,
    this.focusLabel,
  });

  @override
  State<FlashcardsScreen> createState() => _FlashcardsScreenState();
}

class _FlashcardsScreenState extends State<FlashcardsScreen> {
  List<Map<String, dynamic>> _queue = [];
  bool _loading = true;
  bool _revealed = false;
  int _reviewed = 0;
  final _keyboard = FocusNode();

  /// Перемешанные слова фразы и то, что человек уже выложил.
  List<Tile> _tiles = const [];
  List<Tile> _picked = const [];

  /// Фраза ли наверху очереди: у неё упражнение своё — собрать из слов, а не
  /// открыть перевод кнопкой.
  bool get _building =>
      _queue.isNotEmpty && isPhrase(_queue.first['word'] as String? ?? '');

  /// Готовит верх очереди к показу. Вызывается внутри setState.
  void _startCard() {
    _revealed = false;
    _picked = const [];
    final word = _queue.isEmpty ? '' : _queue.first['word'] as String? ?? '';
    _tiles = isPhrase(word) ? shuffleTiles(word) : const [];
  }

  @override
  void dispose() {
    _keyboard.dispose();
    super.dispose();
  }

  /// Клавиши: пробел открывает ответ, цифры ставят оценку. Пока ответ скрыт,
  /// оценивать нечего — цифры молчат.
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;

    if (key == LogicalKeyboardKey.escape) {
      Navigator.of(context).maybePop();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.f1 || key == LogicalKeyboardKey.slash) {
      showShortcutsSheet(context, ReaderShortcuts.flashcards);
      return KeyEventResult.handled;
    }
    if (!_revealed) {
      // У фразы пробел молчит: случайное нажатие сорвало бы сборку, которую
      // человек ещё не закончил.
      if (!_building &&
          (key == LogicalKeyboardKey.space ||
              key == LogicalKeyboardKey.enter ||
              key == LogicalKeyboardKey.numpadEnter)) {
        setState(() => _revealed = true);
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    }
    final grades = {
      LogicalKeyboardKey.digit1: 0,
      LogicalKeyboardKey.numpad1: 0,
      LogicalKeyboardKey.digit2: 1,
      LogicalKeyboardKey.numpad2: 1,
      LogicalKeyboardKey.digit3: 2,
      LogicalKeyboardKey.numpad3: 2,
    };
    final grade = grades[key];
    if (grade == null) return KeyEventResult.ignored;
    _grade(grade);
    return KeyEventResult.handled;
  }

  /// Свайпы: влево — «снова», вправо — «хорошо», вверх — «легко».
  void _onSwipe(DragEndDetails details, {required bool horizontal}) {
    if (!_revealed) {
      if (!_building) setState(() => _revealed = true);
      return;
    }
    final velocity = horizontal
        ? details.velocity.pixelsPerSecond.dx
        : details.velocity.pixelsPerSecond.dy;
    if (velocity.abs() < 250) return;
    if (horizontal) {
      _grade(velocity < 0 ? 0 : 1);
    } else if (velocity < 0) {
      _grade(2);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cards =
        widget.cards ?? await UserDb.instance.getDueCards(widget.bookId);
    setState(() {
      _queue = List<Map<String, dynamic>>.from(cards);
      _loading = false;
      _startCard();
    });
  }

  Future<void> _grade(int grade) async {
    if (_queue.isEmpty) return;
    final card = _queue.removeAt(0);
    await UserDb.instance.gradeCard(card['id'] as int, grade);
    setState(() {
      if (grade <= 0) _queue.add(card); // «Снова» — вернуть в конец
      _reviewed++;
      _startCard();
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.focusLabel == null
            ? 'Карточки'
            : 'Карточки · ${widget.focusLabel}'),
        actions: [
          if (!_loading && _queue.isNotEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Text('осталось: ${_queue.length}',
                    style: const TextStyle(fontSize: 14)),
              ),
            ),
          // В заходе по метке письма нет: WritingReviewScreen берёт слова по
          // книге, и кнопка увела бы из отобранного во всю книгу целиком.
          if (widget.cards == null)
            IconButton(
              tooltip: 'Повторять письмом',
              icon: const Icon(Icons.draw_outlined),
              onPressed: () async {
                await Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => WritingReviewScreen(
                      bookId: widget.bookId,
                      bookTitle: widget.bookTitle,
                    ),
                  ),
                );
                // Срок карточки мог измениться в том режиме: очередь здесь
                // обязана это увидеть, иначе слово покажется второй раз подряд.
                if (mounted) await _load();
              },
            ),
          IconButton(
            tooltip: 'Клавиши и жесты',
            icon: const Icon(Icons.keyboard_outlined),
            onPressed: () =>
                showShortcutsSheet(context, ReaderShortcuts.flashcards),
          ),
        ],
      ),
      body: Focus(
        focusNode: _keyboard,
        autofocus: true,
        onKeyEvent: _onKey,
        child: GestureDetector(
          onHorizontalDragEnd: (d) => _onSwipe(d, horizontal: true),
          onVerticalDragEnd: (d) => _onSwipe(d, horizontal: false),
          behavior: HitTestBehavior.opaque,
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _queue.isEmpty
                  ? _buildDone(scheme)
                  : _buildCard(scheme, _queue.first),
        ),
      ),
    );
  }

  Widget _buildDone(ColorScheme scheme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const WolfSticker(asset: Wolf.povtor, size: 150),
            const SizedBox(height: 16),
            Text(
              _reviewed == 0
                  ? 'На сегодня карточек нет.\nДобавляй слова из книги — и возвращайся!'
                  : 'Готово! Повторено карточек: $_reviewed ',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 18, color: scheme.onSurface),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Назад к словарю'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(ColorScheme scheme, Map<String, dynamic> card) {
    final word = card['word'] as String;
    final lemma = card['lemma'] as String? ?? '';
    final pos = card['pos'] as String? ?? '';
    final translation = card['translation'] as String? ?? '';
    Map<String, dynamic> forms = {};
    try {
      forms = jsonDecode(card['forms'] as String);
    } catch (_) {}

    final ease = (card['ease'] as num?)?.toDouble() ?? 2.5;
    final reps = (card['reps'] as int?) ?? 0;
    final diff = _difficulty(ease, reps, scheme);
    final tip = _memoryTips[word.hashCode.abs() % _memoryTips.length];
    final building = isPhrase(word);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Expanded(
              child: PressableScale(
                onTap: () {
                  if (!building) setState(() => _revealed = true);
                },
                child: Card(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: diff.color, width: 2.5),
                  ),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    alignment: Alignment.center,
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Align(
                            alignment: Alignment.centerRight,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 3),
                              decoration: BoxDecoration(
                                color: diff.color.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: diff.color),
                              ),
                              child: Text(diff.label,
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: diff.color)),
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (building)
                            ..._phraseBody(scheme, word, translation)
                          else ...[
                            Text(word,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 36,
                                    fontWeight: FontWeight.bold,
                                    fontFamily: 'NotoSerif',
                                    color: scheme.primary)),
                            if (!_revealed) ...[
                              const SizedBox(height: 16),
                              Text('нажми, чтобы увидеть перевод',
                                  style: TextStyle(
                                      color: scheme.onSurface
                                          .withValues(alpha: 0.5))),
                            ] else ...[
                              const SizedBox(height: 16),
                              Divider(
                                  color: scheme.primary.withValues(alpha: 0.3)),
                              const SizedBox(height: 12),
                              Text(translation,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w600,
                                      color: scheme.onSurface)),
                              const SizedBox(height: 10),
                              Text(
                                [
                                  if (pos.isNotEmpty)
                                    GrammarEngine.posShort(pos),
                                  if (lemma.isNotEmpty) 'нач. форма: $lemma',
                                ].join('  ·  '),
                                style: TextStyle(
                                    fontSize: 13,
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.6)),
                              ),
                              if (forms.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                Wrap(
                                  alignment: WrapAlignment.center,
                                  spacing: 8,
                                  runSpacing: 6,
                                  children: forms.entries
                                      .map((e) => Chip(
                                            label: Text(
                                                '${GrammarEngine.formKeyRu(e.key)}: ${e.value}',
                                                style: const TextStyle(
                                                    fontSize: 12)),
                                            backgroundColor:
                                                scheme.surfaceContainerHighest,
                                          ))
                                      .toList(),
                                ),
                              ],
                            ],
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            _associationTip(scheme, tip),
            const SizedBox(height: 16),
            if (!_revealed)
              SizedBox(
                width: double.infinity,
                // У фразы главное действие — выкладывать слова, поэтому «сдаюсь»
                // здесь кнопка потише.
                child: building
                    ? OutlinedButton(
                        onPressed: () => setState(() => _revealed = true),
                        child: const Text('Показать ответ'),
                      )
                    : ElevatedButton(
                        onPressed: () => setState(() => _revealed = true),
                        child: const Text('Показать перевод'),
                      ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: _gradeButton(
                        'Снова', Colors.redAccent, () => _grade(0)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _gradeButton(
                        'Хорошо', scheme.secondary, () => _grade(1)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _gradeButton('Легко', Colors.green, () => _grade(2)),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Лицо карточки-фразы: перевод сверху, ниже — выложенное и оставшиеся слова.
  ///
  /// Спрашивать у фразы перевод — упражнение совсем другого веса: это «переведи
  /// предложение», а не «вспомни слово». Письмом фразы не повторяются намеренно.
  /// Поэтому здесь наоборот: показан перевод, а сербскую фразу надо выложить по
  /// порядку — он в ней и есть трудное место.
  List<Widget> _phraseBody(
      ColorScheme scheme, String phrase, String translation) {
    final correct = _revealed && isAssembled(_picked, phrase);
    final pool =
        _tiles.where((tile) => !_picked.any((p) => p.id == tile.id)).toList();
    final frame = !_revealed
        ? scheme.outlineVariant
        : correct
            ? Colors.green
            : Colors.redAccent;

    return [
      Text('Соберите фразу по-сербски',
          style: TextStyle(
              fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.6))),
      const SizedBox(height: 8),
      Text(translation.isEmpty ? '—' : translation,
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface)),
      const SizedBox(height: 20),
      Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: frame, width: 1.5),
        ),
        child: _picked.isEmpty
            ? Center(
                child: Text('нажимайте слова по порядку',
                    style: TextStyle(
                        color: scheme.onSurface.withValues(alpha: 0.5))),
              )
            : Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final tile in _picked)
                    _wordTile(scheme, tile.text,
                        onTap: _revealed
                            ? null
                            : () => setState(() => _picked = [
                                  for (final p in _picked)
                                    if (p.id != tile.id) p
                                ])),
                ],
              ),
      ),
      if (!_revealed && pool.isNotEmpty) ...[
        const SizedBox(height: 14),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final tile in pool)
              _wordTile(scheme, tile.text, onTap: () {
                setState(() {
                  _picked = [..._picked, tile];
                  // Выложил последнее слово — ответ уже дан, спрашивать
                  // «проверить?» незачем.
                  if (_picked.length == _tiles.length) _revealed = true;
                });
              }),
          ],
        ),
      ],
      if (_revealed) ...[
        const SizedBox(height: 16),
        if (correct)
          const Text('Верно',
              style:
                  TextStyle(fontWeight: FontWeight.bold, color: Colors.green))
        else ...[
          Text('А было так',
              style: TextStyle(
                  fontSize: 13,
                  color: scheme.onSurface.withValues(alpha: 0.6))),
          const SizedBox(height: 6),
          Text(phrase,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 20,
                  fontFamily: 'NotoSerif',
                  fontWeight: FontWeight.bold,
                  color: scheme.primary)),
        ],
      ],
    ];
  }

  Widget _wordTile(ColorScheme scheme, String text, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Text(text,
            style: const TextStyle(fontSize: 17, fontFamily: 'NotoSerif')),
      ),
    );
  }

  ({Color color, String label}) _difficulty(
      double ease, int reps, ColorScheme scheme) {
    if (reps == 0) return (color: scheme.secondary, label: 'новое');
    if (ease < 2.0) return (color: Colors.redAccent, label: 'трудно');
    if (ease < 2.5) return (color: Colors.orange, label: 'средне');
    return (color: Colors.green, label: 'легко');
  }

  static const _memoryTips = [
    'Подумай, как бы ты изобразил это слово в голове? Может, оно вызывает смех... или наоборот тревожность?',
    'Придумай в голове историю с этим словом, и тебе будет легче!',
    'Прочувствуй слово: представь ситуацию, где ты его используешь.',
    'Я укушу тебя, если ты не запомнишь это слово!!!',
  ];

  Widget _associationTip(ColorScheme scheme, String tip) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.lightbulb_outline, size: 18, color: scheme.tertiary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(tip,
                style: TextStyle(
                    fontSize: 12.5,
                    color: scheme.onSurface.withValues(alpha: 0.75))),
          ),
        ],
      ),
    );
  }

  Widget _gradeButton(String label, Color color, VoidCallback onTap) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      onPressed: onTap,
      child: Text(label),
    );
  }
}
