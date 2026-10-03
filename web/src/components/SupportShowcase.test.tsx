import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupporterPodium } from './SupportShowcase';
import { StarfallShowcase } from './StarfallShowcase';
import { RouterProvider } from '../lib/router';

describe('supporter podium', () => {
  it('shows the author copy and permanent supporter benefits', () => {
    const html = renderToStaticMarkup(<RouterProvider><StarfallShowcase /></RouterProvider>);
    expect(html).toContain('Я делаю Читавук один и хочу, чтобы учить сербский было проще и интереснее');
    expect(html).toContain('Твоя поддержка помогает оплачивать сервер, перевод и озвучку, исправлять ошибки и выпускать новые возможности');
    expect(html).toContain('рублей вы навсегда получаете статус друга Читавука');
    expect(html).not.toContain('Над холмом горят имена');
    expect(html).not.toContain('Место дня получает');
    expect(html).not.toContain('одной оплатой или несколькими');
  });
  it('handles zero or one supporter without empty podium places', () => {
    expect(renderToStaticMarkup(<SupporterPodium supporters={[]} />)).not.toContain('<li');
    const html = renderToStaticMarkup(<SupporterPodium supporters={[{name:'Ана',since:'2026-09-30',amountKopecks:50000}]} />);
    expect(html.match(/<li /g)).toHaveLength(1);
    expect(html).toContain('height:144px');
    expect(html).toContain('500');
  });
  it('scales contribution and escapes user content', () => {
    const html = renderToStaticMarkup(<SupporterPodium supporters={[{name:'<script>',since:'1',amountKopecks:10000},{name:'Друг',since:'2',amountKopecks:5000}]} />);
    expect(html).toContain('height:106px');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
