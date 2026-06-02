import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/grammar.dart';
import '../services/grammar_engine.dart';
import '../services/lexicon_db.dart';
import '../utils/transliteration.dart';
import '../widgets/serbian_ornament.dart';
import '../widgets/wolf_mascot.dart';

class _GrammarData {
  final GrammarInfo info;
  final List<ParadigmTable> tables;
  final String? currentCase; // UD-значение: Nom/Gen/...
  final bool showCases;
  _GrammarData(this.info, this.tables, this.currentCase, this.showCases);
}

class GrammarScreen extends StatefulWidget {
  final String word;
  final String lemma;
  final String upos;
  final Map<String, dynamic> feats;

  const GrammarScreen({
    super.key,
    required this.word,
    required this.lemma,
    required this.upos,
    required this.feats,
  });

  @override
  State<GrammarScreen> createState() => _GrammarScreenState();
}

class _GrammarScreenState extends State<GrammarScreen> {
  late final Future<_GrammarData> _future = _load();

  Future<_GrammarData> _load() async {
    final rows = await LexiconDb.instance.getLexiconRowsForLemma(widget.lemma);

    var feats = widget.feats.map((k, v) => MapEntry(k, v.toString()));
    if (feats.isEmpty) {
      final surf = SerbianTransliteration.toLatin(widget.word).toLowerCase();
      for (final r in rows) {
        if ((r['form'] ?? '').toString().toLowerCase() == surf) {
          final fstr = (r['feats'] ?? '').toString();
          feats = fstr.isNotEmpty
              ? GrammarEngine.parseFeats(fstr)
              : GrammarEngine.featsFromMsd((r['msd'] ?? '').toString());
          break;
        }
      }
    }

    final info = GrammarEngine.describe(widget.upos, feats);
    final tables = GrammarEngine.buildParadigms(
      lemma: widget.lemma,
      upos: widget.upos,
      feats: feats,
      lexiconRows: rows,
      surface: widget.word,
    );
    const declinable = {'NOUN', 'PROPN', 'ADJ', 'PRON', 'DET'};
    return _GrammarData(
        info, tables, feats['Case'], declinable.contains(widget.upos));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('🐺', style: TextStyle(fontSize: 20)),
            SizedBox(width: 8),
            Text('Почему так?'),
          ],
        ),
      ),
      body: FutureBuilder<_GrammarData>(
        future: _future,
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final data = snap.data!;
          return ListView(
            padding: EdgeInsets.zero,
            children: [
              const OrnamentDivider(height: 22),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _header(scheme, data.info),
                    const SizedBox(height: 16),
                    WolfBubble(title: 'Разбор', text: data.info.why, asset: Wolf.rule),
                    if (data.showCases) ...[
                      const SizedBox(height: 14),
                      _CasesCheatsheet(currentCase: data.currentCase),
                    ],
                    const SizedBox(height: 4),
                    _buildParadigmsLayout(context, data.tables, scheme),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildParadigmsLayout(BuildContext context, List<ParadigmTable> tables, ColorScheme scheme) {
    if (tables.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Text(
          'Для этой части речи парадигма пока не строится.',
          style: TextStyle(color: scheme.onSurface.withValues(alpha: 0.6)),
        ),
      );
    }

    final double width = MediaQuery.of(context).size.width;
    if (width >= 750 && tables.length > 1) {
      return Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: tables.map((t) {
            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _ParadigmCard(table: t),
              ),
            );
          }).toList(),
        ),
      );
    }

    return Column(
      children: tables.map((t) => _ParadigmCard(table: t)).toList(),
    );
  }

  Widget _header(ColorScheme scheme, GrammarInfo info) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.word,
                style: TextStyle(
                    fontSize: 30,
                    fontFamily: 'NotoSerif',
                    fontWeight: FontWeight.bold,
                    color: scheme.primary)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                _pill(info.posLabel, scheme.primary, Colors.white),
                if (widget.lemma.isNotEmpty)
                  Text('лемма: ${widget.lemma}',
                      style: TextStyle(
                          color: scheme.onSurface.withValues(alpha: 0.65),
                          fontSize: 14)),
              ],
            ),
            if (info.facts.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: info.facts
                    .map((f) => _pill('${f.label}: ${f.value}',
                        scheme.surfaceContainerHighest, scheme.onSurface,
                        border: scheme.secondary))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _pill(String text, Color bg, Color fg, {Color? border}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(8),
          border: border != null
              ? Border.all(color: border.withValues(alpha: 0.4))
              : null,
        ),
        child: Text(text,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
      );
}

/// Интерактивная шпаргалка: все 7 падежей, текущий подсвечен.
class _CasesCheatsheet extends StatelessWidget {
  final String? currentCase;
  const _CasesCheatsheet({this.currentCase});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final cases = GrammarEngine.casesReference();
    return Card(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          shape: const Border(),
          collapsedShape: const Border(),
          initiallyExpanded: false,
          leading: const Text('🐺', style: TextStyle(fontSize: 22)),
          title: const Text('Падежи сербского — зачем нужны',
              style: TextStyle(fontWeight: FontWeight.bold)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          children: cases.map((c) {
            final active = c.key == currentCase;
            return Container(
              margin: const EdgeInsets.symmetric(vertical: 3),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: active
                    ? scheme.primary.withValues(alpha: 0.14)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: active ? Border.all(color: scheme.primary) : null,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(c.name,
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: active ? scheme.primary : scheme.onSurface)),
                      if (active) ...[
                        const SizedBox(width: 6),
                        Text('← эта форма',
                            style: TextStyle(
                                fontSize: 11,
                                color: scheme.primary,
                                fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(c.use,
                      style: TextStyle(
                          fontSize: 13,
                          color: scheme.onSurface.withValues(alpha: 0.7))),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/// Карточка-парадигма: сворачиваемая; формы копируются по тапу.
class _ParadigmCard extends StatelessWidget {
  final ParadigmTable table;
  const _ParadigmCard({required this.table});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasCurrent = table.rows.any((r) => r.current);
    return Card(
      margin: const EdgeInsets.only(top: 14),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          shape: const Border(),
          collapsedShape: const Border(),
          initiallyExpanded: hasCurrent,
          title: Text(table.title,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: scheme.primary)),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          children: [
            if (table.subtitle != null) ...[
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: scheme.secondary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: scheme.secondary.withValues(alpha: 0.2)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: scheme.secondary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        table.subtitle!,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: scheme.secondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            ...table.rows.map((c) => _row(context, c, scheme)),
            if (table.hasGenerated)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                    '≈ — форма достроена правилом (уточняется по мере роста словаря)',
                    style: TextStyle(
                        fontSize: 11,
                        fontStyle: FontStyle.italic,
                        color: scheme.onSurface.withValues(alpha: 0.5))),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, ParadigmCell c, ColorScheme scheme) {
    final highlight = c.current;
    final hasForm = c.form != '—';
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: hasForm
          ? () {
              Clipboard.setData(ClipboardData(text: c.form));
              ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(SnackBar(
                  content: Text('«${c.form}» скопировано'),
                  duration: const Duration(seconds: 1),
                ));
            }
          : null,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 2),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color:
              highlight ? scheme.primary.withValues(alpha: 0.15) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: highlight ? Border.all(color: scheme.primary) : null,
        ),
        child: Row(
          children: [
            SizedBox(
              width: 116,
              child: Text(c.label,
                  style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurface.withValues(alpha: 0.7))),
            ),
            Expanded(
              child: Text(
                c.generated && hasForm ? '${c.form} ≈' : c.form,
                style: TextStyle(
                  fontSize: 16,
                  fontFamily: 'NotoSerif',
                  fontWeight: highlight ? FontWeight.bold : FontWeight.w500,
                  color: hasForm
                      ? scheme.onSurface
                      : scheme.onSurface.withValues(alpha: 0.35),
                ),
              ),
            ),
            if (hasForm)
              Icon(Icons.copy_rounded,
                  size: 15, color: scheme.onSurface.withValues(alpha: 0.3)),
          ],
        ),
      ),
    );
  }
}
