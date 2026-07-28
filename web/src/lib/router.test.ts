import { describe, expect, it } from 'vitest';

import { matchPath } from './router';

describe('сопоставление маршрута', () => {
  it('совпадает с точным путём', () => {
    expect(matchPath('/library', '/library')).toEqual({});
    expect(matchPath('/', '/')).toEqual({});
  });

  it('не совпадает с чужим путём', () => {
    expect(matchPath('/library', '/course')).toBeNull();
    // Лишний сегмент — другой маршрут, иначе «/library» перехватил бы
    // «/library/42» и вложенная страница никогда бы не открылась.
    expect(matchPath('/library', '/library/42')).toBeNull();
    expect(matchPath('/reader/:id', '/reader')).toBeNull();
  });

  it('достаёт параметр из пути', () => {
    expect(matchPath('/reader/:id', '/reader/42')).toEqual({ id: '42' });
    expect(matchPath('/reader/:id', '/reader/abc-def')).toEqual({ id: 'abc-def' });
  });

  it('раскодирует кириллицу в параметре', () => {
    const encoded = `/reader/${encodeURIComponent('Мали принц')}`;
    expect(matchPath('/reader/:id', encoded)).toEqual({ id: 'Мали принц' });
  });

  it('игнорирует строку запроса', () => {
    expect(matchPath('/login', '/login?mode=register')).toEqual({});
    expect(matchPath('/reader/:id', '/reader/7?page=3')).toEqual({ id: '7' });
  });

  it('перехватывающий шаблон ловит остальное', () => {
    expect(matchPath('/*', '/такого-нет')).toEqual({});
    expect(matchPath('/*', '/a/b/c')).toEqual({});
    expect(matchPath('/*', '/')).toEqual({});
  });

  it('не путает похожие сегменты', () => {
    expect(matchPath('/course', '/courses')).toBeNull();
    expect(matchPath('/reader/:id', '/writer/42')).toBeNull();
  });

  it('терпит хвостовой слеш', () => {
    // Пустые сегменты отбрасываются, поэтому «/library/» — тот же маршрут.
    expect(matchPath('/library', '/library/')).toEqual({});
  });
});
