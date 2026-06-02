import 'dart:convert';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:xml/xml.dart' as xml;
import 'package:syncfusion_flutter_pdf/pdf.dart';

class DocumentParser {
  /// Parses PDF bytes and extracts text paragraphs.
  static List<String> parsePdf(Uint8List bytes) {
    final List<String> paragraphs = [];
    try {
      final PdfDocument document = PdfDocument(inputBytes: bytes);
      final PdfTextExtractor extractor = PdfTextExtractor(document);
      final String text = extractor.extractText(layoutText: true);
      document.dispose();

      // Split text by lines, clean up, and group into paragraphs
      final List<String> lines = text.split('\n');
      StringBuffer currentParagraph = StringBuffer();

      for (var line in lines) {
        final cleanLine = line.trim();
        if (cleanLine.isEmpty) {
          if (currentParagraph.isNotEmpty) {
            paragraphs.add(currentParagraph.toString());
            currentParagraph.clear();
          }
        } else {
          if (currentParagraph.isNotEmpty) {
            currentParagraph.write(' ');
          }
          currentParagraph.write(cleanLine);
        }
      }
      
      if (currentParagraph.isNotEmpty) {
        paragraphs.add(currentParagraph.toString());
      }
    } catch (e) {
      // Diagnostic log only on critical failures as per requirements
      print("PDF Parse error: $e");
    }
    
    // If extraction yielded nothing, return a fallback message
    if (paragraphs.isEmpty) {
      paragraphs.add("[Пустой документ или отсутствует текстовый слой]");
    }
    return _splitLong(paragraphs);
  }

  /// Parses DOCX bytes and extracts text paragraphs.
  static List<String> parseDocx(Uint8List bytes) {
    final List<String> paragraphs = [];
    try {
      final archive = ZipDecoder().decodeBytes(bytes);
      final file = archive.findFile('word/document.xml');
      if (file == null) {
        return ["[Ошибка: Файл word/document.xml не найден в DOCX]"];
      }

      final content = file.content;
      final xmlString = utf8.decode(content);
      final document = xml.XmlDocument.parse(xmlString);

      // w:p tags represent paragraphs
      final pElements = document.findAllElements('w:p');

      for (final p in pElements) {
        final paragraphBuffer = StringBuffer();
        
        // Find runs (w:r) within this paragraph to extract text (w:t)
        // This is done linearly to ensure word order and spaces are preserved
        final rElements = p.findAllElements('w:r');
        for (final r in rElements) {
          final tElements = r.findAllElements('w:t');
          for (final t in tElements) {
            paragraphBuffer.write(t.innerText);
          }
        }

        final pText = paragraphBuffer.toString().trim();
        if (pText.isNotEmpty) {
          paragraphs.add(pText);
        }
      }
    } catch (e) {
      print("DOCX Parse error: $e");
    }

    if (paragraphs.isEmpty) {
      paragraphs.add("[Пустой DOCX документ]");
    }
    return _splitLong(paragraphs);
  }

  /// Очень длинные абзацы (частый результат склейки строк из PDF без пустых
  /// строк) режем по границам предложений, чтобы текст читался, а не был
  /// «стеной». Короткие абзацы (нормальная разметка DOCX) не трогаем.
  static List<String> _splitLong(List<String> paragraphs) {
    final out = <String>[];
    final sentenceEnd = RegExp(r'(?<=[.!?…»”"])\s+');
    for (final p in paragraphs) {
      if (p.length <= 500) {
        out.add(p);
        continue;
      }
      final buf = StringBuffer();
      for (final sentence in p.split(sentenceEnd)) {
        if (buf.isNotEmpty) buf.write(' ');
        buf.write(sentence);
        if (buf.length >= 240) {
          out.add(buf.toString());
          buf.clear();
        }
      }
      if (buf.isNotEmpty) out.add(buf.toString());
    }
    return out;
  }
}
