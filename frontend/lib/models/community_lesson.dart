class CommunityLesson {
  const CommunityLesson({
    required this.id,
    required this.authorName,
    required this.slug,
    required this.title,
    required this.summary,
    this.coverUrl = '',
    required this.level,
    required this.lessonType,
    required this.topic,
    required this.tags,
    required this.estimatedMinutes,
    required this.visibility,
    this.shareToken = '',
    this.revisionId = '',
    this.content = const {},
  });

  factory CommunityLesson.fromJson(Map<String, dynamic> json) =>
      CommunityLesson(
        id: json['id']?.toString() ?? '',
        authorName: json['authorName']?.toString() ?? 'Преподаватель',
        slug: json['slug']?.toString() ?? '',
        shareToken: json['shareToken']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        summary: json['summary']?.toString() ?? '',
        coverUrl: json['coverUrl']?.toString() ?? '',
        level: json['level']?.toString() ?? '',
        lessonType: json['lessonType']?.toString() ?? '',
        topic: json['topic']?.toString() ?? '',
        tags:
            (json['tags'] as List?)?.map((item) => item.toString()).toList() ??
                const [],
        estimatedMinutes: (json['estimatedMinutes'] as num?)?.toInt() ?? 10,
        visibility: json['visibility']?.toString() ?? 'public',
        revisionId: json['revisionId']?.toString() ?? '',
        content: json['content'] is Map
            ? Map<String, dynamic>.from(json['content'] as Map)
            : const {},
      );

  final String id;
  final String authorName;
  final String slug;
  final String shareToken;
  final String title;
  final String summary;
  final String coverUrl;
  final String level;
  final String lessonType;
  final String topic;
  final List<String> tags;
  final int estimatedMinutes;
  final String visibility;
  final String revisionId;
  final Map<String, dynamic> content;

  Map<String, dynamic> toJson() => {
        'id': id,
        'authorName': authorName,
        'slug': slug,
        'shareToken': shareToken,
        'title': title,
        'summary': summary,
        'coverUrl': coverUrl,
        'level': level,
        'lessonType': lessonType,
        'topic': topic,
        'tags': tags,
        'estimatedMinutes': estimatedMinutes,
        'visibility': visibility,
        'revisionId': revisionId,
        'content': content,
      };
}
