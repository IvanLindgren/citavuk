import 'package:flutter/foundation.dart';

@immutable
class ServerAnnouncement {
  const ServerAnnouncement({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.bannerText,
    required this.imageUrl,
    required this.actionLabel,
    required this.actionUrl,
    required this.bannerEnabled,
    required this.shareRequired,
    required this.shareText,
    required this.rewardKey,
    required this.rewardAssetUrl,
    required this.read,
    required this.dismissed,
    required this.claimed,
  });

  factory ServerAnnouncement.fromJson(Map<String, dynamic> json) =>
      ServerAnnouncement(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? 'news',
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        bannerText: json['bannerText'] as String? ?? '',
        imageUrl: json['imageUrl'] as String? ?? '',
        actionLabel: json['actionLabel'] as String? ?? '',
        actionUrl: json['actionUrl'] as String? ?? '',
        bannerEnabled: json['bannerEnabled'] as bool? ?? false,
        shareRequired: json['shareRequired'] as bool? ?? false,
        shareText: json['shareText'] as String? ?? '',
        rewardKey: json['rewardKey'] as String? ?? '',
        rewardAssetUrl: json['rewardAssetUrl'] as String? ?? '',
        read: json['readAt'] != null,
        dismissed: json['dismissedAt'] != null,
        claimed: json['claimedAt'] != null,
      );

  final String id;
  final String kind;
  final String title;
  final String body;
  final String bannerText;
  final String imageUrl;
  final String actionLabel;
  final String actionUrl;
  final bool bannerEnabled;
  final bool shareRequired;
  final String shareText;
  final String rewardKey;
  final String rewardAssetUrl;
  final bool read;
  final bool dismissed;
  final bool claimed;

  ServerAnnouncement copyWith({
    bool? read,
    bool? dismissed,
    bool? claimed,
  }) =>
      ServerAnnouncement(
        id: id,
        kind: kind,
        title: title,
        body: body,
        bannerText: bannerText,
        imageUrl: imageUrl,
        actionLabel: actionLabel,
        actionUrl: actionUrl,
        bannerEnabled: bannerEnabled,
        shareRequired: shareRequired,
        shareText: shareText,
        rewardKey: rewardKey,
        rewardAssetUrl: rewardAssetUrl,
        read: read ?? this.read,
        dismissed: dismissed ?? this.dismissed,
        claimed: claimed ?? this.claimed,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'body': body,
        'bannerText': bannerText,
        'imageUrl': imageUrl,
        'actionLabel': actionLabel,
        'actionUrl': actionUrl,
        'bannerEnabled': bannerEnabled,
        'shareRequired': shareRequired,
        'shareText': shareText,
        'rewardKey': rewardKey,
        'rewardAssetUrl': rewardAssetUrl,
        if (read) 'readAt': true,
        if (dismissed) 'dismissedAt': true,
        if (claimed) 'claimedAt': true,
      };
}

@immutable
class ServerNotification {
  const ServerNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.targetUrl,
    required this.createdAt,
    required this.read,
  });

  factory ServerNotification.fromJson(Map<String, dynamic> json) =>
      ServerNotification(
        id: json['id'] as String? ?? '',
        kind: json['kind'] as String? ?? '',
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        targetUrl: json['targetUrl'] as String? ?? '',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
        read: json['readAt'] != null,
      );

  final String id;
  final String kind;
  final String title;
  final String body;
  final String targetUrl;
  final DateTime? createdAt;
  final bool read;

  ServerNotification copyWith({bool? read}) => ServerNotification(
        id: id,
        kind: kind,
        title: title,
        body: body,
        targetUrl: targetUrl,
        createdAt: createdAt,
        read: read ?? this.read,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind,
        'title': title,
        'body': body,
        'targetUrl': targetUrl,
        'createdAt': createdAt?.toIso8601String(),
        if (read) 'readAt': true,
      };
}
