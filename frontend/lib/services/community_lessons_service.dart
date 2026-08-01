import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/community_lesson.dart';
import 'api_client.dart';

class CommunityLessonsService {
  CommunityLessonsService(this.api);

  final ApiClient api;
  static const _catalogKey = 'community_lessons_catalog_v1';
  static const _lessonPrefix = 'community_lesson_v1_';

  Future<List<CommunityLesson>> list(
      {String level = '', String type = ''}) async {
    try {
      final raw = await api.get('/v1/lessons', query: {
        if (level.isNotEmpty) 'level': level,
        if (type.isNotEmpty) 'type': type,
      });
      final items = ((raw as Map?)?['items'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              CommunityLesson.fromJson(Map<String, dynamic>.from(item)))
          .toList();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          _catalogKey, jsonEncode(items.map((item) => item.toJson()).toList()));
      return items;
    } on ApiException {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(_catalogKey);
      if (cached == null) rethrow;
      return (jsonDecode(cached) as List)
          .whereType<Map>()
          .map((item) =>
              CommunityLesson.fromJson(Map<String, dynamic>.from(item)))
          .where((item) =>
              (level.isEmpty || item.level == level) &&
              (type.isEmpty || item.lessonType == type))
          .toList();
    }
  }

  Future<CommunityLesson> getPublic(String slug) =>
      _get('/v1/lessons/$slug', 'slug_$slug');
  Future<CommunityLesson> getUnlisted(String token) =>
      _get('/v1/lesson-links/$token', 'token_$token');

  Future<CommunityLesson> _get(String path, String cacheId) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final raw = await api.get(path);
      final lesson =
          CommunityLesson.fromJson(Map<String, dynamic>.from(raw as Map));
      await prefs.setString(
          '$_lessonPrefix$cacheId', jsonEncode(lesson.toJson()));
      return lesson;
    } on ApiException {
      final cached = prefs.getString('$_lessonPrefix$cacheId');
      if (cached == null) rethrow;
      return CommunityLesson.fromJson(
          Map<String, dynamic>.from(jsonDecode(cached) as Map));
    }
  }

  Future<Map<String, dynamic>> teacherApplication() async =>
      Map<String, dynamic>.from(
          await api.get('/v1/teachers/application') as Map);

  Future<Map<String, dynamic>> submitTeacherApplication(
          Map<String, dynamic> body) async =>
      Map<String, dynamic>.from(
          await api.put('/v1/teachers/application', body) as Map);

  Future<void> submitLetter(
      CommunityLesson lesson, String exerciseId, String answer) async {
    await api.post('/v1/lessons/${lesson.id}/submissions', {
      'revisionId': lesson.revisionId,
      'exerciseId': exerciseId,
      'answer': answer,
    });
  }
}
