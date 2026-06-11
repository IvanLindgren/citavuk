import 'package:flutter/material.dart';
import '../models/grammar.dart';
import '../services/grammar_engine.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/serbian_ornament.dart';
import '../widgets/wolf_mascot.dart';

/// Грамматический раздел: список тем. В каждой теме — подробное объяснение
/// правила по шагам и карточки для запоминания.
class GrammarCardsScreen extends StatelessWidget {
  const GrammarCardsScreen({super.key});

  IconData _icon(String id) => switch (id) {
        'cases' => Icons.category_outlined,
        'prezent' => Icons.wb_sunny_outlined,
        'perfekat' => Icons.history,
        'futur1' => Icons.update,
        'aorist' => Icons.menu_book_outlined,
        'imperfekat' => Icons.auto_stories_outlined,
        'pluskvamperfekat' => Icons.hourglass_bottom,
        'futur2' => Icons.event_outlined,
        _ => Icons.school_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final topics = GrammarEngine.grammarTopics();

    return Scaffold(
      appBar: AppBar(title: const Text('Грамматика')),
      body: Column(
        children: [
          const OrnamentDivider(height: 22),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                const WolfBubble(
                  asset: Wolf.rule,
                  title: 'Учим правила',
                  text:
                      'Выбери тему: внутри — подробное правило по шагам и карточки для запоминания.',
                ),
                const SizedBox(height: 12),
                for (final (i, t) in topics.indexed)
                  FadeSlideIn(
                    delay: Duration(milliseconds: 30 * i.clamp(0, 10)),
                    child: Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        leading: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [scheme.primary, scheme.secondary],
                            ),
                          ),
                          child:
                              Icon(_icon(t.id), color: Colors.white, size: 24),
                        ),
                        title: Text(t.title,
                            style:
                                const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(t.subtitle,
                            style: TextStyle(
                                fontSize: 12.5,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.65))),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => GrammarTopicScreen(topic: t)),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Одна тема: вводное объяснение, правило по шагам, карточки для запоминания.
class GrammarTopicScreen extends StatelessWidget {
  final GrammarTopic topic;
  const GrammarTopicScreen({super.key, required this.topic});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(topic.title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          const OrnamentDivider(height: 22),
          WolfBubble(
            asset: Wolf.rule,
            title: topic.title,
            text: topic.intro,
          ),
          const SizedBox(height: 14),
          for (final (i, s) in topic.sections.indexed)
            FadeSlideIn(
              delay: Duration(milliseconds: 40 * i.clamp(0, 8)),
              child: Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 26,
                            height: 26,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: scheme.primary,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text('${i + 1}',
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(s.title,
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15.5,
                                    color: scheme.primary)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(s.body,
                          style: const TextStyle(fontSize: 14.5, height: 1.45)),
                    ],
                  ),
                ),
              ),
            ),
          if (topic.cards.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.style_outlined, size: 18, color: scheme.secondary),
                const SizedBox(width: 6),
                Text('Карточки для запоминания',
                    style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: scheme.secondary)),
              ],
            ),
            const SizedBox(height: 8),
            RuleFlipCards(cards: topic.cards),
          ],
        ],
      ),
    );
  }
}

/// Колода карточек-перевёртышей (вопрос → объяснение) со стрелками навигации.
class RuleFlipCards extends StatefulWidget {
  final List<RuleCard> cards;
  const RuleFlipCards({super.key, required this.cards});

  @override
  State<RuleFlipCards> createState() => _RuleFlipCardsState();
}

class _RuleFlipCardsState extends State<RuleFlipCards> {
  int _i = 0;
  bool _flipped = false;

  void _go(int delta) {
    setState(() {
      _i = (_i + delta).clamp(0, widget.cards.length - 1);
      _flipped = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final card = widget.cards[_i];

    return Column(
      children: [
        SizedBox(
          height: 300,
          child: GestureDetector(
            onTap: () => setState(() => _flipped = !_flipped),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: ScaleTransition(
                    scale: Tween(begin: 0.96, end: 1.0).animate(anim),
                    child: child),
              ),
              child:
                  _face(scheme, card, _flipped, key: ValueKey('$_i-$_flipped')),
            ),
          ),
        ),
        if (widget.cards.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(
              children: [
                IconButton.filledTonal(
                  onPressed: _i > 0 ? () => _go(-1) : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text('${_i + 1} / ${widget.cards.length}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: scheme.onSurface.withValues(alpha: 0.7),
                          fontWeight: FontWeight.w600)),
                ),
                IconButton.filledTonal(
                  onPressed: _i < widget.cards.length - 1 ? () => _go(1) : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _face(ColorScheme scheme, RuleCard card, bool flipped,
      {required Key key}) {
    return Card(
      key: key,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side:
            BorderSide(color: scheme.primary.withValues(alpha: 0.4), width: 2),
      ),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        alignment: Alignment.center,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: scheme.secondary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(card.tag,
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
              ),
              const SizedBox(height: 18),
              Text(
                flipped ? card.back : card.front,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: flipped ? 16 : 21,
                  height: 1.4,
                  fontFamily: 'NotoSerif',
                  fontWeight: flipped ? FontWeight.w500 : FontWeight.bold,
                  color: flipped ? scheme.onSurface : scheme.primary,
                ),
              ),
              const SizedBox(height: 18),
              Text(flipped ? 'нажми, чтобы вернуться' : 'нажми, чтобы открыть',
                  style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurface.withValues(alpha: 0.45))),
            ],
          ),
        ),
      ),
    );
  }
}
