import { Marked, type Token, type Tokens } from 'marked';

import type { LessonContent, TheoryBlock } from '../api/lessons';

export type MarkdownMarkKind =
  | 'strong'
  | 'emphasis'
  | 'strike'
  | 'code'
  | 'link'
  | 'font'
  | 'size';

export interface MarkdownMark {
  start: number;
  end: number;
  kind: MarkdownMarkKind;
  value?: string;
}

export interface MarkdownInline {
  text: string;
  marks: MarkdownMark[];
}

export type MarkdownBlock =
  | { id: string; type: 'paragraph'; content: MarkdownInline }
  | { id: string; type: 'heading'; depth: number; content: MarkdownInline }
  | { id: string; type: 'quote'; content: MarkdownInline }
  | { id: string; type: 'list'; ordered: boolean; items: MarkdownInline[] }
  | { id: string; type: 'table'; header: MarkdownInline[]; rows: MarkdownInline[][] }
  | { id: string; type: 'image'; url: string; alt: string; caption?: string }
  | { id: string; type: 'video'; url: string; title?: string }
  | { id: string; type: 'code'; language?: string; text: string }
  | { id: string; type: 'divider' };

const styleExtension = {
  name: 'lessonStyle',
  level: 'inline' as const,
  start(source: string) {
    const size = source.indexOf('{size=');
    const font = source.indexOf('{font=');
    if (size < 0) return font < 0 ? undefined : font;
    if (font < 0) return size;
    return Math.min(size, font);
  },
  tokenizer(this: { lexer: { inlineTokens: (source: string) => Token[] } }, source: string) {
    const match = /^\{(size|font)=([^}]+)\}([\s\S]+?)\{\/\1\}/.exec(source);
    if (!match?.[1] || match[2] === undefined || match[3] === undefined) return undefined;
    return {
      type: 'lessonStyle',
      raw: match[0],
      styleKind: match[1],
      styleValue: match[2],
      tokens: this.lexer.inlineTokens(match[3]),
    };
  },
  childTokens: ['tokens'],
};

const markdown = new Marked({
  gfm: true,
  breaks: false,
  extensions: [styleExtension],
});

export const DEFAULT_DOCUMENT_STYLE: NonNullable<LessonContent['documentStyle']> = {
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.75,
};

export function parseLessonMarkdown(source: string): MarkdownBlock[] {
  const tokens = markdown.lexer(source);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  for (const token of tokens) {
    const id = `markdown-${index++}`;
    if (token.type === 'space' || token.type === 'def') continue;

    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      blocks.push({ id, type: 'heading', depth: heading.depth, content: inline(heading.tokens) });
      continue;
    }
    if (token.type === 'paragraph') {
      const paragraph = token as Tokens.Paragraph;
      const video = parseVideoDirective(paragraph.raw.trim());
      if (video) {
        blocks.push({ id, type: 'video', ...video });
        continue;
      }
      const image = onlyImage(paragraph.tokens);
      if (image) {
        blocks.push({
          id,
          type: 'image',
          url: image.href,
          alt: image.text,
          caption: image.title ?? undefined,
        });
        continue;
      }
      blocks.push({ id, type: 'paragraph', content: inline(paragraph.tokens) });
      continue;
    }
    if (token.type === 'blockquote') {
      const quote = token as Tokens.Blockquote;
      blocks.push({ id, type: 'quote', content: inline(blockInlineTokens(quote.tokens)) });
      continue;
    }
    if (token.type === 'list') {
      const list = token as Tokens.List;
      blocks.push({
        id,
        type: 'list',
        ordered: list.ordered,
        items: list.items.map((item) => inline(blockInlineTokens(item.tokens))),
      });
      continue;
    }
    if (token.type === 'table') {
      const table = token as Tokens.Table;
      blocks.push({
        id,
        type: 'table',
        header: table.header.map((cell) => inline(cell.tokens)),
        rows: table.rows.map((row) => row.map((cell) => inline(cell.tokens))),
      });
      continue;
    }
    if (token.type === 'code') {
      const code = token as Tokens.Code;
      blocks.push({ id, type: 'code', language: code.lang, text: code.text });
      continue;
    }
    if (token.type === 'hr') {
      blocks.push({ id, type: 'divider' });
      continue;
    }

    const fallback = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
    if (fallback.trim()) {
      blocks.push({ id, type: 'paragraph', content: { text: fallback, marks: [] } });
    }
  }
  return blocks;
}

export function markdownFromContent(content: LessonContent): string {
  if (content.markdown !== undefined) return content.markdown;
  return theoryToMarkdown(content.theory);
}

export function theoryToMarkdown(blocks: TheoryBlock[]): string {
  return blocks.map((block) => {
    if ('text' in block) {
      if (block.type === 'heading') return `## ${block.text}`;
      if (block.type === 'quote') return block.text.split('\n').map((line) => `> ${line}`).join('\n');
      return block.text;
    }
    if (block.type === 'image') {
      const title = block.caption ? ` "${block.caption.replaceAll('"', '\\"')}"` : '';
      return `![${block.alt}](${block.url}${title})`;
    }
    if (block.type === 'video') return `@[video](${block.url}${block.title ? ` "${block.title}"` : ''})`;
    if (block.type === 'list') {
      return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${item}`).join('\n');
    }
    return tableMarkdown(block.rows);
  }).join('\n\n');
}

export function markdownToTheory(source: string): TheoryBlock[] {
  const blocks: TheoryBlock[] = [];
  for (const block of parseLessonMarkdown(source)) {
    const id = crypto.randomUUID();
    if (block.type === 'paragraph' || block.type === 'quote') {
      blocks.push({ id, type: block.type, text: block.content.text });
    } else if (block.type === 'heading') {
      blocks.push({ id, type: 'heading', text: block.content.text });
    } else if (block.type === 'list') {
      blocks.push({ id, type: 'list', ordered: block.ordered, items: block.items.map((item) => item.text) });
    } else if (block.type === 'table') {
      blocks.push({ id, type: 'table', rows: [block.header, ...block.rows].map((row) => row.map((cell) => cell.text)) });
    } else if (block.type === 'image') {
      blocks.push({ id, type: 'image', url: block.url, alt: block.alt, caption: block.caption });
    } else if (block.type === 'video') {
      blocks.push({ id, type: 'video', url: block.url, title: block.title });
    } else if (block.type === 'code') {
      blocks.push({ id, type: 'quote', text: block.text });
    }
  }
  return blocks.length > 0
    ? blocks
    : [{ id: crypto.randomUUID(), type: 'paragraph', text: '' }];
}

export function tableMarkdown(rows: string[][]): string {
  const width = Math.max(2, ...rows.map((row) => row.length));
  const normalized = rows.length > 0 ? rows : [Array.from({ length: width }, () => '')];
  const header = normalized[0] ?? [];
  const body = normalized.slice(1);
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, i) => escapeCell(row[i] ?? '')).join(' | ')} |`;
  return [
    line(header),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map(line),
  ].join('\n');
}

export function plainMarkdownLength(source: string): number {
  return parseLessonMarkdown(source).reduce((sum, block) => {
    if ('content' in block) return sum + block.content.text.length;
    if (block.type === 'list') return sum + block.items.reduce((value, item) => value + item.text.length, 0);
    if (block.type === 'table') return sum + [...block.header, ...block.rows.flat()].reduce((value, cell) => value + cell.text.length, 0);
    if (block.type === 'image') return sum + block.alt.length + (block.caption?.length ?? 0);
    if (block.type === 'code') return sum + block.text.length;
    return sum;
  }, 0);
}

function inline(tokens: Token[]): MarkdownInline {
  const result: MarkdownInline = { text: '', marks: [] };
  appendInline(tokens, result);
  return result;
}

function appendInline(tokens: Token[], result: MarkdownInline) {
  for (const token of tokens) {
    if (token.type === 'text' || token.type === 'escape') {
      if (token.type === 'text' && token.tokens?.length) appendInline(token.tokens, result);
      else result.text += token.text;
      continue;
    }
    if (token.type === 'br') {
      result.text += '\n';
      continue;
    }
    if (token.type === 'codespan') {
      appendMarkedText((token as Tokens.Codespan).text, 'code', undefined, result);
      continue;
    }
    if (token.type === 'image') {
      result.text += (token as Tokens.Image).text;
      continue;
    }
    if (token.type === 'strong' || token.type === 'em' || token.type === 'del' || token.type === 'link') {
      const kind = token.type === 'strong'
        ? 'strong'
        : token.type === 'em'
          ? 'emphasis'
          : token.type === 'del'
            ? 'strike'
            : 'link';
      const markedToken = token as Tokens.Strong | Tokens.Em | Tokens.Del | Tokens.Link;
      appendMarkedTokens(markedToken.tokens, kind, token.type === 'link' ? safeURL((token as Tokens.Link).href) : undefined, result);
      continue;
    }
    if (token.type === 'lessonStyle') {
      const styleKind = token.styleKind === 'font' ? 'font' : 'size';
      const value = sanitizeStyleValue(styleKind, String(token.styleValue ?? ''));
      appendMarkedTokens(token.tokens ?? [], styleKind, value, result);
      continue;
    }
    if (token.type === 'html') {
      result.text += token.text.replace(/<[^>]*>/g, '');
      continue;
    }
    if ('tokens' in token && Array.isArray(token.tokens)) appendInline(token.tokens, result);
  }
}

function appendMarkedTokens(tokens: Token[], kind: MarkdownMarkKind, value: string | undefined, result: MarkdownInline) {
  const start = result.text.length;
  appendInline(tokens, result);
  if (result.text.length > start && (kind !== 'link' || value)) {
    result.marks.push({ start, end: result.text.length, kind, value });
  }
}

function appendMarkedText(text: string, kind: MarkdownMarkKind, value: string | undefined, result: MarkdownInline) {
  const start = result.text.length;
  result.text += text;
  result.marks.push({ start, end: result.text.length, kind, value });
}

function blockInlineTokens(tokens: Token[]): Token[] {
  return tokens.flatMap((token) => {
    if (token.type === 'paragraph' || token.type === 'text') {
      return 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : [token];
    }
    if (token.type === 'space') return [];
    return 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : [token];
  });
}

function onlyImage(tokens: Token[]): Tokens.Image | null {
  const meaningful = tokens.filter((token) => token.raw.trim().length > 0);
  return meaningful.length === 1 && meaningful[0]?.type === 'image'
    ? meaningful[0] as Tokens.Image
    : null;
}

function parseVideoDirective(raw: string): { url: string; title?: string } | null {
  const match = /^@\[video\]\((https:\/\/[^\s)]+)(?:\s+["']([^"']+)["'])?\)$/.exec(raw);
  if (!match?.[1]) return null;
  return { url: match[1], title: match[2] };
}

function sanitizeStyleValue(kind: 'font' | 'size', value: string): string | undefined {
  if (kind === 'font') return value === 'sans' || value === 'serif' ? value : undefined;
  const size = Number(value);
  return Number.isFinite(size) ? String(Math.min(32, Math.max(14, Math.round(size)))) : undefined;
}

function safeURL(raw: string): string | undefined {
  try {
    const url = new URL(raw, location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ').trim();
}
