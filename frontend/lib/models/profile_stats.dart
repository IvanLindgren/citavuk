class ProfileStats {
  const ProfileStats({
    required this.words,
    required this.activity,
    required this.streakDays,
    required this.goal,
    required this.achievements,
  });

  final ProfileWordStats words;
  final List<ProfileActivity> activity;
  final int streakDays;
  final ProfileGoalProgress goal;
  final List<ProfileAchievement> achievements;

  factory ProfileStats.fromJson(Map<String, dynamic> json) => ProfileStats(
        words: ProfileWordStats.fromJson(
            (json['words'] as Map? ?? const {}).cast<String, dynamic>()),
        activity: (json['activity'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                ProfileActivity.fromJson(item.cast<String, dynamic>()))
            .toList(),
        streakDays: (json['streakDays'] as num?)?.toInt() ?? 0,
        goal: ProfileGoalProgress.fromJson(
            (json['goal'] as Map? ?? const {}).cast<String, dynamic>()),
        achievements: (json['achievements'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                ProfileAchievement.fromJson(item.cast<String, dynamic>()))
            .toList(),
      );
}

class ProfileWordStats {
  const ProfileWordStats(
      {required this.added, required this.learned, required this.due});

  final int added;
  final int learned;
  final int due;

  factory ProfileWordStats.fromJson(Map<String, dynamic> json) =>
      ProfileWordStats(
        added: (json['added'] as num?)?.toInt() ?? 0,
        learned: (json['learned'] as num?)?.toInt() ?? 0,
        due: (json['due'] as num?)?.toInt() ?? 0,
      );
}

class ProfileActivity {
  const ProfileActivity(
      {required this.day, required this.added, required this.reviewed});

  final String day;
  final int added;
  final int reviewed;

  factory ProfileActivity.fromJson(Map<String, dynamic> json) =>
      ProfileActivity(
        day: (json['day'] ?? '').toString(),
        added: (json['added'] as num?)?.toInt() ?? 0,
        reviewed: (json['reviewed'] as num?)?.toInt() ?? 0,
      );
}

class ProfileGoalProgress {
  const ProfileGoalProgress({
    required this.target,
    required this.done,
    required this.total,
    required this.ratio,
  });

  final String target;
  final int done;
  final int total;
  final double ratio;

  factory ProfileGoalProgress.fromJson(Map<String, dynamic> json) =>
      ProfileGoalProgress(
        target: (json['target'] ?? '').toString(),
        done: (json['done'] as num?)?.toInt() ?? 0,
        total: (json['total'] as num?)?.toInt() ?? 0,
        ratio: (json['ratio'] as num?)?.toDouble() ?? 0,
      );
}

class ProfileAchievement {
  const ProfileAchievement({
    required this.key,
    required this.title,
    required this.description,
    required this.icon,
    this.unlockedAt,
  });

  final String key;
  final String title;
  final String description;
  final String icon;
  final DateTime? unlockedAt;

  bool get unlocked => unlockedAt != null;

  factory ProfileAchievement.fromJson(Map<String, dynamic> json) =>
      ProfileAchievement(
        key: (json['key'] ?? '').toString(),
        title: (json['title'] ?? '').toString(),
        description: (json['description'] ?? '').toString(),
        icon: (json['icon'] ?? '').toString(),
        unlockedAt: DateTime.tryParse((json['unlockedAt'] ?? '').toString()),
      );
}
