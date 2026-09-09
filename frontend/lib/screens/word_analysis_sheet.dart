part of 'book_reader_screen.dart';

/// Запрос на разбор: слово в предложении.
///
/// Одинаковое слово в разных предложениях — разные запросы: перевод зависит
/// от контекста, и вчерашний ответ к сегодняшнему предложению прикладывать
/// нельзя.
class WordLookupRequest {
  final int bookId;
  final String sentence;
  final Token token;

  const WordLookupRequest({
    required this.bookId,
    required this.sentence,
    required this.token,
  });

  String get key => '$sentence\n${token.text}@${token.start}-${token.end}';
}

/// Верхний ряд панели разбора: «назад» по истории просмотров и закрытие.
///
/// Один на шторку и боковую панель — возврат к предыдущему слову работает
/// везде одинаково.
Widget _lookupNavRow({
  required ColorScheme scheme,
  required bool canGoBack,
  required VoidCallback? onBack,
  required VoidCallback? onClose,
}) {
  return Row(
    children: [
      if (canGoBack)
        TextButton.icon(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back, size: 18),
          label: const Text('Назад'),
        ),
      const Spacer(),
      if (onClose != null)
        IconButton(
          tooltip: 'Закрыть разбор',
          onPressed: onClose,
          icon: const Icon(Icons.close),
        ),
    ],
  );
}

class WordAnalysisSheet extends StatelessWidget {
  final int bookId;
  final String sentence;
  final Token token;

  /// Возврат к предыдущему слову истории (показывает и кнопку «Назад»).
  final bool canGoBack;
  final VoidCallback? onBack;
  final VoidCallback? onClose;

  const WordAnalysisSheet({
    super.key,
    required this.bookId,
    required this.sentence,
    required this.token,
    this.canGoBack = false,
    this.onBack,
    this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Padding(
        // Отступ снизу складывается из клавиатуры и системной навигации.
        // Приложение рисует под строку навигации (edgeToEdge), и без второго
        // слагаемого низ панели — кнопка «в словарь», таблица форм — уезжал под
        // кнопки Android. На Android 15 режим edge-to-edge включён всегда,
        // поэтому это видно у всех.
        //
        // MediaQuery.padding уже вычитает viewInsets, так что при открытой
        // клавиатуре слагаемые не складываются дважды.
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 8,
          bottom: MediaQuery.of(context).viewInsets.bottom +
              MediaQuery.of(context).padding.bottom +
              24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _sheetHandleBar(context, scheme),
            if (canGoBack || onClose != null)
              _lookupNavRow(
                scheme: scheme,
                canGoBack: canGoBack,
                onBack: onBack,
                onClose: onClose,
              ),
            Flexible(
              child: WordAnalysisBody(
                request: WordLookupRequest(
                  bookId: bookId,
                  sentence: sentence,
                  token: token,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Содержимое карточки разбора: слово, перевод в контексте, разбор, словарь.
///
/// Одно на все оболочки: нижнюю шторку на телефоне, боковую панель на
/// десктопе, плеер и событие. Состояние живёт внутри и всегда относится к
/// одному запросу: смена слова пересоздаёт виджет (по ключу), поэтому
/// запоздавший ответ от предыдущего слова показать некому — показать его
/// просто негде.
class WordAnalysisBody extends StatefulWidget {
  final WordLookupRequest request;

  const WordAnalysisBody({super.key, required this.request});

  @override
  State<WordAnalysisBody> createState() => _WordAnalysisBodyState();
}

class _WordAnalysisBodyState extends State<WordAnalysisBody> {
  late Future<WordAnalysis> _future;

  /// Толкование начальной формы. null — ещё не спрашивали (слово английское,
  /// фраза или разбор не дошёл); ответ null внутри — слова в словаре нет.
  Future<Definition?>? _definition;
  final AudioPlayer _ttsPlayer = AudioPlayer();
  bool _isSaved = false;

  /// Запись, созданная этим нажатием «В словарь». null — ещё не сохраняли.
  /// Отмена убирает только её: существовавшую до этого запись не трогаем.
  int? _savedId;
  bool _createdByMe = false;
  bool _saving = false;
  bool _speaking = false;
  String _voice = ListeningService.instance.voice;

  /// Что уйдёт в словарь: начальная форма или словоформа из текста.
  /// По умолчанию начальная — это словарная статья, и повторять её карточкой
  /// полезнее, чем одну случайную форму.
  bool _saveLemma = true;

  @override
  void initState() {
    super.initState();
    _beginLookup();
    _ttsPlayer.onPlayerStateChanged.listen((state) {
      if (mounted) setState(() => _speaking = state == PlayerState.playing);
    });
  }

  /// Один разбор на жизнь виджета. Новое слово — новый виджет, поэтому здесь
  /// нет ни токенов отмены, ни сверок версий: старый виджет уже размонтирован
  /// и его `mounted` ложен.
  void _beginLookup() {
    unawaited(_ttsPlayer.stop());
    final request = widget.request;
    _future = AnalysisRepository.instance.analyzeToken(
      sentence: request.sentence,
      startOffset: request.token.start,
      endOffset: request.token.end,
      tokenText: request.token.text,
    );
    _future.then((data) {
      if (!mounted) return;
      _playPronunciation(data.isEnglish ? 'en' : 'sr');
      _lookUpDefinition(data);
    });
  }

  void _retry() {
    _definition = null;
    _beginLookup();
    setState(() {});
  }

  /// Толкование запрашивается после разбора: спрашивать надо начальную форму,
  /// а она известна только из него.
  ///
  /// Английские слова и фразы пропускаются: сербский толковый словарь про них
  /// ничего не знает, и ходить за пустым ответом незачем.
  void _lookUpDefinition(WordAnalysis data) {
    if (data.isEnglish || data.isPhrase) return;
    final lemma = data.lemma.trim();
    if (lemma.isEmpty) return;
    final request = DefinitionService.instance.lookup(lemma);
    if (!mounted) return;
    setState(() => _definition = request);
  }

  Future<void> _playPronunciation([String lang = 'sr']) async {
    await _ttsPlayer.stop();
    await _ttsPlayer.play(UrlSource(
      ListeningService.instance.ttsUrl(widget.request.token.text, lang: lang),
    ));
  }

  @override
  void dispose() {
    _ttsPlayer.dispose();
    super.dispose();
  }

  /// Короткое описание формы: «мн. ч.», «3 л. ед., презент».
  /// Пустое, если слово и так начальная форма.
  static String formLabelOf(WordAnalysis data) {
    if (data.english != null) return data.english!.formLabel;
    if (data.feats.isEmpty) return '';
    final facts = GrammarEngine.humanFacts(data.upos, data.feats);
    return facts.map((f) => f.value).join(', ');
  }

  /// Есть ли из чего выбирать: словоформа отличается от начальной формы.
  static bool hasFormChoice(WordAnalysis data) =>
      !data.isPhrase &&
      data.lemma.isNotEmpty &&
      data.surface.toLowerCase() != data.lemma.toLowerCase();

  /// Настоящий перевод, а не заглушка вида «[Перевод временно недоступен]».
  /// Повторяет проверку репозитория: заглушка не должна ни показываться как
  /// ответ, ни уходить в словарь.
  static bool hasUsableTranslation(WordAnalysis data) {
    final text = data.translation.trim();
    if (text.isEmpty) return false;
    return !RegExp(
      r'^\[?перевод (недоступен|временно недоступен|доступен только онлайн)',
      caseSensitive: false,
    ).hasMatch(text);
  }

  Future<void> _save(WordAnalysis data, {required bool asLemma}) async {
    // Снекбар «Повторить» переживает карточку: нажатие после её закрытия
    // вызывало бы setState уничтоженного State.
    if (!mounted) return;
    if (_saving || _isSaved || !hasUsableTranslation(data)) return;
    setState(() => _saving = true);
    try {
      String translation = data.translation;
      final ctx = data.contextualTranslation?.trim();
      final gen = data.translation.trim();
      if (ctx != null &&
          ctx.isNotEmpty &&
          ctx.toLowerCase() != gen.toLowerCase()) {
        translation = 'В тексте: $ctx\nВ общем: $gen';
      }

      // При сохранении словоформы в карточку кладётся ещё и разбор этой формы:
      // иначе через неделю непонятно, почему в словаре «svira», а не «svirati».
      final forms = Map<String, dynamic>.from(data.forms);
      final label = formLabelOf(data);
      if (!asLemma && label.isNotEmpty) {
        forms['форма в тексте'] = label;
        forms['начальная форма'] = data.lemma;
      }

      final word = asLemma && data.lemma.isNotEmpty ? data.lemma : data.surface;
      final saved = await UserDb.instance.addVocabulary(
        bookId: widget.request.bookId,
        word: word,
        lemma: data.lemma,
        pos: data.upos,
        translation: translation,
        forms: forms,
      );
      lightHaptic();
      if (mounted) {
        // Тихое подтверждение в пару к тактильному: слово ушло в словарь.
        // Звук — вспомогательный канал, его отсутствие не ломает сохранение.
        InterfaceSounds.instance.enabled =
            context.read<AppSettings>().interfaceSoundEnabled;
        unawaited(InterfaceSounds.instance.play(InterfaceSound.confirm));
        setState(() {
          _isSaved = true;
          _savedId = saved.id;
          _createdByMe = saved.created;
        });
      }
    } catch (_) {
      // Ошибка молча разблокировала бы кнопку: человек не узнал бы, что слово
      // не сохранилось. Показываем что случилось и даём повторить тем же нажатием.
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Не удалось сохранить слово.'),
          action: SnackBarAction(
            label: 'Повторить',
            onPressed: () => _save(data, asLemma: asLemma),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Отмена своего сохранения. Чужую (существовавшую до нажатия) запись не
  /// удаляет — для неё кнопка просто показывает состояние.
  Future<void> _undoSave() async {
    if (!mounted) return;
    final id = _savedId;
    if (_saving || !_isSaved || !_createdByMe || id == null) return;
    setState(() => _saving = true);
    try {
      await UserDb.instance.removeVocabulary(id);
      if (mounted) {
        setState(() {
          _isSaved = false;
          _savedId = null;
          _createdByMe = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Не удалось убрать слово.'),
          action: SnackBarAction(
            label: 'Повторить',
            onPressed: _undoSave,
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _onSaveTap(WordAnalysis data, {required bool asLemma}) {
    if (_isSaved) {
      _undoSave();
    } else {
      _save(data, asLemma: asLemma);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Спокойный режим: волк в карточке стоит смирно, без парения.
    final calm = context.watch<AppSettings>().reader.calm;
    return FutureBuilder<WordAnalysis>(
      future: _future,
      builder: (context, snapshot) {
        // Слово показываем сразу, без ожидания сети. Крутится только строка
        // перевода — область ещё не полученного результата.
        if (snapshot.connectionState == ConnectionState.waiting) {
          return _loadingBody(scheme);
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return _errorBody(scheme);
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
        final usable = hasUsableTranslation(data);

        // Контекстный перевод (для этого предложения) — главный; «общий»
        // перевод слова показываем мельче ниже, если он отличается.
        final ctx = data.contextualTranslation?.trim();
        final gen = translation.trim();
        final hasContext = usable &&
            ctx != null &&
            ctx.isNotEmpty &&
            ctx.toLowerCase() != gen.toLowerCase();
        final primaryTranslation =
            hasContext ? ctx : (gen.isNotEmpty ? gen : translation);

        // Авто-подсказка: если это предлог (или фраза, начинающаяся с
        // предлога) — показываем, каким падежом он управляет. Для не-предлогов
        // список пустой, и карточка не появляется.
        final prepWord =
            isPhrase ? surface.trim().split(RegExp(r'\s+')).first : surface;
        final government = GrammarEngine.prepositionGovernment(prepWord);

        return FadeSlideIn(
          duration: const Duration(milliseconds: 220),
          offsetY: 7,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Flexible(
                                child: Text(surface,
                                    style: TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.bold,
                                        color: scheme.onSurface)),
                              ),
                              IconButton(
                                tooltip: 'Произнести слово',
                                onPressed: () => _playPronunciation(
                                    data.isEnglish ? 'en' : 'sr'),
                                icon: Icon(_speaking
                                    ? Icons.stop_circle_outlined
                                    : Icons.volume_up_outlined),
                              ),
                              if (!data.isEnglish)
                                PopupMenuButton<String>(
                                  tooltip: 'Выбрать диктора',
                                  initialValue: _voice,
                                  onSelected: (voice) async {
                                    await ListeningService.instance
                                        .setVoice(voice);
                                    if (!mounted) return;
                                    setState(() => _voice = voice);
                                    await _playPronunciation('sr');
                                  },
                                  itemBuilder: (_) => [
                                    for (final entry in ListeningService
                                        .serbianVoices.entries)
                                      PopupMenuItem(
                                        value: entry.key,
                                        child: Text(entry.value),
                                      ),
                                  ],
                                  icon: const Icon(
                                      Icons.record_voice_over_outlined),
                                ),
                            ],
                          ),
                          // Ударение выделяется жирным прямо в
                          // транскрипции. Подпись словами («ударение не
                          // на последнем слоге») — это рассуждение о
                          // произношении, а не само произношение.
                          if (!isPhrase && !data.isEnglish)
                            Builder(builder: (context) {
                              final (before, stressed, after) =
                                  SerbianPronunciation.ipaParts(surface);
                              final style = TextStyle(
                                color: scheme.onSurface.withValues(alpha: 0.65),
                                fontSize: 13,
                              );
                              return Text.rich(
                                TextSpan(
                                  style: style,
                                  children: [
                                    TextSpan(text: before),
                                    TextSpan(
                                      text: stressed,
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: scheme.onSurface,
                                      ),
                                    ),
                                    TextSpan(text: after),
                                  ],
                                ),
                              );
                            }),
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 8,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: isPhrase
                                      ? scheme.secondary
                                      : scheme.primary,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                    isPhrase
                                        ? 'фраза'
                                        : GrammarEngine.posShort(upos),
                                    style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.white)),
                              ),
                              if (!isPhrase)
                                Text('нач. форма: $lemma',
                                    style: TextStyle(
                                        color: scheme.onSurface
                                            .withValues(alpha: 0.6),
                                        fontSize: 13)),
                              if (isOffline)
                                Icon(Icons.wifi_off,
                                    size: 14,
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.5)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    // Когда есть из чего выбирать (форма ≠ начальная
                    // форма), сохранение живёт в блоке выбора ниже —
                    // двух кнопок «в словарь» в одной карточке быть
                    // не должно.
                    if (!hasFormChoice(data))
                      _saveButton(scheme, data, asLemma: true),
                  ],
                ),
                const SizedBox(height: 18),
                if (data.isEnglish) ...[
                  _englishNotice(scheme),
                  const SizedBox(height: 14),
                ],
                if (usable)
                  WolfBubble(
                    title: hasContext ? 'В этом тексте' : 'Перевод',
                    text: primaryTranslation,
                    asset: data.isEnglish ? Wolf.english : Wolf.gram,
                    animate: !calm,
                  )
                else
                  _offlineNotice(scheme),
                if (usable && hasContext) ...[
                  const SizedBox(height: 10),
                  _generalTranslationCard(scheme, gen),
                ],
                // Толкование по-сербски: перевод отвечает «что это
                // по-русски», толкование — «что это значит». Пока идёт
                // запрос и когда слова в словаре нет, места оно не
                // занимает: пустая рамка хуже, чем ничего.
                if (_definition != null)
                  FutureBuilder<Definition?>(
                    future: _definition,
                    builder: (context, snap) {
                      final entry = snap.data;
                      if (entry == null) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: FadeSlideIn(child: DefinitionCard(entry)),
                      );
                    },
                  ),
                if (isPhrase && data.sentenceAnalysis != null) ...[
                  const SizedBox(height: 14),
                  _sentenceAnalysisCard(scheme, data.sentenceAnalysis!),
                ] else if (isPhrase && data.phraseInsight != null) ...[
                  const SizedBox(height: 14),
                  _phraseGrammarCard(scheme, data.phraseInsight!),
                ],
                if (government.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  PrepositionGovernmentCard(
                      preposition: prepWord, government: government),
                ],
                if (data.isEnglish) ...[
                  const SizedBox(height: 18),
                  _englishGrammar(scheme, data.english!),
                ],
                if (!data.isEnglish &&
                    !isPhrase &&
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
                if (feats.isNotEmpty && !isPhrase && !data.isEnglish) ...[
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
                  // Слова нет в словаре форм, и начальную форму
                  // подсказала нейросеть. Падеж и таблицы посчитаны по
                  // правилам, но читатель должен знать, что словарной
                  // статьи за этим разбором не стоит.
                  if (data.generated) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Этого слова нет в словаре Читавука: начальную '
                      'форму подсказала нейросеть, а падеж и склонение '
                      'построены по правилам языка.',
                      style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          fontStyle: FontStyle.italic,
                          color: scheme.onSurface.withValues(alpha: 0.65)),
                    ),
                  ],
                ],
                if (hasFormChoice(data)) ...[
                  const SizedBox(height: 18),
                  _saveChoice(context, scheme, data),
                ],
                if (forms.isNotEmpty && !isPhrase && !data.isEnglish) ...[
                  const SizedBox(height: 18),
                  _section('Основные формы', scheme),
                  const SizedBox(height: 6),
                  _chips(
                    forms.entries
                        .map((e) =>
                            '${GrammarEngine.formKeyRu(e.key)}: ${e.value}')
                        .toList(),
                    scheme,
                    scheme.primary,
                  ),
                ],
                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Загрузка: слово видно сразу, крутится только строка перевода.
  Widget _loadingBody(ColorScheme scheme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        Text(widget.request.token.text,
            style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: scheme.onSurface)),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const MascotView(state: MascotState.thinking, size: 84),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Читавук разбирает слово',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface)),
                  const SizedBox(height: 3),
                  Row(children: [
                    Flexible(
                      child: Text('Ищет значение в этом предложении',
                          style: TextStyle(
                              fontSize: 12,
                              color: scheme.onSurface.withValues(alpha: 0.6))),
                    ),
                    const SizedBox(width: 8),
                    ThinkingDots(color: scheme.primary),
                  ]),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  /// Жёсткая ошибка (исключение): слово видно, дальше — что случилось и
  /// что делать. Локальных данных тут нет: без разбора нет ни начальной
  /// формы, ни части речи.
  Widget _errorBody(ColorScheme scheme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        Text(widget.request.token.text,
            style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: scheme.onSurface)),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.cloud_off_outlined,
                size: 18, color: scheme.onSurface.withValues(alpha: 0.6)),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Не удалось загрузить перевод',
                  style: TextStyle(
                      fontSize: 14,
                      color: scheme.onSurface.withValues(alpha: 0.8))),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: _retry,
          icon: const Icon(Icons.refresh, size: 18),
          label: const Text('Повторить'),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  /// Перевода нет, но разбор (локальный) есть: показываем его, а вместо
  /// перевода — спокойное «не удалось» с повтором.
  Widget _offlineNotice(ColorScheme scheme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.onSurface.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.wifi_off,
                  size: 16, color: scheme.onSurface.withValues(alpha: 0.55)),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Не удалось загрузить перевод',
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: scheme.onSurface.withValues(alpha: 0.8))),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: _retry,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Повторить'),
            ),
          ),
        ],
      ),
    );
  }

  /// Кнопка сохранения: «В словарь» → «В словаре» с галочкой. Повторное
  /// нажатие отменяет только свою запись; чужую показывает как состояние.
  Widget _saveButton(ColorScheme scheme, WordAnalysis data,
      {required bool asLemma, bool fullWidth = false}) {
    final usable = hasUsableTranslation(data);
    final enabled = !_saving && (_isSaved ? _createdByMe : usable);
    final button = ElevatedButton.icon(
      style: ElevatedButton.styleFrom(
        backgroundColor:
            _isSaved ? scheme.surfaceContainerHighest : scheme.primary,
        foregroundColor: _isSaved ? scheme.onSurface : scheme.onPrimary,
      ),
      icon: Icon(_isSaved ? Icons.check : Icons.bookmark_add, size: 18),
      label: Text(_isSaved ? 'В словаре' : 'В словарь'),
      onPressed: enabled ? () => _onSaveTap(data, asLemma: asLemma) : null,
    );
    final withHint = usable
        ? button
        : Tooltip(
            message: 'Дождись перевода — иначе в словарь попадёт заглушка',
            child: button,
          );
    if (!fullWidth) return withHint;
    return SizedBox(width: double.infinity, child: withHint);
  }

  /// Коротко: сербская читалка, английское слово — бывает и так.
  Widget _englishNotice(ColorScheme scheme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.tertiary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.tertiary.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.translate, size: 16, color: scheme.tertiary),
              const SizedBox(width: 6),
              Text('Это английское слово.',
                  style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.bold,
                      color: scheme.tertiary)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Покажу перевод и разбор.',
            style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: scheme.onSurface.withValues(alpha: 0.8)),
          ),
          const SizedBox(height: 6),
          Text(
            '(А для английского лучше подойдёт знаменитая зелёная сова.)',
            style: TextStyle(
                fontSize: 11.5,
                height: 1.35,
                fontStyle: FontStyle.italic,
                color: scheme.onSurface.withValues(alpha: 0.6)),
          ),
        ],
      ),
    );
  }

  /// Разбор английской формы: часть речи, признаки и «почему так».
  Widget _englishGrammar(ColorScheme scheme, EnglishAnalysis english) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _section('Разбор формы', scheme),
        const SizedBox(height: 6),
        _chips(
          [
            for (final fact in english.facts) '${fact.label}: ${fact.value}',
            if (english.formLabel.isNotEmpty) 'Форма: ${english.formLabel}',
          ],
          scheme,
          scheme.secondary,
        ),
        if (english.why.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(english.why,
              style: TextStyle(
                  fontSize: 12.5,
                  height: 1.4,
                  color: scheme.onSurface.withValues(alpha: 0.75))),
        ],
        // Омоним: «saw» — и прошедшее от «see», и «пила». Молчать об этом
        // нельзя, иначе разбор выглядит уверенной ошибкой.
        if (english.alsoLemma) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 13, color: scheme.tertiary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '«${english.surface}» бывает и самостоятельным словом — '
                  'здесь показан разбор формы.',
                  style: TextStyle(
                      fontSize: 11.5,
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  /// Выбор, что уходит в словарь: словоформа из текста или начальная форма.
  ///
  /// Спрашиваем каждый раз, а не прячем в настройки: выбор зависит от слова.
  /// Неправильный глагол полезнее запомнить формой, а незнакомое
  /// существительное — словарной статьёй.
  Widget _saveChoice(
      BuildContext context, ColorScheme scheme, WordAnalysis data) {
    final label = formLabelOf(data);
    final usable = hasUsableTranslation(data);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _section('Добавить в словарь', scheme),
          const SizedBox(height: 8),
          _saveOption(
            selected: !_saveLemma,
            title: data.surface,
            subtitle: label.isEmpty ? 'форма из текста' : 'форма — $label',
            scheme: scheme,
            onTap: () => setState(() => _saveLemma = false),
          ),
          const SizedBox(height: 6),
          _saveOption(
            selected: _saveLemma,
            title: data.lemma,
            subtitle: 'начальная форма',
            scheme: scheme,
            onTap: () => setState(() => _saveLemma = true),
          ),
          const SizedBox(height: 10),
          _saveButton(scheme, data, asLemma: _saveLemma, fullWidth: true),
          if (!usable && !_isSaved) ...[
            const SizedBox(height: 6),
            Text(
              'Кнопка оживёт, когда загрузится перевод.',
              style: TextStyle(
                  fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _saveOption({
    required bool selected,
    required String title,
    required String subtitle,
    required ColorScheme scheme,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: _isSaved ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              size: 20,
              color: selected
                  ? scheme.primary
                  : scheme.onSurface.withValues(alpha: 0.4),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: title,
                      style: TextStyle(
                        fontSize: 15,
                        fontFamily: 'NotoSerif',
                        fontWeight: FontWeight.bold,
                        color: scheme.onSurface,
                      ),
                    ),
                    TextSpan(
                      text: '  ·  $subtitle',
                      style: TextStyle(
                        fontSize: 12.5,
                        color: scheme.onSurface.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _posColor(String upos, ColorScheme scheme) => switch (upos) {
        'NOUN' => const Color(0xFF2563EB),
        'PROPN' => const Color(0xFF0891B2),
        'VERB' => const Color(0xFFDC2626),
        'AUX' => const Color(0xFFEA580C),
        'ADJ' => const Color(0xFF16A34A),
        'ADV' => const Color(0xFF0D9488),
        'PRON' => const Color(0xFF9333EA),
        'DET' => const Color(0xFFC026D3),
        'ADP' => const Color(0xFFA16207),
        'NUM' => const Color(0xFF4F46E5),
        'PART' => const Color(0xFFDB2777),
        'INTJ' => const Color(0xFFE11D48),
        _ => scheme.onSurface.withValues(alpha: 0.58),
      };

  Color _chunkColor(String kind, ColorScheme scheme) => switch (kind) {
        'prep' => const Color(0xFF2563EB),
        'verb' => const Color(0xFFF59E0B),
        'noun' => const Color(0xFF10B981),
        _ => scheme.onSurface.withValues(alpha: 0.55),
      };

  String _chunkKind(String kind) => switch (kind) {
        'prep' => 'Предлог',
        'verb' => 'Глагол',
        'noun' => 'Согласование',
        _ => 'Связь',
      };

  Widget _sentenceAnalysisCard(ColorScheme scheme, SentenceAnalysis analysis) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.42),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.onSurface.withValues(alpha: 0.12)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.account_tree_outlined,
                  size: 17, color: scheme.secondary),
              const SizedBox(width: 7),
              Text(
                'Грамматический разбор',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.bold,
                  color: scheme.secondary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              for (final token in analysis.tokens)
                _sentenceToken(scheme, token),
            ],
          ),
          if (analysis.chunks.isNotEmpty) ...[
            const SizedBox(height: 14),
            Divider(color: scheme.onSurface.withValues(alpha: 0.12)),
            const SizedBox(height: 5),
            for (final chunk in analysis.chunks)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      margin: const EdgeInsets.only(top: 5),
                      decoration: BoxDecoration(
                        color: _chunkColor(chunk.kind, scheme),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: chunk.text,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: scheme.onSurface,
                                  ),
                                ),
                                TextSpan(
                                  text: '  ${_chunkKind(chunk.kind)}',
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.58),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            chunk.label,
                            style: TextStyle(
                              fontSize: 12.5,
                              height: 1.35,
                              color: scheme.onSurface.withValues(alpha: 0.72),
                            ),
                          ),
                          if (chunk.note.isNotEmpty)
                            Text(
                              chunk.note,
                              style: TextStyle(
                                fontSize: 12,
                                height: 1.35,
                                color: scheme.onSurface.withValues(alpha: 0.62),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ] else ...[
            const SizedBox(height: 12),
            Text(
              'Части речи определены, но устойчивых связей во фразе не найдено.',
              style: TextStyle(
                fontSize: 12,
                color: scheme.onSurface.withValues(alpha: 0.62),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _sentenceToken(ColorScheme scheme, SentenceTokenAnalysis token) {
    final color = _posColor(token.upos, scheme);
    final details = <String>[
      if (token.lemma.isNotEmpty) 'Начальная форма: ${token.lemma}',
      if (token.translation.isNotEmpty) 'Перевод: ${token.translation}',
    ].join('\n');
    return Tooltip(
      message: details,
      child: Container(
        constraints: const BoxConstraints(minWidth: 48, minHeight: 54),
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.36)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              token.posShort.isEmpty ? 'слово' : token.posShort,
              style: TextStyle(
                fontSize: 9.5,
                height: 1.05,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              token.surface,
              style: TextStyle(
                fontFamily: 'NotoSerif',
                fontSize: 16,
                height: 1.05,
                fontWeight: FontWeight.bold,
                color: scheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Грамматика выделенной фразы: составное время (перфекат/футур/потенцијал)
  /// и энклитики с объяснением порядка (закон Ваккернагеля).
  Widget _phraseGrammarCard(ColorScheme scheme, PhraseInsight insight) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.secondary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.secondary.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.account_tree_outlined,
                  size: 16, color: scheme.secondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(insight.title,
                    style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.bold,
                        color: scheme.secondary)),
              ),
            ],
          ),
          if (insight.parts.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...insight.parts.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.label,
                          style: TextStyle(
                              fontSize: 14,
                              fontFamily: 'NotoSerif',
                              fontWeight: FontWeight.bold,
                              color: scheme.primary)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text('— ${p.value}',
                            style: TextStyle(
                                fontSize: 13,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.8))),
                      ),
                    ],
                  ),
                )),
          ],
          const SizedBox(height: 6),
          Text(insight.note,
              style: TextStyle(
                  fontSize: 11.5,
                  height: 1.35,
                  fontStyle: FontStyle.italic,
                  color: scheme.onSurface.withValues(alpha: 0.65))),
        ],
      ),
    );
  }

  /// «Общий» (внеконтекстный) перевод слова + пометка, что значение зависит
  /// от контекста. Показывается под основным (контекстным) переводом.
  Widget _generalTranslationCard(ColorScheme scheme, String general) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.onSurface.withValues(alpha: 0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.public,
                  size: 14, color: scheme.onSurface.withValues(alpha: 0.5)),
              const SizedBox(width: 6),
              Text('В общем (вне контекста)',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: scheme.onSurface.withValues(alpha: 0.55))),
            ],
          ),
          const SizedBox(height: 3),
          Text(general,
              style: TextStyle(
                  fontSize: 15,
                  color: scheme.onSurface.withValues(alpha: 0.85))),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 13, color: scheme.tertiary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Точное значение зависит от контекста — выше перевод именно '
                  'для этого предложения.',
                  style: TextStyle(
                      fontSize: 11.5,
                      fontStyle: FontStyle.italic,
                      color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            ],
          ),
        ],
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
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
