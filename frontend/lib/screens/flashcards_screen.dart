import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/grammar_engine.dart';
import '../services/interface_sounds.dart';
import '../services/phrase_builder.dart';
import '../services/user_db.dart';
import '../services/vocab_tags.dart';
import '../state/app_settings.dart';
import '../theme/app_theme.dart';
import '../utils/streak_praise.dart';
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

  /// Движений плиток на текущей фразе: выкладывания и снятия. Нужно, чтобы
  /// отличить сборку с первого раза (каждое слово легло сразу на место).
  int _tileMoves = 0;

  /// Фраза ли наверху очереди: у неё упражнение своё — собрать из слов, а не
  /// открыть перевод кнопкой.
  bool get _building =>
      _queue.isNotEmpty && isPhrase(_queue.first['word'] as String? ?? '');

  /// Готовит верх очереди к показу. Вызывается внутри setState.
  void _startCard() {
    _revealed = false;
    _tileMoves = 0;
    _overlayText = null;
    _overlayToken++;
    _picked = const [];
    final word = _queue.isEmpty ? '' : _queue.first['word'] as String? ?? '';
    _tiles = isPhrase(word) ? shuffleTiles(word) : const [];
  }

  /// Открыть ответ с тихим шелестом переворота. Единая точка вместо пяти
  /// разбросанных setState: звук обязан звучать одинаково от тапа, кнопки,
  /// клавиши и свайпа — и ни разу без открытия. Сборка фразы с первого раза
  /// звучит победой вместо шелеста: [sound]/[volume] её и меняют.
  void _reveal({
    InterfaceSound sound = InterfaceSound.flip,
    double volume = 0.16,
  }) {
    if (_revealed) return;
    setState(() => _revealed = true);
    _playSoft(sound, volume);
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
        _reveal();
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
      if (!_building) _reveal();
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
    if (!mounted) return;
    setState(() {
      _queue = List<Map<String, dynamic>>.from(cards);
      _loading = false;
      _startCard();
    });
  }

  bool _grading = false;

  /// Верных подряд в этой сессии. Ошибка обнуляет: хвалим серию, а не сумму.
  int _streak = 0;

  /// Оверлей-реакция над карточкой: радость рубежа серии или сочувствие
  /// ошибке. Null — спрятан; показ всегда через [_showOverlay], чтобы
  /// устаревший таймер не гасил свежую реакцию.
  String? _overlayText;
  String _overlayAsset = Wolf.slavlje;
  bool _overlayJoy = true;
  int _overlayToken = 0;

  void _playSoft(InterfaceSound sound, double volume) {
    InterfaceSounds.instance.enabled =
        context.read<AppSettings>().interfaceSoundEnabled;
    unawaited(InterfaceSounds.instance.play(sound, volume: volume));
  }

  /// Реакция волка прямо на карточке: радость рубежа или сочувствие
  /// ошибке. Оверлей не двигает вёрстку и сам прячется через пару секунд;
  /// reduced motion гасит появление.
  void _showOverlay({
    required String text,
    required String asset,
    required bool joy,
  }) {
    final token = ++_overlayToken;
    setState(() {
      _overlayText = text;
      _overlayAsset = asset;
      _overlayJoy = joy;
    });
    Future.delayed(const Duration(milliseconds: 2500), () {
      if (!mounted || token != _overlayToken) return;
      setState(() => _overlayText = null);
    });
  }

  void _playDoneSound() {
    InterfaceSounds.instance.enabled =
        context.read<AppSettings>().interfaceSoundEnabled;
    unawaited(InterfaceSounds.instance.play(InterfaceSound.complete));
  }

  Future<void> _grade(int grade) async {
    if (_grading || !mounted || _queue.isEmpty || !_revealed) return;
    _grading = true;
    final card = _queue.first;
    try {
      await UserDb.instance.gradeCard(card['id'] as int, grade);
      if (!mounted) return;
      setState(() {
        _queue.removeAt(0);
        if (grade <= 0) {
          _queue.add(card);
          _streak = 0;
        } else {
          _reviewed++;
          _streak++;
        }
        _startCard();
      });
      // Финал звучит один раз — в переходе, а не в build: иначе повтор
      // играл бы при каждой перерисовке экрана победы. Пустой день молчит.
      if (_queue.isEmpty && _reviewed > 0) {
        _playDoneSound();
        return;
      }
      if (grade <= 0) {
        // Мягкий сигнал, а не наказание: курс играет его же за неверный ответ.
        // Волк сочувствует тут же — слово всё равно вернётся ещё раз.
        _playSoft(InterfaceSound.error, 0.2);
        _showOverlay(
          text: 'Ничего, это сложное слово — оно ещё вернётся.',
          asset: Wolf.utesi,
          joy: false,
        );
        return;
      }
      final praise = streakPraise(_streak);
      if (praise != null) {
        _playSoft(InterfaceSound.complete, 0.24);
        _showOverlay(text: praise, asset: Wolf.slavlje, joy: true);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить ответ. Попробуй ещё раз.')),
      );
      }
    } finally {
      _grading = false;
    }
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
    final done = _reviewed > 0;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Финал говорит сам: победа — с праздником, пустой день —
            // спокойным знаком раздела.
            WolfBubble(
              title: done ? 'Готово!' : 'Пока тихо',
              text: done
                  ? 'Повторено карточек: $_reviewed. Так держать!'
                  : 'На сегодня карточек нет. Добавляй слова из книги — и возвращайся!',
              asset: done ? Wolf.slavlje : Wolf.povtor,
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
        // Похвала — оверлеем: появление не должно толкать кнопки оценок.
        child: Stack(
          children: [
            Column(
              children: [
                Expanded(
                  child: PressableScale(
                    onTap: () {
                      if (!building) _reveal();
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
                        onPressed: _reveal,
                        child: const Text('Показать ответ'),
                      )
                    : ElevatedButton(
                        onPressed: _reveal,
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
        // Волк-реакция на рубеже серии и сочувствие ошибке: компактная
        // пилюля поверх карточки. Не перехватывает нажатия и гаснет сама;
        // следующая карточка сбрасывает её через _startCard.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: AnimatedOpacity(
              opacity: _overlayText == null ? 0.0 : 1.0,
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 250),
              child: _overlayText == null
                  ? const SizedBox.shrink()
                  : Center(child: _overlayPill(scheme)),
            ),
          ),
        ),
      ],
    ),
      ),
    );
  }

  /// Пилюля реакции: маленький волк и одна строка. Радость — с зелёной
  /// рамкой, сочувствие — со спокойной чернильной.
  Widget _overlayPill(ColorScheme scheme) {
    final joy = _overlayJoy;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 16, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: (joy ? scheme.success : scheme.secondary)
              .withValues(alpha: 0.6),
        ),
        boxShadow: [
          BoxShadow(
            color: scheme.shadow.withValues(alpha: 0.12),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Поза меняется состоянием — const здесь невозможен.
          WolfSticker(asset: _overlayAsset, size: 48, animate: false),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              _overlayText ?? '',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: scheme.onSurface,
              ),
            ),
          ),
        ],
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
                            : () {
                                setState(() => _picked = [
                                      for (final p in _picked)
                                        if (p.id != tile.id) p
                                    ]);
                                _tileMoves++;
                                _playSoft(InterfaceSound.tile, 0.12);
                              }),
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
                // Выложил последнее слово — ответ уже дан: вместо клика
                // шелест финала сборки, спрашивать «проверить?» незачем.
                // А если каждое слово легло сразу на место — тихая победа.
                final assembled = _picked.length + 1 >= _tiles.length;
                setState(() => _picked = [..._picked, tile]);
                _tileMoves++;
                if (assembled) {
                  final firstTry = isAssembled(_picked, phrase) &&
                      _tileMoves <= _tiles.length;
                  _reveal(
                    sound: firstTry
                        ? InterfaceSound.complete
                        : InterfaceSound.flip,
                    volume: firstTry ? 0.2 : 0.16,
                  );
                } else {
                  _playSoft(InterfaceSound.tile, 0.14);
                }
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
