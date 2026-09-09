import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { type BionicLevel } from '../lib/readerSettings';
import { accentWord, stressIndex, type StressTable } from '../lib/stress';
import { tokenize, type Token } from '../lib/tokenize';
import { bionicSplit, shouldOpenWord, wordPieces } from '../lib/wordReaderUtils';
import type { ReaderMark } from '../lib/wordReaderTypes';

/** Иллюстрация из книги: битая ссылка скрывает блок целиком. */
export function BookImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure className="my-[var(--reader-gap)]">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl"
      />
      {alt && (
        <figcaption className="mt-2 text-center text-sm italic opacity-70">
          {alt}
        </figcaption>
      )}
    </figure>
  );
}

/** Таблица с тем же обработчиком слов, что и обычный абзац. */
export function BookTable({
  rows,
  bionic,
  stress,
  style,
  selectedCell,
  selectedStart,
  cliticStart,
  onSelect,
}: {
  rows: string[][];
  bionic: BionicLevel;
  stress: StressTable | null;
  style?: CSSProperties;
  selectedCell: number | null;
  selectedStart: number | null;
  cliticStart: number | null;
  onSelect: (cellIndex: number, cellText: string, token: Token, anchor: DOMRect) => void;
}) {
  const [header, ...body] = rows;
  let cellIndex = 0;
  const cell = (text: string, index: number) => (
    <Paragraph
      text={text}
      bionic={bionic}
      stress={stress}
      className=""
      marks={[]}
      selectedStart={selectedCell === index ? selectedStart : null}
      cliticStart={selectedCell === index ? cliticStart : null}
      onSelect={(token, rect) => onSelect(index, text, token, rect)}
    />
  );

  return (
    <div
      className="my-[var(--reader-gap)] overflow-x-auto"
      style={style}
      tabIndex={0}
      role="group"
      aria-label="Таблица из книги"
    >
      <table className="w-full border-collapse text-[0.92em]">
        {header && <thead><tr>{header.map((text) => {
          const index = cellIndex++;
          return <th key={index} scope="col" className="border border-current/20 px-3 py-2 text-left align-top font-semibold">{cell(text, index)}</th>;
        })}</tr></thead>}
        <tbody>{body.map((row, rowIndex) => (
          <tr key={rowIndex}>{row.map((text) => {
            const index = cellIndex++;
            return <td key={index} className="border border-current/20 px-3 py-2 align-top">{cell(text, index)}</td>;
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function Paragraph({
  text, selectedStart, cliticStart, onSelect, bionic, stress, className, style, marks,
}: {
  text: string;
  selectedStart: number | null;
  cliticStart: number | null;
  onSelect: (token: Token, anchor: DOMRect) => void;
  bionic: BionicLevel;
  stress: StressTable | null;
  className: string;
  style?: CSSProperties;
  marks: ReaderMark[];
}) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const activate = (token: Token, element: HTMLElement) => {
    if (!shouldOpenWord(window.getSelection())) return;
    onSelect(token, element.getBoundingClientRect());
  };
  return (
    <p className={className || 'reader-selectable font-display text-lg leading-relaxed sm:text-xl sm:leading-[1.85]'} style={style}>
      {tokens.map((token, index) => token.isWord ? (
        <span
          key={index}
          onClick={(event) => activate(token, event.currentTarget)}
          role="button"
          tabIndex={0}
          aria-label={`Разобрать слово «${token.text}»`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activate(token, event.currentTarget);
            }
          }}
          data-reader-word
          className={[
            'reader-word transition-colors duration-150',
            'hover:bg-gold/35',
            'focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
            selectedStart === token.start ? 'bg-gold/55 text-[var(--text)] shadow-[inset_0_-2px_0_0_var(--accent)]' : '',
            cliticStart === token.start ? 'bg-gold/30 text-[var(--text)] shadow-[inset_0_-2px_0_0_var(--accent)]' : '',
          ].join(' ')}
        >
          {marks.length > 0 ? <MarkedToken text={text} token={token} marks={marks} /> : <ReadableWord text={token.text} bionic={bionic} stress={stress} />}
        </span>
      ) : <span key={index}>{marks.length > 0 ? <MarkedToken text={text} token={token} marks={marks} /> : token.text}</span>)}
    </p>
  );
}

function MarkedToken({ text, token, marks }: { text: string; token: Token; marks: ReaderMark[] }) {
  const boundaries = new Set([token.start, token.end]);
  for (const mark of marks) {
    if (mark.start > token.start && mark.start < token.end) boundaries.add(mark.start);
    if (mark.end > token.start && mark.end < token.end) boundaries.add(mark.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const pieces: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined || start >= end) continue;
    const active = marks.filter((mark) => mark.start <= start && mark.end >= end);
    const value = text.slice(start, end);
    const style: CSSProperties = {};
    const classes: string[] = [];
    let href: string | undefined;
    for (const mark of active) {
      if (mark.kind === 'strong') style.fontWeight = 700;
      if (mark.kind === 'emphasis') style.fontStyle = 'italic';
      if (mark.kind === 'strike') style.textDecoration = 'line-through';
      if (mark.kind === 'font') style.fontFamily = mark.value === 'sans' ? 'var(--font-sans)' : 'var(--font-display)';
      if (mark.kind === 'size' && mark.value) style.fontSize = `${mark.value}px`;
      if (mark.kind === 'code') classes.push('rounded bg-[var(--bg-sunken)] px-1 py-0.5 font-mono text-[0.9em]');
      if (mark.kind === 'audio') classes.push('rounded bg-[var(--accent)] px-0.5 text-white');
      if (mark.kind === 'link') href = mark.value;
    }
    const key = `${start}-${end}`;
    pieces.push(href
      ? <a key={key} href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline decoration-1 underline-offset-2" style={style} onClick={(event) => event.stopPropagation()}>{value}</a>
      : <span key={key} className={classes.join(' ')} style={style}>{value}</span>);
  }
  return <>{pieces}</>;
}

function ReadableWord({ text, bionic, stress }: { text: string; bionic: BionicLevel; stress: StressTable | null }) {
  const at = stress ? stressIndex(text, stress) : null;
  const [head] = bionicSplit(text, bionic);
  const headLength = bionic > 0 ? [...head].length : 0;
  if (headLength === 0 && at === null) return <>{text}</>;
  if (headLength === 0 && at !== null) return <>{accentWord(text, at)}</>;
  return <>{wordPieces(text, headLength, at).map((piece, index) => {
    const content = piece.stress ? accentWord(piece.text, 0) : piece.text;
    return piece.bold ? <b key={index} className="font-bold">{content}</b> : <Fragment key={index}>{content}</Fragment>;
  })}</>;
}
