/// Карточка Вукотока — короткий сербский текст на один экран.
class MicroFeedItem {
  final String id;
  final String category;
  final String titleCyrillic;
  final String titleLatin;
  final String textCyrillic;
  final String textLatin;
  final String cefr;
  final List<String> tags;
  final List<DifficultWord> difficultWords;
  final String imageUrl;
  final String sourceTitle;
  final String sourceUrl;
  final String attributionText;
  final int likesCount;
  final int dislikesCount;
  final int commentsCount;

  /// −1, 0 или 1. Приходит от сервера для этого читателя.
  final int reaction;

  const MicroFeedItem({
    required this.id,
    required this.category,
    required this.titleCyrillic,
    required this.titleLatin,
    required this.textCyrillic,
    required this.textLatin,
    required this.cefr,
    required this.tags,
    required this.difficultWords,
    required this.imageUrl,
    required this.sourceTitle,
    required this.sourceUrl,
    required this.attributionText,
    required this.likesCount,
    required this.dislikesCount,
    required this.commentsCount,
    required this.reaction,
  });

  String title(bool cyrillic) => cyrillic ? titleCyrillic : titleLatin;
  String text(bool cyrillic) => cyrillic ? textCyrillic : textLatin;

  factory MicroFeedItem.fromJson(Map<String, dynamic> j,
      {required String imageBase}) {
    String s(String key) => (j[key] ?? '').toString();
    // Адрес картинки сервер отдаёт своей ручкой («/v1/micro-feed/…/image»):
    // прямая ссылка на чужой сайт рассказала бы ему, кто открыл карточку.
    final image = s('imageUrl');
    return MicroFeedItem(
      id: s('id'),
      category: s('category'),
      titleCyrillic: s('titleCyrillic'),
      titleLatin: s('titleLatin'),
      textCyrillic: s('textCyrillic'),
      textLatin: s('textLatin'),
      cefr: s('cefr'),
      tags: [for (final t in (j['tags'] as List?) ?? const []) t.toString()],
      difficultWords: [
        for (final w in (j['difficultWords'] as List?) ?? const [])
          DifficultWord.fromJson(w as Map<String, dynamic>),
      ],
      imageUrl: image.isEmpty
          ? ''
          : (image.startsWith('http') ? image : '$imageBase$image'),
      sourceTitle: s('sourceTitle'),
      sourceUrl: s('sourceUrl'),
      attributionText: s('attributionText'),
      likesCount: (j['likesCount'] as num?)?.toInt() ?? 0,
      dislikesCount: (j['dislikesCount'] as num?)?.toInt() ?? 0,
      commentsCount: (j['commentsCount'] as num?)?.toInt() ?? 0,
      reaction: (j['reaction'] as num?)?.toInt() ?? 0,
    );
  }
}

class DifficultWord {
  final String word;
  final String lemma;
  final String transcription;
  final String translationRu;

  const DifficultWord({
    required this.word,
    required this.lemma,
    required this.transcription,
    required this.translationRu,
  });

  factory DifficultWord.fromJson(Map<String, dynamic> j) => DifficultWord(
        word: (j['word'] ?? '').toString(),
        lemma: (j['lemma'] ?? '').toString(),
        transcription: (j['transcription'] ?? '').toString(),
        translationRu: (j['translationRu'] ?? '').toString(),
      );
}

/// Темы и уровень, названные читателем в анкете.
class MicroFeedPreferences {
  final List<String> categories;
  final String cefr;

  /// Анкета пройдена. Пустой список тем — тоже ответ, а не «не спрашивали».
  final bool onboarded;

  /// Уровень взят с аккаунта, где он задан один раз для всего приложения.
  /// Тогда анкета про уровень не спрашивает: человек уже ответил, и повторный
  /// вопрос выглядит так, будто его не услышали.
  final bool levelFromAccount;

  const MicroFeedPreferences({
    required this.categories,
    required this.cefr,
    required this.onboarded,
    this.levelFromAccount = false,
  });

  factory MicroFeedPreferences.fromJson(Map<String, dynamic> j) =>
      MicroFeedPreferences(
        categories: [
          for (final c in (j['categories'] as List?) ?? const []) c.toString(),
        ],
        cefr: (j['cefr'] ?? 'B1').toString(),
        onboarded: j['onboarded'] == true,
        levelFromAccount: j['levelFromAccount'] == true,
      );
}

/// Реплика в обсуждении карточки.
class MicroFeedComment {
  final String id;
  final String author;
  final String body;
  final DateTime? createdAt;

  /// Своя реплика — её можно удалить.
  final bool mine;

  const MicroFeedComment({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    required this.mine,
  });

  factory MicroFeedComment.fromJson(Map<String, dynamic> j) {
    String s(String key) => (j[key] ?? '').toString();
    return MicroFeedComment(
      id: s('id'),
      author: s('author').isEmpty ? 'Читатель' : s('author'),
      body: s('body'),
      createdAt: DateTime.tryParse(s('createdAt'))?.toLocal(),
      mine: j['mine'] == true,
    );
  }
}

class MicroFeedPage {
  final List<MicroFeedItem> items;
  final String strategy;
  final MicroFeedPreferences? preferences;

  const MicroFeedPage({
    required this.items,
    required this.strategy,
    required this.preferences,
  });

  factory MicroFeedPage.fromJson(Map<String, dynamic> j,
          {required String imageBase}) =>
      MicroFeedPage(
        items: [
          for (final raw in (j['items'] as List?) ?? const [])
            MicroFeedItem.fromJson(raw as Map<String, dynamic>,
                imageBase: imageBase),
        ],
        strategy: (j['strategy'] ?? 'cold').toString(),
        preferences: j['preferences'] is Map<String, dynamic>
            ? MicroFeedPreferences.fromJson(
                j['preferences'] as Map<String, dynamic>)
            : null,
      );
}

/// Темы ленты. Порядок и подписи те же, что на сайте.
const microFeedCategories = <String, String>{
  'history': 'История',
  'culture': 'Культура',
  'science': 'Наука',
  'fiction': 'Литература',
  'society': 'Общество',
  'news': 'Новости',
  'travel': 'Путешествия',
  'food': 'Еда',
  'sport': 'Спорт',
  'music': 'Музыка',
  'language': 'Про язык',
};

const microFeedCategoryHints = <String, String>{
  'history': 'Балканы, короли, войны',
  'culture': 'Кино, обычаи, искусство',
  'science': 'Открытия и объяснения',
  'fiction': 'Отрывки из книг',
  'society': 'Как живут люди',
  'news': 'Что происходит сейчас',
  'travel': 'Куда съездить на Балканах',
  'food': 'Кухня, застолье, рецепты',
  'sport': 'Баскетбол, теннис, футбол',
  'music': 'Песни, группы, труба',
  'language': 'Слова, выражения, тонкости',
};

const microFeedLevels = <String, String>{
  'A1': 'Первые слова',
  'A2': 'Простые фразы',
  'B1': 'Читаю с переводчиком',
  'B2': 'Читаю почти свободно',
  'C1': 'Свободно',
};
