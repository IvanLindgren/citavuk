class PublicLibraryItem {
  const PublicLibraryItem({
    required this.id,
    required this.title,
    required this.author,
    required this.year,
    required this.kind,
    required this.genre,
    required this.level,
    required this.summary,
    required this.coverUrl,
    required this.textUrl,
    required this.sourceUrls,
    required this.license,
    required this.characters,
  });

  final String id;
  final String title;
  final String author;
  final String year;
  final String kind;
  final String genre;
  final String level;
  final String summary;
  final String coverUrl;
  final String textUrl;
  final List<String> sourceUrls;
  final String license;
  final int characters;

  factory PublicLibraryItem.fromJson(Map<String, dynamic> json) {
    return PublicLibraryItem(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      author: json['author'] as String? ?? '',
      year: json['year'] as String? ?? '',
      kind: json['kind'] as String? ?? '',
      genre: json['genre'] as String? ?? '',
      level: json['level'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      coverUrl: _absolute(json['coverUrl'] as String? ?? ''),
      textUrl: _absolute(json['textUrl'] as String? ?? ''),
      sourceUrls: (json['sourceUrls'] as List? ?? const [])
          .whereType<String>()
          .toList(growable: false),
      license: json['license'] as String? ?? '',
      characters: (json['characters'] as num?)?.toInt() ?? 0,
    );
  }

  static String _absolute(String value) =>
      value.startsWith('/') ? 'https://citavuk.ru$value' : value;
}
