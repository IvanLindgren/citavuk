import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/word_analysis.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/translation_client.dart' show utf8ByteOffset;

/// Насколько можно верить переводу слова. Молчим, когда всё обычно:
/// предупреждать стоит о слабом переводе, а не хвалить нормальный.
class TranslationConfidence extends StatelessWidget {
  const TranslationConfidence({super.key, required this.data});

  final WordAnalysis data;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final info = data.contextInfo;
    Widget line(IconData? icon, String text, Color color) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
            ],
            Expanded(
              child: Text(text,
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: color)),
            ),
          ]),
        );
    if (info?.verified ?? false) {
      return line(Icons.verified_outlined, 'Перевод проверен человеком',
          const Color(0xFF2F7D4F));
    }
    // Слова нет в словаре — перевод догадка переводчика: так «polulopta»
    // однажды стала «тяжестью».
    if (!data.inDictionary) {
      return line(Icons.help_outline,
          'Этого слова нет в словаре — перевод может быть неточным',
          const Color(0xFFA2611A));
    }
    if (info?.provider == 'google') {
      return line(null, 'Перевод примерный', scheme.onSurfaceVariant);
    }
    return const SizedBox.shrink();
  }
}

/// «Неверный перевод?» — открывает короткую форму исправления.
class TranslationFeedbackLink extends StatelessWidget {
  const TranslationFeedbackLink(
      {super.key, required this.info, required this.shown});

  final ContextTranslationInfo info;
  final String shown;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          visualDensity: VisualDensity.compact,
        ),
        onPressed: () => _open(context),
        child: const Text('Неверный перевод?'),
      ),
    );
  }

  void _open(BuildContext context) {
    final messenger = ScaffoldMessenger.of(context);
    if (context.read<AuthService>().account == null) {
      messenger.showSnackBar(const SnackBar(
          content: Text('Войди в аккаунт, чтобы предложить исправление.')));
      return;
    }
    final api = context.read<ApiClient>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FeedbackForm(info: info, shown: shown, api: api),
    );
  }
}

class _FeedbackForm extends StatefulWidget {
  const _FeedbackForm(
      {required this.info, required this.shown, required this.api});

  final ContextTranslationInfo info;
  final String shown;
  final ApiClient api;

  @override
  State<_FeedbackForm> createState() => _FeedbackFormState();
}

class _FeedbackFormState extends State<_FeedbackForm> {
  final _suggestion = TextEditingController();
  final _comment = TextEditingController();
  String _scope = 'sentence';
  bool _sending = false;
  String? _error;

  String get _word =>
      widget.info.sentence.substring(widget.info.start, widget.info.end);

  @override
  void dispose() {
    _suggestion.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final suggestion = _suggestion.text.trim();
    final comment = _comment.text.trim();
    if (suggestion.isEmpty && comment.isEmpty) {
      setState(() => _error = 'Напиши, как правильно, или что не так с переводом.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final info = widget.info;
    try {
      final response = await widget.api.post('/v1/translation-feedback', {
        'sentence': info.sentence,
        // Сервер считает в байтах UTF-8, строка Dart — в UTF-16.
        'start': utf8ByteOffset(info.sentence, info.start),
        'end': utf8ByteOffset(info.sentence, info.end),
        'shown': widget.shown,
        'provider': info.provider,
        'suggestion': suggestion,
        'comment': comment,
        'scope': _scope,
      });
      if (!mounted) return;
      final applied = response is Map && response['applied'] == true;
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(SnackBar(
          content: Text(applied
              ? 'Готово: теперь все увидят твой перевод.'
              : 'Спасибо! Посмотрю и исправлю, если ты прав.')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось отправить. Попробуй ещё раз.');
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Неверный перевод', style: theme.textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('Показали: ${widget.shown}',
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 16),
            TextField(
              controller: _suggestion,
              autofocus: true,
              maxLength: 200,
              decoration: InputDecoration(
                labelText: 'Как правильно перевести «$_word»',
                border: const OutlineInputBorder(),
              ),
            ),
            RadioGroup<String>(
              groupValue: _scope,
              onChanged: (v) => setState(() => _scope = v ?? _scope),
              child: Column(children: [
                const RadioListTile<String>(
                  value: 'sentence',
                  contentPadding: EdgeInsets.zero,
                  title: Text('Только в этом предложении'),
                ),
                RadioListTile<String>(
                  value: 'form',
                  contentPadding: EdgeInsets.zero,
                  title: Text('Слово «$_word» везде'),
                ),
              ]),
            ),
            TextField(
              controller: _comment,
              maxLength: 1000,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Комментарий, если хочешь',
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _sending ? null : _send,
              child: Text(_sending ? 'Отправляю…' : 'Отправить'),
            ),
          ],
        ),
      ),
    );
  }
}
