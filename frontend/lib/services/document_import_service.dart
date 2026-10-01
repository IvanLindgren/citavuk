import 'package:flutter/foundation.dart';
import '../utils/reflow.dart';
import 'api_client.dart';
import 'document_parser.dart';

typedef LocalDocumentParser = Future<List<String>> Function(
    String name, Uint8List bytes, void Function(double) onProgress);

/// Большой PDF разбирается вне телефона; небольшой доступен и без сети.
class DocumentImportService {
  DocumentImportService(this.api,
      {LocalDocumentParser? localParser, bool? mobile})
      : _local = localParser ?? DocumentParser.parseAny,
        _mobile = mobile ??
            (!kIsWeb &&
                (defaultTargetPlatform == TargetPlatform.android ||
                    defaultTargetPlatform == TargetPlatform.iOS));

  final ApiClient api;
  final LocalDocumentParser _local;
  final bool _mobile;
  static const maxFileBytes = 48 * 1024 * 1024;
  static const maxServerBytes = 32 * 1024 * 1024;
  static const maxOfflinePdfBytes = 8 * 1024 * 1024;

  Future<List<String>> parse(
      String name, Uint8List bytes, void Function(double) progress) async {
    if (bytes.isEmpty) throw const FormatException('Файл пуст');
    if (bytes.length > maxFileBytes) {
      throw const FormatException('Книга больше 48 МБ Выбери файл поменьше');
    }
    final pdf = name.toLowerCase().endsWith('.pdf');
    if (!_mobile || !pdf) return _local(name, bytes, progress);
    if (bytes.length > maxServerBytes) {
      throw const FormatException(
          'Для импорта на телефоне выбери PDF до 32 МБ или добавь книгу через браузер');
    }
    progress(0.05);
    try {
      final result = await api.postFile('/documents/extract',
          field: 'file',
          bytes: bytes,
          filename: name,
          mime: 'application/pdf',
          timeout: const Duration(minutes: 6));
      if (result is! Map ||
          result['text'] is! String ||
          (result['text'] as String).trim().isEmpty) {
        throw const FormatException('В PDF не нашлось текста');
      }
      final text = result['text'] as String;
      // Сервер уже отделил страницы; повторяющиеся реплики книги не являются
      // колонтитулами и не должны пропадать при повторной эвристике.
      final paragraphs = splitLongParagraphs(
          reflowLines(text.replaceAll('\r\n', '\n').split('\n')));
      if (paragraphs.isEmpty) {
        throw const FormatException('В PDF не нашлось текста');
      }
      progress(1);
      return paragraphs;
    } on ApiException catch (error) {
      if ([400, 413, 422].contains(error.status)) rethrow;
      if (bytes.length > maxOfflinePdfBytes) {
        throw ApiException.offline(
            'Не удалось загрузить книгу для разбора Проверь связь и попробуй снова');
      }
      return _local(name, bytes, progress);
    }
  }
}
