import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api_client.dart';
import '../services/document_parser.dart';
import '../services/materials_catalog.dart';
import '../services/sync_service.dart';
import '../services/user_db.dart';
import '../utils/language_detector.dart';

/// Материалы для поступления: тесты, решения и пособия сербских учреждений.
///
/// Каталог лежит в ассетах и открывается офлайн. Сам документ скачивается
/// только по нажатию и через прокси сервера: ходить в чужие сайты напрямую из
/// приложения — значит собирать их просроченные сертификаты и редиректы.
class MaterialsScreen extends StatefulWidget {
  const MaterialsScreen({super.key});

  @override
  State<MaterialsScreen> createState() => _MaterialsScreenState();
}

class _MaterialsScreenState extends State<MaterialsScreen> {
  static const _kinds = <(String, String)>[
    ('test', 'Тесты'),
    ('key', 'Ответы'),
    ('book', 'Пособия'),
    ('guide', 'Инструкции'),
  ];

  /// Сколько карточек показывать до нажатия «показать ещё».
  static const _pageSize = 30;

  /// Папка, в которую складываются скачанные материалы. Отдельная, чтобы
  /// экзаменационные тесты не смешивались с книгами для чтения.
  static const _folder = 'Материалы для поступления';

  late final Future<MaterialsCatalog> _catalog = MaterialsCatalog.load();
  final _search = TextEditingController();

  String? _level;
  String? _subjectId;
  int? _year;
  String? _kindId = 'test';
  int _limit = _pageSize;

  /// Идентификатор документа, который сейчас скачивается.
  String? _downloading;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool get _filtered =>
      _level != null ||
      _subjectId != null ||
      _year != null ||
      _kindId != 'test' ||
      _search.text.isNotEmpty;

  void _reset() {
    setState(() {
      _level = null;
      _subjectId = null;
      _year = null;
      _kindId = 'test';
      _search.clear();
      _limit = _pageSize;
    });
  }

  Future<void> _addToLibrary(MaterialDocument document) async {
    setState(() => _downloading = document.id);
    final messenger = ScaffoldMessenger.of(context);
    final api = context.read<ApiClient>();
    final sync = context.read<SyncService>();

    try {
      final bytes = await api.getBytes(
        '/v1/documents/fetch',
        query: {'url': document.url},
      );
      final paragraphs = await DocumentParser.parsePdf(bytes);
      if (paragraphs.isEmpty) {
        throw ApiException(
          'В документе не нашлось текста — похоже, это сканы страниц.',
        );
      }

      final id = await UserDb.instance
          .insertBook(document.title, document.url, paragraphs);
      await UserDb.instance.setBookFolder(id, _folder);

      // Синхронизация не обязана успеть до конца: книга уже на устройстве.
      unawaited(sync.sync());

      messenger.showSnackBar(
        SnackBar(
          content: Text(
            LanguageDetector.isLikelySerbian(paragraphs)
                ? '«${document.title}» — в библиотеке, папка «$_folder»'
                : '«${document.title}» добавлен. Текст не распознан как '
                    'сербский — разбор слов может не работать.',
          ),
        ),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text('Не удалось загрузить документ: $e')),
      );
    } finally {
      if (mounted) setState(() => _downloading = null);
    }
  }

  Future<void> _openOriginal(String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Не удалось открыть ссылку.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Материалы для поступления'),
        actions: [
          if (_filtered)
            TextButton(
              onPressed: _reset,
              child: const Text('Сбросить'),
            ),
        ],
      ),
      body: FutureBuilder<MaterialsCatalog>(
        future: _catalog,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return _Message(
              icon: Icons.error_outline,
              text: 'Каталог материалов не открылся.\n${snapshot.error}',
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          return _catalogView(snapshot.data!);
        },
      ),
    );
  }

  Widget _catalogView(MaterialsCatalog catalog) {
    final found = catalog.filter(
      level: _level,
      subjectId: _subjectId,
      year: _year,
      kindId: _kindId,
      query: _search.text,
    );
    final shown = found.take(_limit).toList(growable: false);
    final hasMore = found.length > _limit;

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 28),
      // Фильтры, карточки и завершающий блок («показать ещё» либо источники).
      itemCount: shown.length + 2,
      itemBuilder: (context, index) {
        if (index == 0) return _filters(catalog, found.length);
        if (index <= shown.length) return _card(shown[index - 1]);
        if (found.isEmpty) return const _Message(text: 'По этому запросу материалов нет');
        return hasMore
            ? Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: OutlinedButton(
                    onPressed: () => setState(() => _limit += _pageSize),
                    child: Text(
                      'Показать ещё '
                      '${found.length - _limit < _pageSize ? found.length - _limit : _pageSize}',
                    ),
                  ),
                ),
              )
            : _sources(catalog);
      },
    );
  }

  Widget _filters(MaterialsCatalog catalog, int found) {
    final theme = Theme.of(context);
    final subjects = catalog.subjectsFor(_level);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
          child: Text(
            'Настоящие экзаменационные тесты, решения и пособия сербских '
            'учреждений. Документы остаются на сайте источника; «В библиотеку» '
            'скачивает текст и открывает его в читалке.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        TextField(
          controller: _search,
          onChanged: (_) => setState(() => _limit = _pageSize),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: 'Предмет, год, факультет',
            border: const OutlineInputBorder(),
            isDense: true,
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Очистить',
                    onPressed: () => setState(() {
                      _search.clear();
                      _limit = _pageSize;
                    }),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        _chipRow(
          'Куда',
          [
            _Choice(null, 'Всё', _level == null),
            for (final level in catalog.levels)
              _Choice(level.id, '${level.title} · ${level.count}',
                  _level == level.id),
          ],
          (value) => setState(() {
            _level = value;
            // Предмет мог существовать только на прежнем уровне.
            _subjectId = null;
            _limit = _pageSize;
          }),
        ),
        _chipRow(
          'Предмет',
          [
            _Choice(null, 'Все', _subjectId == null),
            for (final subject in subjects)
              _Choice(subject.id, '${subject.title} · ${subject.count}',
                  _subjectId == subject.id),
          ],
          (value) => setState(() {
            _subjectId = value;
            _limit = _pageSize;
          }),
        ),
        _chipRow(
          'Вид',
          [
            _Choice(null, 'Все', _kindId == null),
            for (final (id, label) in _kinds) _Choice(id, label, _kindId == id),
          ],
          (value) => setState(() {
            _kindId = value;
            _limit = _pageSize;
          }),
        ),
        _chipRow(
          'Год',
          [
            _Choice(null, 'Любой', _year == null),
            for (final year in catalog.years)
              _Choice('$year', '$year', _year == year),
          ],
          (value) => setState(() {
            _year = value == null ? null : int.tryParse(value);
            _limit = _pageSize;
          }),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
          child: Text(
            found > 0
                ? 'Найдено $found из ${catalog.documents.length}'
                : 'Ничего не нашлось',
            style: theme.textTheme.bodySmall,
          ),
        ),
      ],
    );
  }

  Widget _chipRow(
    String label,
    List<_Choice> choices,
    ValueChanged<String?> onSelected,
  ) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: SizedBox(
        height: 44,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: choices.length + 1,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            if (index == 0) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ),
              );
            }
            final choice = choices[index - 1];
            return Center(
              child: ChoiceChip(
                label: Text(choice.label),
                selected: choice.selected,
                onSelected: (_) => onSelected(choice.id),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _card(MaterialDocument document) {
    final theme = Theme.of(context);
    final busy = _downloading == document.id;
    final subtitle = [
      document.track ?? document.publisherShort,
      if (document.year != null) '${document.year}',
      if (document.sizeLabel.isNotEmpty) document.sizeLabel,
    ].join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(document.subject,
                          style: theme.textTheme.titleMedium),
                      const SizedBox(height: 2),
                      Text(subtitle, style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _KindChip(kindId: document.kindId, label: document.kind),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              document.publisher,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            ),
            const SizedBox(height: 4),
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 4,
              runSpacing: 4,
              children: [
                TextButton.icon(
                  onPressed: () => _openOriginal(document.url),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Оригинал'),
                ),
                FilledButton.icon(
                  onPressed: busy ? null : () => _addToLibrary(document),
                  icon: busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.library_add_outlined, size: 18),
                  label: Text(busy ? 'Загружаем…' : 'В библиотеку'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _sources(MaterialsCatalog catalog) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Откуда материалы', style: theme.textTheme.titleSmall),
          const SizedBox(height: 6),
          Text(
            'Всё опубликовано самими учреждениями в открытом доступе — без '
            'регистрации и оплаты. Мы документы не храним: каталог это '
            'указатель, каждая ссылка ведёт на сайт источника.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          for (final source in catalog.sources)
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(
                '• ${source.title} · ${source.count}',
                style: theme.textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

@immutable
class _Choice {
  const _Choice(this.id, this.label, this.selected);

  final String? id;
  final String label;
  final bool selected;
}

class _KindChip extends StatelessWidget {
  const _KindChip({required this.kindId, required this.label});

  final String kindId;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = switch (kindId) {
      'key' => scheme.tertiary,
      'book' => scheme.secondary,
      'guide' => scheme.outline,
      _ => scheme.primary,
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
          ],
          Text(text, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
