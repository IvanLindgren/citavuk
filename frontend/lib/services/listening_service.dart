import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import '../models/audio_lesson.dart';
import '../utils/transliteration.dart';
import 'analysis_repository.dart';

/// Аудирование (бета): курируемые уроки с бэкенда + TTS-озвучка любого текста.
class ListeningService {
  ListeningService._();
  static final ListeningService instance = ListeningService._();

  String get _base => AnalysisRepository.baseUrl;

  /// Курируемые уроки (подкасты/записи с субтитрами) — audio_lessons.json
  /// на Space, редактируется без обновления приложения.
  Future<List<AudioLesson>> getLessons() async {
    final resp = await http
        .get(Uri.parse('$_base/audio/lessons'))
        .timeout(const Duration(seconds: 20));
    if (resp.statusCode != 200) {
      throw Exception('Сервер вернул ${resp.statusCode}');
    }
    final data =
        jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
    return ((data['items'] as List?) ?? const [])
        .map((e) => AudioLesson.fromJson(e as Map<String, dynamic>))
        .where((l) => l.cues.isNotEmpty)
        .toList();
  }

  /// URL озвучки одной реплики (mp3 с бэкенда, gTTS).
  String ttsUrl(String text) =>
      '$_base/audio/tts?text=${Uri.encodeComponent(text)}';

  /// На web HTMLAudioElement требует CORS от финального mp3/m4a-хоста.
  /// Podcast CDN часто CORS не отдаёт, поэтому внешние RSS-аудио гоняем через
  /// backend-прокси. Нативные платформы играют прямую ссылку.
  String playableAudioUrl(String url) {
    if (!kIsWeb) return url;
    final audioUri = Uri.tryParse(url);
    final baseUri = Uri.tryParse(_base);
    if (audioUri == null || baseUri == null) return url;
    if (audioUri.host == baseUri.host) return url;
    return '$_base/audio/proxy?url=${Uri.encodeComponent(url)}';
  }

  /// Полный транскрипт эпизода (страница подкаста → trafilatura на бэкенде).
  /// Возвращает реплики с пропорциональными таймингами или пустой список.
  Future<List<AudioCue>> fetchTranscriptCues(
      String transcriptUrl, double durationSec) async {
    try {
      final uri = Uri.parse(
          '$_base/audio/transcript?url=${Uri.encodeComponent(transcriptUrl)}'
          '&duration=$durationSec');
      final resp = await http.get(uri).timeout(const Duration(seconds: 30));
      if (resp.statusCode != 200) return const [];
      final data =
          jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>;
      return ((data['cues'] as List?) ?? const [])
          .map((e) => AudioCue.fromJson(e as Map<String, dynamic>))
          .where((c) => c.text.trim().isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Строит TTS-урок из текста книги/статьи: режем на предложения-реплики.
  /// Каждая реплика озвучивается отдельным файлом — тайминги получаются
  /// точными без ручной разметки.
  AudioLesson lessonFromText({
    required String id,
    required String title,
    required List<String> paragraphs,
  }) {
    final cues = <AudioCue>[];
    final sentenceEnd = RegExp(r'(?<=[.!?…])\s+');
    for (final p in paragraphs) {
      for (var s in p.split(sentenceEnd)) {
        s = s.trim();
        if (s.isEmpty) continue;
        // gTTS надёжен на коротких кусках; очень длинные предложения режем
        // по ближайшей запятой.
        while (s.length > 220) {
          var cut = s.lastIndexOf(',', 200);
          if (cut < 80) cut = 200;
          cues.add(AudioCue(text: s.substring(0, cut + 1).trim()));
          s = s.substring(cut + 1).trim();
        }
        if (s.isNotEmpty) cues.add(AudioCue(text: s));
      }
    }
    return AudioLesson(
      id: id,
      title: title,
      subtitle: 'озвучка текста · ${cues.length} фраз',
      cues: cues,
    );
  }

  /// Эвристика «тяжело поймать на слух» (бета). Слово помечается красным,
  /// если набирает ≥2 признаков: длинное; содержит акустически близкие
  /// č/ć/đ (классическая трудность на слух); dž или ије/ije; кластер из
  /// трёх согласных подряд.
  bool isHardToHear(String word) {
    final w = SerbianTransliteration.toLatin(word).toLowerCase();
    if (w.length <= 3) return false;
    var score = 0;
    if (w.length >= 9) score++;
    if (RegExp(r'[čćđ]').hasMatch(w)) score++;
    if (w.contains('dž') || w.contains('ije')) score++;
    if (RegExp(r'[bcdfghjklmnprstvzšžčćđ]{3}').hasMatch(w)) score++;
    return score >= 2;
  }
}
