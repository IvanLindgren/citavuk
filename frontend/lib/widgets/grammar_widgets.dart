import 'package:flutter/material.dart';
import '../models/grammar.dart';
import '../services/grammar_engine.dart';
import 'animated_widgets.dart';

/// Цвет-метка падежа (единый по всему приложению: чипы, таблицы, подсказки).
Color caseColor(String caseKey) =>
    const {
      'Nom': Color(0xFF3F6CB4), // синий
      'Gen': Color(0xFF9E2B25), // сербский красный
      'Dat': Color(0xFF2E8B57), // зелёный
      'Acc': Color(0xFFC9802B), // оранжевый
      'Voc': Color(0xFF7A4FA3), // фиолетовый
      'Ins': Color(0xFF1F8A8A), // бирюзовый
      'Loc': Color(0xFF2E3B5B), // индиго
    }[caseKey] ??
    const Color(0xFF6B6B6B);

/// Текст словоформы с выделенным окончанием: основа — обычная, окончание —
/// жирное, цветное и подчёркнутое. Показывает «куда что переходит».
class EndingText extends StatelessWidget {
  final String stem;
  final String ending;
  final Color color;
  final bool bold;
  final double fontSize;

  const EndingText({
    super.key,
    required this.stem,
    required this.ending,
    required this.color,
    this.bold = false,
    this.fontSize = 16,
  });

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(
      fontSize: fontSize,
      fontFamily: 'NotoSerif',
      fontWeight: bold ? FontWeight.bold : FontWeight.w500,
      color: DefaultTextStyle.of(context).style.color,
    );
    return Text.rich(
      TextSpan(
        style: base,
        children: [
          TextSpan(text: stem),
          if (ending.isNotEmpty)
            TextSpan(
              text: ending,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.bold,
                decoration: TextDecoration.underline,
                decorationColor: color.withValues(alpha: 0.7),
                decorationThickness: 2,
              ),
            ),
        ],
      ),
    );
  }
}

/// Карточка «предлог управляет падежом» — показывается автоматически, когда
/// пользователь выделяет предлог (или предлог + слово).
class PrepositionGovernmentCard extends StatelessWidget {
  final String preposition;
  final List<PrepositionGovernment> government;

  const PrepositionGovernmentCard({
    super.key,
    required this.preposition,
    required this.government,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final multi = government.length > 1;
    return FadeSlideIn(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              scheme.tertiary.withValues(alpha: 0.16),
              scheme.primary.withValues(alpha: 0.06),
            ],
          ),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.tertiary.withValues(alpha: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.link_rounded, size: 18, color: scheme.tertiary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: scheme.onSurface),
                      children: [
                        const TextSpan(text: 'Предлог '),
                        TextSpan(
                            text: '«$preposition»',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: scheme.primary)),
                        TextSpan(
                            text: multi
                                ? ' управляет падежами:'
                                : ' требует падеж:'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...government.map((g) => _govRow(scheme, g)),
            const SizedBox(height: 4),
            Text(
              multi
                  ? 'Слово после предлога ставится в нужный падеж — он зависит от смысла (движение/место).'
                  : 'Слово после предлога ставится в этот падеж.',
              style: TextStyle(
                  fontSize: 12,
                  fontStyle: FontStyle.italic,
                  color: scheme.onSurface.withValues(alpha: 0.65)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _govRow(ColorScheme scheme, PrepositionGovernment g) {
    final c = caseColor(g.caseKey);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 104,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
            decoration: BoxDecoration(
              color: c.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: c),
            ),
            child: Text(
              GrammarEngine.caseShort(g.caseKey),
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.bold, color: c),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(g.meaning,
                  style: TextStyle(
                      fontSize: 13, color: scheme.onSurface.withValues(alpha: 0.85))),
            ),
          ),
        ],
      ),
    );
  }
}
