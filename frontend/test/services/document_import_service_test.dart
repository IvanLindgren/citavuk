import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/document_import_service.dart';
import 'package:srbski_read/services/document_parser.dart';

void main() {
  test('мобильный PDF отправляется настоящей multipart-формой через общий API',
      () async {
    var calls = 0;
    final client = ApiClient(
        baseUrl: 'https://example.test/api',
        token: 'fixture-token',
        client: MockClient((request) async {
          calls++;
          expect(request.url.path, '/api/documents/extract');
          expect(request.headers['authorization'], 'Bearer fixture-token');
          expect(request.headers['content-type'],
              startsWith('multipart/form-data'));
          expect(request.body, contains('name="file"; filename="test.pdf"'));
          return http.Response(
              jsonEncode({'text': 'Vuk cita knjigu.\nAlisa vidi zeca.'}), 200);
        }));
    final service = DocumentImportService(client, mobile: true,
        localParser: (name, bytes, progress) async {
      fail(
          'Телефон не должен раскрывать PDF после успешного серверного разбора');
    });
    final paragraphs = await service.parse(
        'test.pdf', Uint8List.fromList([37, 80, 68, 70]), (_) {});
    expect(paragraphs.join(' '), contains('Alisa vidi zeca.'));
    expect(calls, 1);
  });

  for (final large in [false, true]) {
    test(
        'сеть недоступна: ${large ? 'большой PDF не раскрывается в памяти телефона' : 'маленький импортируется локально'}',
        () async {
      final client = ApiClient(
          baseUrl: 'https://example.test',
          client: MockClient((_) async {
            throw http.ClientException('offline');
          }));
      var localCalls = 0;
      final service = DocumentImportService(client, mobile: true,
          localParser: (name, bytes, progress) async {
        localCalls++;
        return ['Vuk cita.'];
      });
      final operation = service.parse(
          'test.pdf', Uint8List(large ? 9 * 1024 * 1024 : 1024), (_) {});
      if (large) {
        await expectLater(operation, throwsA(isA<ApiException>()));
        expect(localCalls, 0);
      } else {
        expect(await operation, ['Vuk cita.']);
        expect(localCalls, 1);
      }
    });
  }

  test('серверный отказ распознавания не превращается в пустую книгу',
      () async {
    final client = ApiClient(
        baseUrl: 'https://example.test',
        client: MockClient((_) async => http.Response.bytes(
            utf8.encode(jsonEncode({'detail': 'В PDF нет текста'})), 422,
            headers: {'content-type': 'application/json; charset=utf-8'})));
    final service = DocumentImportService(client, mobile: true,
        localParser: (name, bytes, progress) async {
      fail('Ошибка содержимого не должна запускать второй разбор');
    });
    await expectLater(service.parse('test.pdf', Uint8List(1024), (_) {}),
        throwsA(isA<ApiException>()));
  });

  test('локальный worker возвращает ошибку повреждённого файла без зависания',
      () async {
    await expectLater(
        DocumentParser.parsePdf(Uint8List.fromList([1, 2, 3]))
            .timeout(const Duration(seconds: 10)),
        throwsA(isNot(isA<TimeoutException>())));
  });

  test('PDF с обтеканием создаётся для проверки настоящего серверного импорта',
      () {
    final document = PdfDocument();
    final page = document.pages.add();
    final font = PdfStandardFont(PdfFontFamily.helvetica, 12);
    for (final (index, text) in [
      'Alisa je sedela pored',
      'svoje sestre i gledala',
      'u knjigu koju je citala.',
      'Zatim je videla zeca.'
    ].indexed) {
      page.graphics.drawString(text, font,
          bounds: Rect.fromLTWH(80, 40 + index * 18, 160, 18));
    }
    final bytes = document.saveSync();
    document.dispose();
    final target = File('../output/anna-book-20261001/followup/pdf-smoke.pdf');
    target.parent.createSync(recursive: true);
    target.writeAsBytesSync(bytes);
    expect(bytes.length, greaterThan(100));
  });
}
