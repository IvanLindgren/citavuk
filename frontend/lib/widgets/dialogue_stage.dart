import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';

import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../services/grammar_engine.dart';
import '../services/listening_service.dart';
import '../services/user_db.dart';
import '../utils/tokenizer.dart';
import 'reader_text.dart';

/// Обстановка диалога: портреты, реплики облачками, озвучка, полоса ответов.
///
/// Заведено общим, потому что диалогов в Читавуке два вида и выглядели они
/// по-разному. «Дорога к Дринкиту» — переписка с портретами, озвучкой и историей
/// разговора; диалог внутри урока преподавателя — одна карточка с текущей
/// репликой и парой кнопок под ней. Разница не задумывалась: просто второй
/// писали позже и проще. Читателю доставался разговор, в котором не видно, что
/// уже сказано, некого слушать и не на кого смотреть.
///
/// Тот же набор частей, что у сайта в `web/src/components/DialogueStage.tsx`:
/// разговор в браузере и в телефоне должен идти одинаково.
enum DialogueFace {
  citavuk('assets/imgs/citavuk_icon.png', 'Читавук'),
  marja('assets/imgs/marja_spilberic.png', 'Марья Спилберич'),
  teacher('assets/imgs/face_teacher.png', 'Преподаватель'),
  student('assets/imgs/face_student.png', 'Ученик'),
  woman('assets/imgs/face_woman.png', 'Собеседница'),
  man('assets/imgs/face_man.png', 'Собеседник'),
  /// У рассказчика лица нет: его реплика — обстановка, а не разговор.
  narrator('', 'Рассказчик');

  const DialogueFace(this.asset, this.label);

  final String asset;
  final String label;

  /// Персонаж по полю `avatar` из диалога урока.
  ///
  /// У уроков, написанных до появления выбора персонажа, поля нет. Лицо тогда
  /// берётся по имени говорящего — не «какое-нибудь», а устойчиво одно и то же:
  /// два собеседника в таком диалоге получат разные лица и не станут на вид
  /// одним человеком.
  static DialogueFace fromAvatar(String? avatar, String speaker) {
    switch (avatar) {
      case 'teacher':
        return DialogueFace.teacher;
      case 'student':
        return DialogueFace.student;
      case 'woman':
        return DialogueFace.woman;
      case 'man':
        return DialogueFace.man;
    }
    const known = [
      DialogueFace.teacher,
      DialogueFace.student,
      DialogueFace.woman,
      DialogueFace.man,
    ];
    var sum = 0;
    for (final code in speaker.codeUnits) {
      sum += code;
    }
    return known[sum % known.length];
  }
}

/// Реплика в истории разговора.
class DialogueLine {
  const DialogueLine({
    required this.key,
    required this.speaker,
    required this.text,
    required this.face,
    this.own = false,
  });

  /// Ключ реплики: по нему же отмечается, что сейчас звучит. Не текст — одна и
  /// та же фраза встречается в диалоге дважды, и подсветилось бы два облачка.
  final String key;
  final String speaker;
  final String text;
  final DialogueFace face;

  /// Реплика читателя — она встаёт справа.
  final bool own;
}

/// Озвучка реплик подряд: сначала слышно свой ответ, потом ответ собеседника.
class DialogueSpeech {
  DialogueSpeech(this._player);

  final AudioPlayer _player;
  int _run = 0;
  String? _speakingKey;

  String? get speakingKey => _speakingKey;

  void dispose() => _run++;

  Future<void> stop(VoidCallback onChanged) async {
    _run++;
    await _player.stop();
    _speakingKey = null;
    onChanged();
  }

  Future<void> toggle(DialogueLine line, VoidCallback onChanged) async {
    if (_speakingKey == line.key) {
      await stop(onChanged);
      return;
    }
    await speak([line], onChanged);
  }

  Future<void> speak(List<DialogueLine> lines, VoidCallback onChanged) async {
    final run = ++_run;
    await _player.stop();
    for (final line in lines) {
      if (run != _run) return;
      _speakingKey = line.key;
      onChanged();
      try {
        final completed = _player.onPlayerComplete.first;
        await _player
            .play(UrlSource(ListeningService.instance.ttsUrl(line.text)));
        await completed.timeout(const Duration(minutes: 2));
      } catch (_) {
        // Недоступная озвучка не должна блокировать сам диалог.
      }
    }
    if (run == _run) {
      _speakingKey = null;
      onChanged();
    }
  }
}

class DialogueAvatar extends StatelessWidget {
  const DialogueAvatar({super.key, required this.face, this.size = 54});

  final DialogueFace face;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (face.asset.isEmpty) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.28),
      child: Image.asset(
        face.asset,
        width: size,
        height: size,
        fit: BoxFit.cover,
        alignment: Alignment.topCenter,
      ),
    );
  }
}

class DialogueBubble extends StatelessWidget {
  const DialogueBubble({
    super.key,
    required this.line,
    required this.speaking,
    required this.onSpeak,
    required this.onWordTap,
  });

  final DialogueLine line;
  final bool speaking;
  final VoidCallback onSpeak;
  final void Function(Token token) onWordTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (line.face == DialogueFace.narrator) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 20),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          children: [
            DialogueSpeakerLine(
              label: line.face.label,
              speaking: speaking,
              onSpeak: onSpeak,
            ),
            const SizedBox(height: 8),
            DialogueReplica(text: line.text, onWordTap: onWordTap),
          ],
        ),
      );
    }

    final own = line.own;
    final avatar = DialogueAvatar(face: line.face);
    final bubble = Flexible(
      child: Container(
        padding: const EdgeInsets.fromLTRB(15, 11, 15, 14),
        decoration: BoxDecoration(
          color: own
              ? scheme.primaryContainer.withValues(alpha: 0.42)
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(18),
            topRight: const Radius.circular(18),
            bottomLeft: Radius.circular(own ? 18 : 5),
            bottomRight: Radius.circular(own ? 5 : 18),
          ),
          border: Border.all(
            color: own
                ? scheme.primary.withValues(alpha: 0.3)
                : scheme.outlineVariant,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DialogueSpeakerLine(
              label: line.speaker,
              speaking: speaking,
              onSpeak: onSpeak,
            ),
            const SizedBox(height: 7),
            DialogueReplica(text: line.text, onWordTap: onWordTap),
          ],
        ),
      ),
    );

    return Row(
      mainAxisAlignment: own ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: own
          ? [bubble, const SizedBox(width: 9), avatar]
          : [avatar, const SizedBox(width: 9), bubble],
    );
  }
}

class DialogueSpeakerLine extends StatelessWidget {
  const DialogueSpeakerLine({
    super.key,
    required this.label,
    required this.speaking,
    required this.onSpeak,
  });

  final String label;
  final bool speaking;
  final VoidCallback onSpeak;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            label.toUpperCase(),
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: scheme.primary,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 4),
        IconButton(
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 34, height: 34),
          tooltip: speaking ? 'Остановить' : 'Прослушать',
          onPressed: onSpeak,
          icon: Icon(speaking ? Icons.stop_rounded : Icons.volume_up_rounded),
          color: scheme.primary,
          iconSize: 21,
        ),
      ],
    );
  }
}

class DialogueReplica extends StatelessWidget {
  const DialogueReplica({
    super.key,
    required this.text,
    required this.onWordTap,
  });

  final String text;
  final void Function(Token token) onWordTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ReaderParagraph(
      text: text,
      settings: const ReaderSettings(
        fontSize: 18,
        lineHeight: 1.45,
        letterSpacing: 0,
        justify: false,
        firstLineIndent: 0,
      ),
      textColor: scheme.onSurface,
      highlightColor: scheme.primaryContainer,
      highlightTextColor: scheme.onPrimaryContainer,
      justify: false,
      firstLineIndent: 0,
      onTapWord: (_, token, __) => onWordTap(token),
    );
  }
}

/// Сцена над разговором: обложка урока и лица участников.
///
/// Обложка у уроков есть с самого начала и показывалась только над теорией.
/// Диалог начинался с пустого места, хотя в данных лежала фотография ровно того,
/// о чём разговор.
class DialogueScene extends StatelessWidget {
  const DialogueScene({
    super.key,
    this.coverUrl,
    required this.participants,
  });

  final String? coverUrl;
  final List<({DialogueFace face, String name})> participants;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final faces =
        participants.where((item) => item.face.asset.isNotEmpty).toList();
    final cover = coverUrl;

    final names = Wrap(
      spacing: 12,
      runSpacing: 8,
      children: [
        for (final item in faces)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DialogueAvatar(face: item.face, size: 44),
              const SizedBox(width: 7),
              Text(
                item.name,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: cover == null ? scheme.onSurface : Colors.white,
                  shadows: cover == null
                      ? null
                      : const [Shadow(blurRadius: 4, color: Colors.black87)],
                ),
              ),
            ],
          ),
      ],
    );

    if (cover == null) {
      if (faces.isEmpty) return const SizedBox.shrink();
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: names,
      );
    }

    // Высота задана, а не выведена из пропорции: на планшете 16/7 давали
    // фотографию в пол-экрана, и первая реплика уходила за край.
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: 150,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.network(
              cover,
              fit: BoxFit.cover,
              // Обложка — украшение: не загрузилась, значит её просто нет.
              errorBuilder: (_, __, ___) =>
                  ColoredBox(color: scheme.surfaceContainerLow),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Color(0xC7140E08), Color(0x00140E08)],
                ),
              ),
              child: SizedBox.expand(),
            ),
            Positioned(left: 12, right: 12, bottom: 10, child: names),
          ],
        ),
      ),
    );
  }
}

/// Полоса ответов внизу экрана.
class DialogueChoiceBar extends StatelessWidget {
  const DialogueChoiceBar({
    super.key,
    required this.labels,
    required this.onChoose,
    this.title = 'ВЫБЕРИТЕ ОТВЕТ',
    this.enabled = true,
    this.footer,
  });

  final List<String> labels;
  final void Function(int index) onChoose;
  final String title;
  final bool enabled;

  /// Что показать вместо ответов, когда разговор окончен.
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surface.withValues(alpha: 0.97),
      elevation: 16,
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.42,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 740),
                child: footer ??
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            color: scheme.onSurface.withValues(alpha: 0.6),
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 8),
                        for (var i = 0; i < labels.length; i++) ...[
                          DialogueChoiceButton(
                            index: i,
                            label: labels[i],
                            enabled: enabled,
                            onPressed: () => onChoose(i),
                          ),
                          if (i + 1 < labels.length) const SizedBox(height: 8),
                        ],
                      ],
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DialogueChoiceButton extends StatelessWidget {
  const DialogueChoiceButton({
    super.key,
    required this.index,
    required this.label,
    required this.enabled,
    required this.onPressed,
  });

  final int index;
  final String label;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(15),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(15),
        child: Container(
          constraints: const BoxConstraints(minHeight: 54),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(15),
            border: Border.all(color: scheme.primary.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: scheme.primary,
                foregroundColor: scheme.onPrimary,
                child: Text('${index + 1}'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Разбор слова из реплики: перевод в этом контексте, начальная форма, словарь.
class DialogueWordSheet extends StatefulWidget {
  const DialogueWordSheet({
    super.key,
    required this.sentence,
    required this.token,
    this.bookTitle = 'Игровые диалоги',
  });

  final String sentence;
  final Token token;

  /// Куда складывать взятые слова. Название одно на все диалоги: собранное из
  /// разговоров лежит в одном месте, а не растекается по книгам.
  final String bookTitle;

  @override
  State<DialogueWordSheet> createState() => _DialogueWordSheetState();
}

class _DialogueWordSheetState extends State<DialogueWordSheet> {
  late final Future<WordAnalysis> _analysis;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _analysis = AnalysisRepository.instance.analyzeToken(
      sentence: widget.sentence,
      startOffset: widget.token.start,
      endOffset: widget.token.end,
      tokenText: widget.token.text,
    );
  }

  Future<void> _save(WordAnalysis data) async {
    final bookId = await UserDb.instance.ensureBook(widget.bookTitle);
    final contextual = data.contextualTranslation?.trim();
    var translation = data.translation.trim();
    if (contextual != null &&
        contextual.isNotEmpty &&
        contextual.toLowerCase() != translation.toLowerCase()) {
      translation = 'В диалоге: $contextual\nВ общем: $translation';
    }
    await UserDb.instance.addVocabulary(
      bookId: bookId,
      word: data.surface,
      lemma: data.lemma,
      pos: data.upos,
      translation: translation,
      forms: data.forms,
    );
    if (mounted) setState(() => _saved = true);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        MediaQuery.paddingOf(context).bottom + 22,
      ),
      child: FutureBuilder<WordAnalysis>(
        future: _analysis,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 250,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (!snapshot.hasData) {
            return SizedBox(
              height: 220,
              child: Center(
                child: Text(
                  'Не удалось перевести слово',
                  style: TextStyle(color: scheme.error),
                ),
              ),
            );
          }
          final data = snapshot.data!;
          final contextual = data.contextualTranslation?.trim();
          final general = data.translation.trim();
          final hasContext = contextual != null &&
              contextual.isNotEmpty &&
              contextual.toLowerCase() != general.toLowerCase();
          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: scheme.outlineVariant,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            data.surface,
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${GrammarEngine.posShort(data.upos)} · ${data.lemma}',
                            style: TextStyle(
                              color: scheme.onSurface.withValues(alpha: 0.62),
                            ),
                          ),
                        ],
                      ),
                    ),
                    FilledButton.icon(
                      onPressed: _saved ? null : () => _save(data),
                      icon: Icon(_saved ? Icons.check : Icons.bookmark_add),
                      label: Text(_saved ? 'В словаре' : 'В словарь'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  hasContext ? 'В ЭТОЙ РЕПЛИКЕ' : 'ПЕРЕВОД',
                  style: TextStyle(
                    color: scheme.primary,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  hasContext ? contextual : general,
                  style: const TextStyle(fontSize: 22, height: 1.35),
                ),
                if (hasContext) ...[
                  const SizedBox(height: 16),
                  Text(
                    'В ОБЩЕМ',
                    style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.55),
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(general, style: const TextStyle(fontSize: 18)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
