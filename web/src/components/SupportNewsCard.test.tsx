import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RouterProvider } from '../lib/router';
import { SUPPORT_NEWS_COPY, SupportNewsCard } from './SupportNewsCard';

describe('support news on the homepage', () => {
  it('links to the donation page and keeps core features free', () => {
    const html=renderToStaticMarkup(<RouterProvider><SupportNewsCard /></RouterProvider>);
    expect(html).toContain('href="/support"');
    expect(html).toContain('aria-labelledby="support-news-title"');
    expect(html).toContain('Чтение, курс и словарь остаются бесплатными');
    expect(html).toContain('loading="lazy"');
  });
  it('uses the requested punctuation-free copy', () => {
    for(const text of Object.values(SUPPORT_NEWS_COPY))expect(text).not.toMatch(/[.·•—–]|--/);
  });
});
