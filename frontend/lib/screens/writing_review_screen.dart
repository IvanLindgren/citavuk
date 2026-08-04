import 'package:flutter/material.dart';

import '../services/user_db.dart';
import '../utils/writing.dart';
import '../widgets/handwriting_pad.dart';
import '../widgets/wolf_mascot.dart';

/// Повторение слов письмом от руки.
///
/// Направление обратное обычной карточке: показывается перевод, а вспомнить
/// надо сербское слово — и не узнать среди вариантов, а написать. В этом весь
/// смысл упражнения: узнавание даётся куда легче воспроизведения, и слово,
/// которое «вроде знаешь», на письме часто не вспоминается вовсе.
///
/// Расписание общее с обычными карточками (`UserDb.gradeCard`): это те же
/// карточки, показанные иначе, и заводить им отдельные сроки значило бы
/// показывать одно слово дважды в день.
class WritingReviewScreen extends StatefulWidget {
  const WritingReviewScreen({
    super.key,
    required this.bookId,
    required this.bookTitle,
  });

  final int bookId;
  final String bookTitle;

  @override
  State<WritingReviewScreen> createState() => _WritingReviewScreenState();
}

class _WritingReviewScreenState extends State<WritingReviewScreen> {
  final _pad = HandwritingController();

  List<Map<String, dynamic>> _queue = [];
  int _skipped = 0;
  bool _loading = true;
  bool _revealed = false;

  /// Сколько букв уже написано и открыто в побуквенном режиме.
  int _letter = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pad.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final cards = await UserDb.instance.getDueCards(widget.bookId);
    final words = cards
        .where((card) => writable((card['word'] ?? '') as String))
        .toList();
    if (!mounted) return;
    setState(() {
      _queue = List<Map<String, dynamic>>.from(words);
      _skipped = cards.length - words.length;
      _loading = false;
    });
  }

  void _reset() {
    _pad.clear();
    setState(() {
      _revealed = false;
      _letter = 0;
    });
  }

  Future<void> _grade(int grade) async {
    if (_queue.isEmpty) return;
    final card = _queue.removeAt(0);
    await UserDb.instance.gradeCard(card['id'] as int, grade);
    if (grade <= 0) _queue.add(card); // «Снова» — вернуть в конец очереди.
    _reset();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Письмом'),
        actions: [
          if (!_loading && _queue.isNotEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Text('осталось: ${_queue.length}',
                    style: const TextStyle(fontSize: 14)),
              ),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _queue.isEmpty
              ? _done(scheme)
              : _card(scheme, _queue.first),
    );
  }

  Widget _done(ColorScheme scheme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.povtor, size: 140),
            const SizedBox(height: 20),
            Text('Писать пока нечего',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 10),
            Text(
              _skipped > 0
                  ? 'К повторению остались только фразы, а письмом повторяются '
                      'отдельные слова.'
                  : 'Все слова повторены. Новые появятся, когда подойдёт срок.',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(ColorScheme scheme, Map<String, dynamic> card) {
    final word = (card['word'] ?? '') as String;
    final translation = (card['translation'] ?? '—') as String;
    final letters = wordLetters(word);
    final byLetter = writeLetterByLetter;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            byLetter
                ? 'Напишите по-сербски букву за буквой'
                : 'Напишите это слово по-сербски',
            textAlign: TextAlign.center,
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 6),
          Text(
            translation,
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 18),

          if (byLetter) _letterProgress(scheme, letters),

          HandwritingPad(controller: _pad),
          const SizedBox(height: 10),

          Row(
            children: [
              TextButton.icon(
                onPressed: _pad.undo,
                icon: const Icon(Icons.undo, size: 18),
                label: const Text('Штрих'),
              ),
              TextButton.icon(
                onPressed: _pad.clear,
                icon: const Icon(Icons.delete_outline, size: 18),
                label: const Text('Стереть'),
              ),
              const Spacer(),
              if (byLetter && _letter < letters.length)
                FilledButton.tonal(
                  onPressed: () {
                    // Каждая буква пишется на чистом холсте: иначе следующая
                    // накладывается на предыдущую и обе не разобрать.
                    _pad.clear();
                    setState(() => _letter++);
                  },
                  child: Text(_letter == letters.length - 1
                      ? 'Последняя буква'
                      : 'Следующая буква'),
                )
              else if (!_revealed)
                FilledButton.tonal(
                  onPressed: () => setState(() => _revealed = true),
                  child: const Text('Показать ответ'),
                ),
            ],
          ),

          if (_revealed || (byLetter && _letter >= letters.length)) ...[
            const SizedBox(height: 20),
            const Divider(),
            const SizedBox(height: 12),
            Text(
              word,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: scheme.primary,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              'Сравните с написанным выше',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _grade(0),
                    child: const Text('Не вспомнил'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _grade(1),
                    child: const Text('Верно'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton(
                    onPressed: () => _grade(2),
                    child: const Text('Легко'),
                  ),
                ),
              ],
            ),
          ],

          if (_skipped > 0) ...[
            const SizedBox(height: 20),
            Text(
              'Фраз пропущено: $_skipped — их письмом не повторяем.',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  /// Показывает, какая буква пишется сейчас и какие уже открыты.
  ///
  /// Открытые буквы видно, а неоткрытые — нет: иначе упражнение превратилось бы
  /// в срисовывание.
  Widget _letterProgress(ColorScheme scheme, List<String> letters) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 6,
        runSpacing: 6,
        children: [
          for (var i = 0; i < letters.length; i++)
            Container(
              width: 34,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: i == _letter
                    ? scheme.primaryContainer
                    : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: i == _letter ? scheme.primary : scheme.outlineVariant,
                  width: i == _letter ? 2 : 1,
                ),
              ),
              child: Text(
                i < _letter ? letters[i] : '',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: scheme.onSurface,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
