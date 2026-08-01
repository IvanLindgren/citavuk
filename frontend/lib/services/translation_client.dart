import 'dart:convert';

import 'package:http/http.dart' as http;

/// Результат перевода с сервера Citavuk.
class TranslationResult {
  const TranslationResult({
    required this.text,
    this.sentence,
    this.provider = '',
    this.aligned = false,
  });

  /// Перевод запрошенного фрагмента.
  final String text;

  /// Перевод всего предложения, если слово переводилось в контексте.
  final String? sentence;

  /// Кто перевёл. Нужен для отладки и для оценки надёжности результата.
  final String provider;

  /// Слово получено выравниванием внутри переведённого предложения, а не
  /// переведено в отрыве от него.
  ///
  /// Разница существенная: без контекста нейронный перевод одиночного слова
  /// ненадёжен, и сервер в этом случае обращается к запасному провайдеру.
  final bool aligned;
}

/// Клиент перевода на сервере Citavuk.
///
/// Перевод вынесен на сервер целиком по трём причинам: ключ DeepL не должен
/// попадать в клиент (его извлекут из APK), кеш переводов общий на всех
/// пользователей, а выбор провайдера зависит от вида запроса и должен меняться
/// без обновления приложения.
class TranslationClient {
  TranslationClient({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  static const _timeout = Duration(seconds: 12);

  Uri _uri(String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$base$path');
  }

  /// Переводит связный фрагмент: фразу, предложение или абзац.
  ///
  /// [source] по умолчанию сербский. Английский нужен для слов-посредников из
  /// учебников: сербский текст объясняют по-английски, и «run» без указания
  /// языка сервер переводил бы как сербское слово.
  Future<TranslationResult?> translate(String text,
      {String source = 'sr'}) async {
    if (text.trim().isEmpty) return null;
    return _post('/v1/translate', {'text': text, 'source': source});
  }

  /// Переводит слово вместе с предложением, в котором оно стоит.
  ///
  /// [start] и [end] — смещения слова в [sentence] в единицах UTF-16, то есть
  /// обычные индексы строки Dart. В байтовые смещения UTF-8, которых ждёт
  /// сервер, они пересчитываются здесь: для кириллицы эти величины не
  /// совпадают, и без пересчёта тегом пометилось бы не то место.
  Future<TranslationResult?> translateInContext({
    required String sentence,
    required int start,
    required int end,
    String source = 'sr',
  }) async {
    if (sentence.isEmpty ||
        start < 0 ||
        end > sentence.length ||
        start >= end) {
      return null;
    }
    return _post('/v1/translate/context', {
      'sentence': sentence,
      'start': utf8ByteOffset(sentence, start),
      'end': utf8ByteOffset(sentence, end),
      'source': source,
    });
  }

  Future<TranslationResult?> _post(
      String path, Map<String, dynamic> body) async {
    try {
      final response = await _client
          .post(
            _uri(path),
            headers: const {'Content-Type': 'application/json; charset=utf-8'},
            body: jsonEncode(body),
          )
          .timeout(_timeout);
      if (response.statusCode != 200) return null;

      final data = jsonDecode(utf8.decode(response.bodyBytes));
      if (data is! Map) return null;

      final text = (data['text'] as String?)?.trim() ?? '';
      final sentence = (data['sentence'] as String?)?.trim();
      if (text.isEmpty && (sentence == null || sentence.isEmpty)) return null;

      return TranslationResult(
        text: text,
        sentence: (sentence?.isEmpty ?? true) ? null : sentence,
        provider: (data['provider'] as String?) ?? '',
        aligned: data['aligned'] == true,
      );
    } catch (_) {
      // Сеть недоступна или сервер не ответил. Вызывающий код обязан иметь
      // запасной путь: приложение работает и офлайн.
      return null;
    }
  }

  void close() => _client.close();
}

/// Пересчитывает индекс строки Dart в смещение в байтах UTF-8.
///
/// Dart индексирует строку в единицах UTF-16: латинская буква занимает одну,
/// кириллическая — тоже одну, но в UTF-8 она весит два байта. Сервер написан на
/// Go, где строка — это байты, поэтому без пересчёта смещение слова в сербском
/// тексте уехало бы примерно вдвое.
int utf8ByteOffset(String text, int utf16Index) {
  if (utf16Index <= 0) return 0;
  final clamped = utf16Index > text.length ? text.length : utf16Index;
  return utf8.encode(text.substring(0, clamped)).length;
}
