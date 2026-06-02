import 'package:flutter/material.dart';
import '../services/grammar_engine.dart';
import '../widgets/serbian_ornament.dart';
import '../widgets/wolf_mascot.dart';

/// Грамматика как колода карточек для запоминания: падежи + три времени.
class GrammarCardsScreen extends StatefulWidget {
  const GrammarCardsScreen({super.key});

  @override
  State<GrammarCardsScreen> createState() => _GrammarCardsScreenState();
}

class _GrammarCardsScreenState extends State<GrammarCardsScreen> {
  final _cards = GrammarEngine.ruleCards();
  int _i = 0;
  bool _flipped = false;

  void _go(int delta) {
    setState(() {
      _i = (_i + delta).clamp(0, _cards.length - 1);
      _flipped = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final card = _cards[_i];

    return Scaffold(
      appBar: AppBar(title: const Text('Грамматика — карточки')),
      body: Column(
        children: [
          const OrnamentDivider(height: 22),
          const Padding(
            padding: EdgeInsets.fromLTRB(18, 14, 18, 0),
            child: WolfBubble(
              asset: Wolf.rule,
              title: 'Учим правила',
              text:
                  'Падежи и три времени — как карточки. Нажми на карточку, чтобы увидеть объяснение.',
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(18),
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
                  child: _face(scheme, card, _flipped, key: ValueKey('$_i-$_flipped')),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
            child: Row(
              children: [
                IconButton.filledTonal(
                  onPressed: _i > 0 ? () => _go(-1) : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text('${_i + 1} / ${_cards.length}',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: scheme.onSurface.withValues(alpha: 0.7),
                          fontWeight: FontWeight.w600)),
                ),
                IconButton.filledTonal(
                  onPressed: _i < _cards.length - 1 ? () => _go(1) : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _face(ColorScheme scheme,
      ({String front, String back, String tag}) card, bool flipped,
      {required Key key}) {
    return Card(
      key: key,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: scheme.primary.withValues(alpha: 0.4), width: 2),
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
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
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
                  fontSize: flipped ? 17 : 23,
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
