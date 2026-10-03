import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoLang, ENGLISH_ZONES, ROBOT, RUSSIAN_READER } from './i18n';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

describe('язык по умолчанию', () => {
  it('англоязычные страны и Западная Европа получают английский', () => {
    for (const zone of ['America/New_York', 'America/Indiana/Indianapolis', 'America/Toronto', 'Europe/London', 'Europe/Dublin', 'Australia/Sydney', 'Pacific/Auckland', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Stockholm']) {
      expect(autoLang(zone, ['en-US'], CHROME, false), zone).toBe('en');
    }
  });

  it('остальные остаются на русском', () => {
    for (const zone of ['Europe/Moscow', 'Europe/Belgrade', 'Asia/Almaty', 'America/Mexico_City', 'America/Sao_Paulo', 'Europe/Warsaw', '']) {
      expect(autoLang(zone, ['en-US'], CHROME, false), zone).toBe('ru');
    }
  });

  it('русский в языках браузера важнее часового пояса', () => {
    expect(autoLang('Europe/Berlin', ['de-DE', 'ru'], CHROME, false)).toBe('ru');
    expect(autoLang('America/New_York', ['uk-UA'], CHROME, false)).toBe('ru');
    expect(autoLang('Europe/Berlin', ['de-DE', 'en'], CHROME, false)).toBe('en');
  });

  it('роботы и пререндер видят русский оригинал', () => {
    const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    expect(autoLang('America/Los_Angeles', ['en-US'], googlebot, false)).toBe('ru');
    expect(autoLang('America/Los_Angeles', ['en-US'], CHROME.replace('Chrome', 'HeadlessChrome'), false)).toBe('ru');
    expect(autoLang('America/Los_Angeles', ['en-US'], CHROME, true)).toBe('ru');
  });

  it('index.html решает по тем же выражениям, иначе первая отрисовка мигнёт русским', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(`new RegExp('${ENGLISH_ZONES}')`);
    expect(html).toContain(`new RegExp('${RUSSIAN_READER.replace(/\\/g, '\\\\')}', 'i')`);
    expect(html).toContain(`new RegExp('${ROBOT}', 'i')`);
  });
});
