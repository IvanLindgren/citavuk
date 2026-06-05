/// Превью новости в ленте.
class NewsItem {
  final String title;
  final String summary;
  final String? image;
  final String source;
  final String link;
  final String published;

  const NewsItem({
    required this.title,
    required this.summary,
    required this.link,
    this.image,
    this.source = '',
    this.published = '',
  });

  factory NewsItem.fromJson(Map<String, dynamic> j) => NewsItem(
        title: (j['title'] ?? '').toString(),
        summary: (j['summary'] ?? '').toString(),
        image: (j['image'] as String?)?.trim().isEmpty ?? true
            ? null
            : j['image'].toString(),
        source: (j['source'] ?? '').toString(),
        link: (j['link'] ?? '').toString(),
        published: (j['published'] ?? '').toString(),
      );
}

/// Полная статья (текст + заглавная картинка) для чтения.
class NewsArticle {
  final String title;
  final String? image;
  final String source;
  final String date;
  final List<String> paragraphs;

  const NewsArticle({
    required this.title,
    required this.paragraphs,
    this.image,
    this.source = '',
    this.date = '',
  });

  factory NewsArticle.fromJson(Map<String, dynamic> j) => NewsArticle(
        title: (j['title'] ?? '').toString(),
        image: (j['image'] as String?)?.trim().isEmpty ?? true
            ? null
            : j['image'].toString(),
        source: (j['source'] ?? '').toString(),
        date: (j['date'] ?? '').toString(),
        paragraphs: (j['paragraphs'] as List?)
                ?.map((e) => e.toString())
                .where((p) => p.trim().isNotEmpty)
                .toList() ??
            const [],
      );
}

/// Тема новостей.
class NewsTopic {
  final String key;
  final String label;
  final String emoji;
  const NewsTopic(this.key, this.label, this.emoji);

  static const all = <NewsTopic>[
    NewsTopic('general', 'Общее', '📰'),
    NewsTopic('politics', 'Политика', '🏛️'),
    NewsTopic('culture', 'Культура', '🎭'),
    NewsTopic('trending', 'В тренде', '🔥'),
    NewsTopic('science', 'Наука', '🔬'),
  ];
}
