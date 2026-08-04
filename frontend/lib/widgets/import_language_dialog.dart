import 'package:flutter/material.dart';

import '../services/document_translation_service.dart';
import 'wolf_mascot.dart';

/// Что делать с документом не на сербском.
///
/// Вопрос задаётся ровно один раз и только когда он уместен: сербская книга
/// открывается сразу, без единого лишнего нажатия. Раньше здесь было
/// предупреждение «похоже, это не сербский» с единственной кнопкой «понятно» —
/// оно сообщало о проблеме и не предлагало ничего сделать.
enum ImportChoice { original, translate }

Future<ImportChoice?> showImportLanguageDialog(
  BuildContext context, {
  required String title,
  required bool signedIn,
  required Future<TranslationQuota?> Function() loadQuota,
}) {
  return showDialog<ImportChoice>(
    context: context,
    builder: (ctx) => _ImportLanguageDialog(
      title: title,
      signedIn: signedIn,
      loadQuota: loadQuota,
    ),
  );
}

class _ImportLanguageDialog extends StatefulWidget {
  const _ImportLanguageDialog({
    required this.title,
    required this.signedIn,
    required this.loadQuota,
  });

  final String title;
  final bool signedIn;
  final Future<TranslationQuota?> Function() loadQuota;

  @override
  State<_ImportLanguageDialog> createState() => _ImportLanguageDialogState();
}

class _ImportLanguageDialogState extends State<_ImportLanguageDialog> {
  TranslationQuota? _quota;
  bool _loading = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    // Предел спрашивается у сервера, а не подразумевается: человек мог
    // перевести книгу час назад в браузере, и предлагать ему кнопку, которая
    // ответит отказом, — впустую потраченное ожидание.
    if (widget.signedIn) {
      _loading = true;
      widget.loadQuota().then((quota) {
        if (!mounted) return;
        setState(() {
          _quota = quota;
          _failed = quota == null;
          _loading = false;
        });
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final canTranslate = widget.signedIn && (_quota?.available ?? false);

    return AlertDialog(
      title: const Text('Документ не на сербском'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Image.asset(Wolf.gram, height: 110),
            ),
            const SizedBox(height: 12),
            Text(
              '«${widget.title}» написан не по-сербски. Читавук разбирает '
              'сербские слова, и на этом тексте разбор будет бесполезен. '
              'Можно перевести документ на сербский — или оставить как есть, '
              'если он нужен именно таким.',
            ),
            const SizedBox(height: 12),
            Text(
              _reason(),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Не добавлять'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, ImportChoice.original),
          child: const Text('Оставить как есть'),
        ),
        FilledButton(
          onPressed: canTranslate
              ? () => Navigator.pop(context, ImportChoice.translate)
              : null,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Перевести на сербский'),
        ),
      ],
    );
  }

  /// Почему кнопка перевода недоступна.
  ///
  /// Отключённая кнопка без объяснения — худший вид интерфейса: человек не
  /// знает, это поломка, или он чего-то не сделал, или так и задумано.
  String _reason() {
    if (!widget.signedIn) {
      return 'Перевод доступен с аккаунтом: он расходует общую квоту '
          'переводчика, и без входа её не на кого записать.';
    }
    if (_loading) return '';
    if (_failed) {
      return 'Не удалось связаться с сервером. Документ можно добавить как '
          'есть и перевести позже.';
    }
    final quota = _quota;
    if (quota == null) return '';
    if (quota.available) {
      final perDay = quota.perDay == 1
          ? 'один документ'
          : '${quota.perDay} документа';
      return 'Перевести можно $perDay в сутки — перевод книги целиком '
          'расходует квоту сразу за многих.';
    }
    return 'Суточный предел уже израсходован. '
        'Следующий перевод — ${quota.waitLabel}.';
  }
}

/// Полоса хода перевода: книга переводится минуты, и молчать всё это время
/// нельзя — без неё приложение выглядит зависшим.
class TranslationProgressDialog extends StatelessWidget {
  const TranslationProgressDialog({
    super.key,
    required this.ratio,
    required this.note,
  });

  final double ratio;
  final String note;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Переводим на сербский'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(Wolf.ukaz, height: 90),
          const SizedBox(height: 16),
          LinearProgressIndicator(value: ratio),
          const SizedBox(height: 8),
          Text('${(ratio * 100).round()}%'),
          if (note.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(note, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}
