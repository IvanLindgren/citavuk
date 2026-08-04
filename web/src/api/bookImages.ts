import { API_BASE, getToken, request } from './client';

/**
 * Картинки из импортированной книги.
 *
 * Ключ в хранилище считается от содержимого картинки, а не назначается
 * случайно. Это не оптимизация, а требование модели данных: адрес книги при
 * синхронизации считается от её абзацев, а адреса картинок лежат прямо в них.
 * Со случайным ключом одна и та же книга, добавленная на телефоне и на
 * компьютере, получила бы разные адреса картинок, разный адрес содержимого — и
 * превратилась бы в две разные книги вместо одной.
 *
 * Отсюда же следует, что картинки требуют аккаунта. Без него адрес взять
 * неоткуда, а подставить временный и заменить его после входа нельзя: адрес
 * книги посчитан и уже уехал на сервер.
 */

interface UploadPolicy {
  url: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  publicUrl: string;
  /** Такая картинка уже лежит в хранилище — заливать повторно не нужно. */
  uploaded: boolean;
}

/** Сколько картинок берём из одной книги. */
export const MAX_BOOK_IMAGES = 60;

/** Предел размера одной картинки — тот же, что на сервере. */
const MAX_IMAGE_BYTES = 10 << 20;

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Заливает картинку и возвращает её постоянный адрес.
 *
 * Пустая строка означает, что картинку взять не удалось: формат не поддержан,
 * файл слишком велик или хранилище недоступно. Импорт книги из-за этого не
 * прерывается — текст важнее иллюстрации.
 */
export async function uploadBookImage(blob: Blob): Promise<string> {
  if (!SUPPORTED.has(blob.type) || blob.size < 1 || blob.size > MAX_IMAGE_BYTES) {
    return '';
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = await sha256Hex(bytes);

  const policy = await request<UploadPolicy>('/v1/books/media/upload-policy', {
    method: 'POST',
    body: { sha256, mimeType: blob.type, size: blob.size },
  });
  if (policy.uploaded) return policy.publicUrl;

  if (policy.method === 'PUT') {
    const internal = policy.url.startsWith('/');
    const token = internal ? getToken() : null;
    const response = await fetch(internal ? API_BASE + policy.url : policy.url, {
      method: 'PUT',
      headers: {
        ...policy.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
    });
    if (!response.ok) throw new Error(`Хранилище отказало (${response.status}).`);
    return policy.publicUrl;
  }

  const form = new FormData();
  for (const [name, value] of Object.entries(policy.fields ?? {})) {
    form.append(name, value);
  }
  // Файл добавляется последним: подпись политики покрывает поля в том порядке,
  // в котором их ждёт S3, и файл в этом порядке идёт после всех.
  form.append('file', blob);

  const response = await fetch(policy.url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Хранилище отказало (${response.status}).`);
  return policy.publicUrl;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
