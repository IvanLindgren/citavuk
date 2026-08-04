import '../models/book_block.dart';
import 'api_client.dart';

/// Перевод загруженного документа на сербский.
///
/// Перевод идёт заявкой и кусками, а не одним запросом. Книга переводится
/// минуты: единственный запрос упёрся бы в таймаут, не показал бы хода работ и
/// при обрыве связи потерял бы всё сделанное — вместе с суточным пределом,
/// который к тому моменту уже израсходован.
///
/// Что переводить, решает клиент: только здесь известно, где в книге текст, а
/// где адрес картинки или ячейка таблицы. Сервер переводит присланный список
/// строк один в один. Порядок обязан сохраниться: сдвиг хотя бы на один абзац
/// развалил бы весь остаток книги, и заметно это стало бы не сразу.
class DocumentTranslationService {
  DocumentTranslationService(this._api);

  final ApiClient _api;

  /// Сколько знаков уходит в одном куске.
  ///
  /// Компромисс между числом запросов и временем ожидания одного ответа: на
  /// восьми тысячах знаков книга умещается в пару десятков запросов, а каждый
  /// отвечает за несколько секунд, поэтому полоса хода работ движется заметно.
  static const _chunkChars = 8000;

  /// Спрашивает, доступен ли перевод сейчас.
  Future<TranslationQuota> quota() async {
    final data = await _api.get('/v1/documents/translation/quota');
    final map = data as Map<String, dynamic>;
    return TranslationQuota(
      available: map['available'] == true,
      nextAt: DateTime.tryParse((map['nextAt'] ?? '') as String),
      perDay: (map['perDay'] as num?)?.toInt() ?? 1,
      maxChars: (map['maxChars'] as num?)?.toInt() ?? 0,
    );
  }

  /// Переводит книгу на сербский, сохраняя картинки и структуру таблиц.
  ///
  /// [onProgress] получает долю выполненного от 0 до 1 и пояснение о том, чем
  /// переводится документ: провайдер влияет на качество, и молчать об этом
  /// нечестно.
  Future<List<String>> translate({
    required String title,
    required List<String> paragraphs,
    String sourceLang = '',
    void Function(double ratio, String providerNote)? onProgress,
  }) async {
    final blocks = paragraphs.map(parseBookBlock).toList();

    // Плоский список строк и карта «строка → её блок». Без карты после ответа
    // сервера было бы нечем разложить перевод обратно по ячейкам таблиц.
    final texts = <String>[];
    final owner = <int>[];
    for (var i = 0; i < blocks.length; i++) {
      for (final text in translatableText(blocks[i])) {
        texts.add(text);
        owner.add(i);
      }
    }

    final chars = texts.fold<int>(0, (sum, text) => sum + text.length);
    final started = await _api.post('/v1/documents/translation', {
      'title': title,
      'chars': chars,
      'sourceLang': sourceLang,
    }) as Map<String, dynamic>;

    final jobId = started['jobId'] as String;
    final note = (started['providerNote'] ?? '') as String;
    onProgress?.call(0, note);

    final translated = <String>[];
    var done = 0;

    for (var start = 0; start < texts.length;) {
      var end = start;
      var size = 0;
      while (end < texts.length) {
        final length = texts[end].length;
        // Первая строка куска берётся всегда: иначе одна строка длиннее
        // предела остановила бы цикл навсегда.
        if (end > start && size + length > _chunkChars) break;
        size += length;
        end++;
      }

      final chunk = texts.sublist(start, end);
      final response = await _api.post(
        '/v1/documents/translation/$jobId/chunk',
        {'paragraphs': chunk},
        // Кусок переводится внешним сервисом и может идти долго: обычные
        // тридцать секунд обрывали бы работу на ровном месте.
        timeout: const Duration(minutes: 3),
      ) as Map<String, dynamic>;

      final out = (response['paragraphs'] as List).cast<String>();
      // Ответ обязан быть той же длины. Молча принять другой значит сдвинуть
      // весь остаток книги относительно оригинала.
      if (out.length != chunk.length) {
        throw ApiException(
          'Переводчик вернул не столько абзацев, сколько получил.',
        );
      }
      translated.addAll(out);

      done += size;
      start = end;
      onProgress?.call(chars > 0 ? (done / chars).clamp(0.0, 1.0) : 1.0, note);
    }

    // Заявка закрывается для отчёта; на предел это уже не влияет, поэтому
    // неудача здесь не должна отменять готовый перевод.
    try {
      await _api.post('/v1/documents/translation/$jobId/finish', null);
    } on ApiException {
      // Молчим намеренно.
    }

    // Собираем абзацы обратно: каждому блоку — его строки, в исходном порядке.
    final result = <String>[];
    var cursor = 0;
    for (var i = 0; i < blocks.length; i++) {
      final mine = <String>[];
      while (cursor < owner.length && owner[cursor] == i) {
        mine.add(cursor < translated.length ? translated[cursor] : texts[cursor]);
        cursor++;
      }
      result.add(withTranslation(blocks[i], mine));
    }
    return result;
  }
}

class TranslationQuota {
  const TranslationQuota({
    required this.available,
    required this.perDay,
    required this.maxChars,
    this.nextAt,
  });

  final bool available;

  /// Когда предел освободится. null — перевод доступен сейчас.
  final DateTime? nextAt;
  final int perDay;
  final int maxChars;

  /// Через сколько станет можно — человеческими словами.
  String get waitLabel {
    final at = nextAt;
    if (at == null) return 'сейчас';
    final delta = at.difference(DateTime.now());
    if (delta.isNegative) return 'сейчас';
    if (delta.inHours < 1) return 'меньше чем через час';
    final hours = delta.inHours + 1;
    if (hours < 5) return 'через $hours часа';
    return 'через $hours часов';
  }
}
