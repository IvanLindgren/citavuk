import 'package:flutter/material.dart';

import '../models/reader_settings.dart';
import '../models/word_analysis.dart';
import '../services/analysis_repository.dart';
import '../utils/tokenizer.dart';
import 'reader_text.dart';

/// Сербский текст, в котором каждое слово разбирается по нажатию.
///
/// Тот же разбор, что в читалке: перевод в этом предложении, начальная форма,
/// часть речи. Раньше это был метод экрана урока — теперь им пользуются и урок,
/// и упражнения дорожной карты, и держать две копии незачем.
class ClickableSerbianText extends StatelessWidget {
  const ClickableSerbianText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ReaderParagraph(
      text: text,
      settings: const ReaderSettings(
          fontSize: 17, lineHeight: 1.55, firstLineIndent: 0, justify: false),
      textColor: scheme.onSurface,
      highlightColor: scheme.primaryContainer,
      highlightTextColor: scheme.onPrimaryContainer,
      justify: false,
      firstLineIndent: 0,
      onTapWord: (_, token, __) => _showAnalysis(context, text, token),
    );
  }

  Future<void> _showAnalysis(
      BuildContext context, String sentence, Token token) async {
    final future = AnalysisRepository.instance.analyzeToken(
        sentence: sentence,
        startOffset: token.start,
        endOffset: token.end,
        tokenText: token.text);
    if (!context.mounted) return;
    await showModalBottomSheet(
        context: context,
        showDragHandle: true,
        builder: (context) => Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
            child: FutureBuilder<WordAnalysis>(
                future: future,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const SizedBox(
                        height: 160,
                        child: Center(child: CircularProgressIndicator()));
                  }
                  if (snapshot.hasError) {
                    return const SizedBox(
                        height: 140,
                        child:
                            Center(child: Text('Не удалось разобрать слово.')));
                  }
                  final word = snapshot.data!;
                  return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(word.surface,
                            style: Theme.of(context).textTheme.headlineSmall),
                        const SizedBox(height: 8),
                        Text(
                            word.contextualTranslation?.isNotEmpty == true
                                ? word.contextualTranslation!
                                : word.translation,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text('Начальная форма: ${word.lemma}'),
                        if (word.upos.isNotEmpty)
                          Text('Часть речи: ${word.upos}')
                      ]);
                })));
  }

  /// Прогон слов темы: перевод виден, слово набирается по памяти.
  ///
  /// Не выбор из вариантов: узнать слово среди четырёх и вспомнить его —
  /// разные умения, а словарь дорожной карты проверяет второе.
}
