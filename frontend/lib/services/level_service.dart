import '../models/level.dart';
import 'api_client.dart';

/// Уровень сербского и оценка сложности текста.
///
/// Уровень живёт на аккаунте, а не в разделе: спросили один раз — знают везде.
/// До этого о нём знал только Вукоток и хранил его при устройстве, поэтому один
/// человек отвечал на один и тот же вопрос в приложении, в браузере и после
/// переустановки.
class LevelService {
  LevelService({required this.api});

  final ApiClient api;

  /// Вопросы теста. Верных ответов среди них нет — проверяет сервер.
  Future<List<LevelQuestion>> test() async {
    final data = await api.get('/v1/profile/level/test');
    final raw = (data as Map<String, dynamic>)['questions'] as List? ?? const [];
    return [
      for (final item in raw) LevelQuestion.fromJson(item as Map<String, dynamic>),
    ];
  }

  /// Считает уровень по ответам и, если [save], записывает его в аккаунт.
  Future<LevelTestResult> grade(Map<String, int> answers, {bool save = true}) async {
    final data = await api.post(
      '/v1/profile/level/test',
      {'answers': answers, 'save': save},
    );
    return LevelTestResult.fromJson(data as Map<String, dynamic>);
  }

  /// Запоминает уровень, названный самим человеком.
  Future<String> declare(String level) async {
    final data = await api.put('/v1/profile/level', {
      'level': level,
      'source': 'declared',
    });
    return ((data as Map<String, dynamic>)['level'] ?? '').toString();
  }

  /// Оценивает, на какой уровень рассчитан текст.
  ///
  /// Отправляется выборка, а не книга целиком: оценщик всё равно смотрит не
  /// больше 1200 слов, и гнать роман через сеть ради этого незачем.
  Future<TextLevel> estimate(List<String> paragraphs) async {
    final data = await api.post(
      '/v1/analyze/text-level',
      {'paragraphs': sampleParagraphs(paragraphs)},
    );
    return TextLevel.fromJson(data as Map<String, dynamic>);
  }
}

/// Сколько абзацев отправлять на оценку.
const _sampleSize = 120;

/// Берёт абзацы равномерно по всей книге.
///
/// Именно по всей: начало книги врёт чаще всего — у переводных изданий там
/// выходные данные, у учебников предисловие на другом языке.
List<String> sampleParagraphs(List<String> paragraphs) {
  final meaningful = [
    for (final item in paragraphs)
      if (item.trim().isNotEmpty) item,
  ];
  if (meaningful.length <= _sampleSize) return meaningful;
  final step = meaningful.length / _sampleSize;
  return [
    for (var i = 0; i < _sampleSize; i++) meaningful[(i * step).floor()],
  ];
}
