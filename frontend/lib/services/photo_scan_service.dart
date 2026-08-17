import 'dart:typed_data';

import 'api_client.dart';

/// Текст со снимка: объявление, вывеска, слова, выписанные в тетрадь.
///
/// Читать по-сербски приходится не только книги, а импорт до сих пор принимал
/// только файл. Здесь кадр уходит на сервер, оттуда возвращается текст, и из
/// него получается обычная книга — с разбором слов, переводом и словарём.
///
/// Распознаёт сервер, а не телефон: сербский пишется двумя письмами, и
/// встроенные распознаватели путают ć, č, đ, š, ž, а рукописное не берут вовсе
/// (см. server/internal/photoscan). Плата за это — снимок работает только в
/// сети и только у вошедшего; распознавание на самом телефоне сняло бы оба
/// условия, но не берёт как раз тетрадь, ради которой всё и затевалось.
class PhotoScanService {
  PhotoScanService({required this.api});

  final ApiClient api;

  /// Включена ли съёмка на сервере.
  ///
  /// Кнопка, которая всегда отвечает отказом, хуже отсутствующей: без ключа к
  /// модели раздел просто не показывается.
  Future<bool> available() async {
    try {
      final data = await api.get('/v1/photo/scan');
      return data is Map && data['available'] == true;
    } on ApiException {
      return false;
    }
  }

  /// Абзацы, распознанные на снимке.
  ///
  /// Пустой список сюда не возвращается: «на снимке нет текста» сервер отдаёт
  /// ошибкой с готовым объяснением для человека.
  Future<List<String>> recognize(
    Uint8List bytes, {
    String filename = 'kadar.jpg',
    String mime = 'image/jpeg',
  }) async {
    final data = await api.postFile(
      '/v1/photo/scan',
      field: 'photo',
      bytes: bytes,
      filename: filename,
      mime: mime,
    );
    final paragraphs = (data as Map)['paragraphs'];
    if (paragraphs is! List) return const [];
    return [
      for (final item in paragraphs)
        if (item is String && item.trim().isNotEmpty) item.trim(),
    ];
  }
}

/// Название книги по её первому абзацу.
///
/// Спрашивать название после каждого кадра утомительно, а «Снимок 17» в
/// библиотеке ничего не говорит. Первая строка объявления или вывески почти
/// всегда и есть его заголовок.
String photoBookTitle(List<String> paragraphs, {String fallback = 'Снимок'}) {
  for (final paragraph in paragraphs) {
    final line = paragraph.split('\n').first.trim();
    if (line.isEmpty) continue;
    return line.length > 60 ? '${line.substring(0, 60).trimRight()}…' : line;
  }
  return fallback;
}
