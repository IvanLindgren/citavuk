import 'package:flutter/material.dart';

import '../models/reader_settings.dart';
import '../utils/tokenizer.dart';
import 'reader_text.dart';

/// Картинки и таблицы книги в читалке.
///
/// Разбор абзаца на блоки живёт в `models/book_block.dart`; здесь только показ.
/// Виджеты вынесены из экрана читалки, потому что тот же список абзацев
/// показывают и общая ссылка, и предпросмотр урока.

/// Иллюстрация из книги.
///
/// Битая ссылка прячет картинку целиком, а не оставляет значок «нет файла»:
/// серый прямоугольник посреди текста читается как поломка приложения, хотя
/// дело в исходном документе или в отсутствии сети.
class BookImageView extends StatelessWidget {
  final String url;
  final String caption;
  final Color textColor;
  final double fontSize;

  const BookImageView({
    super.key,
    required this.url,
    required this.caption,
    required this.textColor,
    required this.fontSize,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              url,
              fit: BoxFit.contain,
              // Высота ограничена: иллюстрация во весь экран выталкивает текст
              // на следующую страницу и рвёт чтение.
              height: MediaQuery.of(context).size.height * 0.5,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return SizedBox(
                  height: 120,
                  child: Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: textColor.withValues(alpha: 0.4),
                    ),
                  ),
                );
              },
            ),
          ),
          if (caption.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                caption,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: fontSize * 0.82,
                  fontStyle: FontStyle.italic,
                  color: textColor.withValues(alpha: 0.7),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
/// Таблица из книги.
///
/// Ячейки остаются разбираемыми: в сербском учебнике таблица — это чаще всего
/// склонение или спряжение, то есть ровно то место, где по слову и хочется
/// нажать.
///
/// Прокрутка своя, а не общая для страницы: широкая таблица иначе увела бы
/// текст за край экрана телефона.
class BookTableView extends StatelessWidget {
  final List<List<String>> rows;
  final ReaderSettings settings;
  final Color textColor;
  final Color highlightColor;
  final Color highlightTextColor;

  /// Какая ячейка сейчас выделена и какой в ней токен. null — ничего.
  final int? selectedCell;
  final int? selectedToken;

  final void Function(int cellIndex, String cellText, int tokenIndex,
      Token token, List<Token> tokens) onTapWord;

  const BookTableView({
    super.key,
    required this.rows,
    required this.settings,
    required this.textColor,
    required this.highlightColor,
    required this.highlightTextColor,
    required this.onTapWord,
    this.selectedCell,
    this.selectedToken,
  });

  @override
  Widget build(BuildContext context) {
    final border = BorderSide(color: textColor.withValues(alpha: 0.25));
    var cellIndex = 0;

    // Table во Flutter требует одинакового числа ячеек в каждом ряду и падает,
    // если их разное. В книжной таблице ряды бывают неровными — объединённые
    // ячейки в исходном документе именно так и выглядят, — поэтому короткие
    // ряды добираются пустыми. Дополняем при показе, а не при разборе: данные
    // должны остаться такими, какими их записал другой клиент.
    final columns = rows.fold<int>(0, (max, row) => row.length > max ? row.length : max);
    if (columns == 0) return const SizedBox.shrink();
    final padded = rows
        .map((row) => [
              ...row,
              ...List<String>.filled(columns - row.length, ''),
            ])
        .toList();

    Widget cell(String text, bool header) {
      final index = cellIndex++;
      final selected = selectedCell == index ? selectedToken : null;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: DefaultTextStyle.merge(
          style: TextStyle(
            fontWeight: header ? FontWeight.w700 : FontWeight.normal,
          ),
          child: ReaderParagraph(
            text: text,
            // Внутри таблицы выключка по ширине и красная строка не нужны:
            // ячейка узкая, и то и другое там выглядит поломкой.
            settings: settings,
            textColor: textColor,
            highlightColor: highlightColor,
            highlightTextColor: highlightTextColor,
            selStart: selected,
            selEnd: selected,
            justify: false,
            firstLineIndent: 0,
            dragToSelect: false,
            onTapWord: (ti, token, tokens) =>
                onTapWord(index, text, ti, token, tokens),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: ConstrainedBox(
          // Узкая таблица не должна растягиваться на всю ширину листа, но и
          // сжиматься в столбик из одной буквы ей тоже нельзя.
          constraints: BoxConstraints(
            minWidth: MediaQuery.of(context).size.width * 0.5,
          ),
          child: Table(
            defaultColumnWidth: const IntrinsicColumnWidth(),
            border: TableBorder(
              horizontalInside: border,
              verticalInside: border,
              top: border,
              bottom: border,
              left: border,
              right: border,
            ),
            children: [
              for (var r = 0; r < padded.length; r++)
                TableRow(
                  children: [
                    for (final text in padded[r]) cell(text, r == 0),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}
