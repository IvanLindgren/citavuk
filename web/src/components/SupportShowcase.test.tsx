import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupporterPodium } from './SupportShowcase';

describe('supporter podium', () => {
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
