/// Статус проверки учебного контента (provenance, см. SCHEMA.md).
enum ReviewStatus {
  /// Черновик: в production-bundle запрещён (см. CourseConfig.allowDraftContent).
  draft,

  /// Автоматически проверен валидатором.
  machineChecked,

  /// Проверен преподавателем.
  teacherReviewed,
}

/// Разбирает reviewStatus из JSON ('draft' | 'machine_checked' | 'teacher_reviewed').
ReviewStatus reviewStatusFromJson(dynamic raw) => switch (raw) {
      'draft' => ReviewStatus.draft,
      'machine_checked' => ReviewStatus.machineChecked,
      'teacher_reviewed' => ReviewStatus.teacherReviewed,
      _ => throw FormatException("Неизвестный reviewStatus: '$raw'."),
    };

/// Сериализует reviewStatus обратно в snake_case (формат SCHEMA.md).
String reviewStatusToJson(ReviewStatus status) => switch (status) {
      ReviewStatus.draft => 'draft',
      ReviewStatus.machineChecked => 'machine_checked',
      ReviewStatus.teacherReviewed => 'teacher_reviewed',
    };

/// Ссылка на источник (provenance). Обязательна для всего контента курса:
/// объяснений, упражнений и вступлений к урокам.
class SourceRef {
  /// Полная библиографическая запись книги-источника.
  final String sourceBook;

  /// Раздел/заголовок источника (для supplemental — проверяемый источник).
  final String sourceHeading;

  /// Диапазон строк исходного Markdown: 'md:<start>-<end>'.
  final String sourceAnchor;

  /// Хэш исходного файла: 'sha256:<hash исходного md>'.
  final String sourceEditionOrFileHash;

  /// Версия контента (semver).
  final String contentVersion;

  final ReviewStatus reviewStatus;

  /// Кто проверил (для teacherReviewed), иначе null.
  final String? reviewedBy;

  /// true — контент вне книги (требует отдельного источника в sourceHeading).
  final bool supplemental;

  const SourceRef({
    required this.sourceBook,
    required this.sourceHeading,
    required this.sourceAnchor,
    required this.sourceEditionOrFileHash,
    required this.contentVersion,
    required this.reviewStatus,
    this.reviewedBy,
    this.supplemental = false,
  });

  static String _reqStr(Map<String, dynamic> j, String field) {
    final v = j[field];
    if (v is! String || v.isEmpty) {
      throw FormatException("SourceRef: поле '$field' обязательно и непусто.");
    }
    return v;
  }

  factory SourceRef.fromJson(Map<String, dynamic> j) => SourceRef(
        sourceBook: _reqStr(j, 'sourceBook'),
        sourceHeading: _reqStr(j, 'sourceHeading'),
        sourceAnchor: _reqStr(j, 'sourceAnchor'),
        sourceEditionOrFileHash: _reqStr(j, 'sourceEditionOrFileHash'),
        contentVersion: _reqStr(j, 'contentVersion'),
        reviewStatus: reviewStatusFromJson(j['reviewStatus']),
        reviewedBy: j['reviewedBy']?.toString(),
        supplemental: j['supplemental'] == true,
      );

  Map<String, dynamic> toJson() => {
        'sourceBook': sourceBook,
        'sourceHeading': sourceHeading,
        'sourceAnchor': sourceAnchor,
        'sourceEditionOrFileHash': sourceEditionOrFileHash,
        'contentVersion': contentVersion,
        'reviewStatus': reviewStatusToJson(reviewStatus),
        'reviewedBy': reviewedBy,
        'supplemental': supplemental,
      };
}
