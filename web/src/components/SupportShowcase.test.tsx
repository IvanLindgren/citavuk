import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupporterPodium, SupportShowcase } from './SupportShowcase';
import { RouterProvider } from '../lib/router';

describe('supporter podium', () => {
  it('shows the approved day-place copy with a line break', () => {
    const html = renderToStaticMarkup(<RouterProvider><SupportShowcase /></RouterProvider>);
    expect(html).toContain('Место дня получает самая большая поддержка за предыдущий день по МСК.\nИмя и сумма показываются с разрешения автора, а сообщение, которое он хотел оставить, после проверки.');
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
