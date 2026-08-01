import { useMemo, type CSSProperties } from 'react';
import { LuImage, LuVideo } from 'react-icons/lu';

import type { LessonContent } from '../api/lessons';
import {
  DEFAULT_DOCUMENT_STYLE,
  markdownFromContent,
  parseLessonMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from '../lib/lessonMarkdown';
import { WordReader, type ReaderMark } from './WordReader';

export function MarkdownLesson({ content, className = '' }: { content: LessonContent; className?: string }) {
  const source = markdownFromContent(content);
  const blocks = useMemo(() => parseLessonMarkdown(source), [source]);
  const documentStyle = content.documentStyle ?? DEFAULT_DOCUMENT_STYLE;
  const style: CSSProperties = {
    fontFamily: documentStyle.fontFamily === 'sans' ? 'var(--font-sans)' : 'var(--font-display)',
    fontSize: `${documentStyle.fontSize}px`,
    lineHeight: documentStyle.lineHeight,
  };

  if (blocks.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--text-muted)]">Материал пока пуст.</p>;
  }

  return (
    <div className={`lesson-markdown space-y-6 ${className}`} style={style}>
      {blocks.map((block) => <MarkdownBlockView key={block.id} block={block} />)}
    </div>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.type === 'paragraph') {
    return <InteractiveInline content={block.content} className="leading-[inherit]" />;
  }
  if (block.type === 'heading') {
    const size = block.depth === 1 ? 'text-4xl' : block.depth === 2 ? 'text-3xl' : 'text-2xl';
    return (
      <div role="heading" aria-level={Math.min(6, block.depth)} className="pt-3">
        <InteractiveInline content={block.content} className={`font-display font-bold leading-tight ${size}`} />
      </div>
    );
  }
  if (block.type === 'quote') {
    return (
      <blockquote className="border-l-3 border-[var(--accent)] py-1 pl-5 text-[var(--text-muted)] italic">
        <InteractiveInline content={block.content} className="leading-[inherit]" />
      </blockquote>
    );
  }
  if (block.type === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag className={`${block.ordered ? 'list-decimal' : 'list-disc'} space-y-2 pl-7 marker:text-[var(--accent)]`}>
        {block.items.map((item, index) => (
          <li key={index}><InteractiveInline content={item} className="leading-[inherit]" /></li>
        ))}
      </Tag>
    );
  }
  if (block.type === 'table') {
    return (
      <div className="overflow-x-auto rounded-md border border-[var(--line)]">
        <table className="w-full min-w-[24rem] border-collapse text-left text-[0.92em]">
          <thead className="bg-[var(--bg-sunken)]/70">
            <tr>{block.header.map((cell, index) => <th key={index} className="border-b border-r border-[var(--line)] px-4 py-3 last:border-r-0"><InteractiveInline content={cell} className="font-sans font-bold leading-6" /></th>)}</tr>
          </thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--bg-sunken)]/35">{row.map((cell, index) => <td key={index} className="border-r border-[var(--line)] px-4 py-3 align-top last:border-r-0"><InteractiveInline content={cell} className="leading-6" /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  }
  if (block.type === 'image') {
    return block.url
      ? <figure><img src={block.url} alt={block.alt} className="max-h-[38rem] w-full rounded-md object-contain" />{block.caption && <figcaption className="mt-2 text-center font-sans text-sm text-[var(--text-muted)]">{block.caption}</figcaption>}</figure>
      : <EmptyMedia icon={<LuImage />} text="Добавьте ссылку или загрузите изображение" />;
  }
  if (block.type === 'video') {
    const embed = videoEmbedURL(block.url);
    return embed
      ? <div className="aspect-video overflow-hidden rounded-md bg-black"><iframe src={embed} title={block.title ?? 'Видео урока'} className="size-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>
      : <EmptyMedia icon={<LuVideo />} text="Ссылка на видео не распознана" />;
  }
  if (block.type === 'code') {
    return <pre className="overflow-x-auto rounded-md bg-[var(--bg-sunken)] p-4 font-mono text-sm leading-6"><code>{block.text}</code></pre>;
  }
  return <hr className="my-8 border-[var(--line)]" />;
}

function InteractiveInline({ content, className }: { content: MarkdownInline; className: string }) {
  return (
    <WordReader
      paragraphs={[content.text]}
      paragraphClassName={className}
      paragraphMarks={[content.marks as ReaderMark[]]}
      paragraphStyle={{ whiteSpace: 'pre-line' }}
    />
  );
}

function EmptyMedia({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="grid min-h-44 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--bg-sunken)]/35 text-center text-sm text-[var(--text-muted)]"><div>{<span className="mx-auto mb-2 block w-fit text-2xl">{icon}</span>}{text}</div></div>;
}

export function videoEmbedURL(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' && parts[0]) return `https://www.youtube-nocookie.com/embed/${parts[0]}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = url.searchParams.get('v') ?? ((parts[0] === 'shorts' || parts[0] === 'embed') ? parts[1] : null);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if ((host === 'vimeo.com' || host === 'player.vimeo.com') && parts.at(-1)) return `https://player.vimeo.com/video/${parts.at(-1)}`;
    if (host === 'rutube.ru') {
      const index = parts.indexOf('video');
      return index >= 0 && parts[index + 1] ? `https://rutube.ru/play/embed/${parts[index + 1]}` : null;
    }
    if (host === 'vk.com' || host === 'vkvideo.ru' || host === 'm.vk.com') {
      const match = parts.at(-1)?.match(/^video(-?\d+)_(\d+)/);
      return match?.[1] && match[2]
        ? `https://vk.com/video_ext.php?oid=${encodeURIComponent(match[1])}&id=${encodeURIComponent(match[2])}&hd=2`
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
