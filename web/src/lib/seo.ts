import { useEffect } from 'react';

import { useRouter } from './router';

/**
 * Заголовок, описание и канонический адрес страницы.
 *
 * Одностраничное приложение по умолчанию оставляет всем маршрутам один и тот же
 * `<title>` из index.html. Для человека это путаница во вкладках и в истории, а
 * для поисковика — десяток страниц с одинаковым заголовком, из которых он
 * оставит в выдаче одну.
 *
 * Разметку правим напрямую в DOM, без библиотеки: нужны три тега, и внешняя
 * зависимость ради них не окупается.
 */

const SITE = 'https://citavuk.ru';

export interface Seo {
  title: string;
  description?: string;
  /**
   * Личные разделы закрыты от индексации. Роботу они показываются пустыми — без
   * входа там нечего показать, — и десяток одинаковых пустых экранов делает
   * сайт в глазах поисковика набором страниц ни о чём.
   */
  noindex?: boolean;
  /**
   * Канонический адрес, если он отличается от текущего.
   *
   * Нужен там, где у одной страницы два адреса. Вукоток переехал с
   * `/micro-feed` на `/vukotok`, а прежний адрес остался работать — он разослан
   * в чате и стоит в закладках. Без явного указания оба адреса объявляли бы
   * каноническим себя, и поисковик делил бы вес страницы надвое.
   */
  canonical?: string;
}

function meta(selector: string, attribute: string, value: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    const [name, content] = selector.slice(6, -1).split('=');
    tag.setAttribute(name ?? 'name', (content ?? '').replaceAll('"', ''));
    document.head.append(tag);
  }
  tag.setAttribute(attribute, value);
}

function link(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = rel;
    document.head.append(tag);
  }
  tag.href = href;
}

export function useSeo({ title, description, noindex = false, canonical }: Seo): void {
  const { path } = useRouter();

  useEffect(() => {
    document.title = title;
    meta('meta[property="og:title"]', 'content', title);
    meta('meta[name="twitter:title"]', 'content', title);

    if (description) {
      meta('meta[name="description"]', 'content', description);
      meta('meta[property="og:description"]', 'content', description);
      meta('meta[name="twitter:description"]', 'content', description);
    }

    // Канонический адрес — без строки запроса: /materials?level=fakultet и
    // /materials — одна и та же страница, и делить её вес между двумя адресами
    // незачем.
    const clean = canonical ?? path.split('?')[0] ?? '/';
    link('canonical', `${SITE}${clean}`);
    meta('meta[property="og:url"]', 'content', `${SITE}${clean}`);

    meta(
      'meta[name="robots"]',
      'content',
      noindex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1',
    );
  }, [title, description, noindex, canonical, path]);
}
