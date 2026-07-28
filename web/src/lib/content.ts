/**
 * Адрес текста книги.
 *
 * Адресуется содержимое, а не исходный файл: одна и та же книга, попавшая в
 * приложение из PDF на одном устройстве и из DOCX на другом, даст разные файлы,
 * но одинаковый разобранный текст — и не будет храниться на сервере дважды.
 *
 * Хешируется НЕ JSON, а абзацы с префиксом длины: «<байт>\n<абзац>» подряд.
 * Причина в том, что адрес считают три реализации на разных языках, а правила
 * экранирования у их сериализаторов расходятся. Go всегда экранирует U+2028 и
 * U+2029 (ради безопасности встраивания в JavaScript), а JSON.stringify и
 * jsonEncode в Dart выводят их как есть. Эти символы встречаются в тексте из
 * Word, и книга с ними не выгрузилась бы вовсе: сервер посчитал бы другой адрес
 * и отверг запрос.
 *
 * Длина обязательна, простого разделителя мало: любой символ-разделитель может
 * встретиться внутри абзаца, и тогда два разных набора абзацев дадут один адрес,
 * а книги перепутаются между собой.
 *
 * Совпадение проверяется одинаковыми наборами примеров во всех трёх местах:
 * content.test.ts, server/internal/store/content_test.go и
 * frontend/test/services/sync_content_test.dart.
 */
export async function contentSha(paragraphs: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const paragraph of paragraphs) {
    const body = encoder.encode(paragraph);
    // Длина — в БАЙТАХ UTF-8, а не в символах: сервер на Go считает её так же,
    // и для кириллицы эти числа различаются вдвое.
    parts.push(encoder.encode(`${body.length}\n`), body);
  }

  let total = 0;
  for (const part of parts) total += part.length;

  const canonical = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    canonical.set(part, offset);
    offset += part.length;
  }

  const digest = await crypto.subtle.digest('SHA-256', canonical);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
