import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/grammar_engine.dart';
import '../services/user_db.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/wolf_mascot.dart';

class FlashcardsScreen extends StatefulWidget {
  final int bookId;
  final String bookTitle;

  const FlashcardsScreen({
    super.key,
    required this.bookId,
    required this.bookTitle,
  });

  @override
  State<FlashcardsScreen> createState() => _FlashcardsScreenState();
}

class _FlashcardsScreenState extends State<FlashcardsScreen> {
  List<Map<String, dynamic>> _queue = [];
  bool _loading = true;
  bool _revealed = false;
  int _reviewed = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cards = await UserDb.instance.getDueCards(widget.bookId);
    setState(() {
      _queue = List<Map<String, dynamic>>.from(cards);
      _loading = false;
    });
  }

  Future<void> _grade(int grade) async {
    if (_queue.isEmpty) return;
    final card = _queue.removeAt(0);
    await UserDb.instance.gradeCard(card['id'] as int, grade);
    setState(() {
      if (grade <= 0) _queue.add(card); // «Снова» — вернуть в конец
      _reviewed++;
      _revealed = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Карточки'),
        actions: [
          if (!_loading && _queue.isNotEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Text('осталось: ${_queue.length}',
                    style: const TextStyle(fontSize: 14)),
              ),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _queue.isEmpty
              ? _buildDone(scheme)
              : _buildCard(scheme, _queue.first),
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

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Expanded(
              child: PressableScale(
                onTap: () => setState(() => _revealed = true),
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
                                    color: scheme.onSurface.withValues(alpha: 0.5))),
                          ] else ...[
                            const SizedBox(height: 16),
                            Divider(color: scheme.primary.withValues(alpha: 0.3)),
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
                                if (pos.isNotEmpty) GrammarEngine.posShort(pos),
                                if (lemma.isNotEmpty) 'нач. форма: $lemma',
                              ].join('  ·  '),
                              style: TextStyle(
                                  fontSize: 13,
                                  color: scheme.onSurface.withValues(alpha: 0.6)),
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
                                              style: const TextStyle(fontSize: 12)),
                                          backgroundColor:
                                              scheme.surfaceContainerHighest,
                                        ))
                                    .toList(),
                              ),
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
                child: ElevatedButton(
                  onPressed: () => setState(() => _revealed = true),
                  child: const Text('Показать перевод'),
                ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: _gradeButton('Снова', Colors.redAccent, () => _grade(0)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _gradeButton('Хорошо', scheme.secondary, () => _grade(1)),
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
