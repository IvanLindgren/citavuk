import { useEffect, useMemo, useRef, useState } from 'react';
import { LuCheck, LuPlus, LuVolume2, LuX } from 'react-icons/lu';

import { ttsAudioUrl } from '../api/listening';
import { saveVocabularyWord } from '../lib/vocabulary';
import { useSync } from '../state/sync';
import { inScript, type Script } from '../travel/content';
import { PlaceIcon } from '../travel/icons';
import type { PlaceContent, PlaceDialogue, PlaceKind, Phrase } from '../travel/types';

/**
 * Что говорят в выбранном месте: слова, фразы и разговор целиком.
 *
 * Сербское всегда хранится кириллицей и переводится в латиницу на показе —
 * обратно не переводится, потому что `nj` из «конј» и «инјекција» уже не
 * различить.
 */

type Tab = 'words' | 'phrases' | 'dialogue';

interface Props {
  title: string;
  /** Заголовок — сербское название и его тоже нужно переводить в латиницу. */
  titleSerbian: boolean;
  kind: PlaceKind;
  /** Разметка значка этого типа места. */
  icon: string;
  content: PlaceContent;
  script: Script;
  onClose: () => void;
}

export function PlaceSheet({
  title,
  titleSerbian,
  kind,
  icon,
  content,
  script,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('words');
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setTab('words');
  }, [content]);

  useEffect(() => () => audio.current?.pause(), []);

  const speak = (text: string) => {
    audio.current?.pause();
    // Озвучка всегда кириллицей: латиница у синтезатора читается по-английски.
    const player = new Audio(ttsAudioUrl(text));
    audio.current = player;
    void player.play().catch(() => {
      // Автовоспроизведение может быть запрещено до первого касания страницы.
    });
  };

  const tabs: Array<[Tab, string]> = [
    ['words', 'Слова'],
    ['phrases', 'Фразы'],
  ];
  if (content.dialogue) tabs.push(['dialogue', 'Разговор']);

  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[74dvh] flex-col rounded-t-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[27rem] sm:max-h-none sm:rounded-l-3xl sm:rounded-tr-none"
      aria-label={`Место: ${kind.ru}`}
    >
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <PlaceIcon body={icon} className="mt-0.5 size-8 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">
            {titleSerbian ? inScript(title, script) : title}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {inScript(kind.sr, script)} — {kind.ru}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
        >
          <LuX className="size-5" />
        </button>
      </header>

      <p className="border-b border-[var(--line)] bg-[var(--bg-sunken)] px-5 py-3 text-sm text-[var(--text-muted)]">
        {content.hint}
      </p>

      <nav className="flex gap-1 border-b border-[var(--line)] px-3 py-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'rounded-xl px-4 py-2 text-sm font-semibold transition-colors',
              tab === id
                ? 'bg-[var(--accent)] text-parchment'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === 'dialogue' && content.dialogue ? (
          <Dialogue dialogue={content.dialogue} script={script} onSpeak={speak} />
        ) : (
          <ul className="flex flex-col gap-2">
            {(tab === 'words' ? content.words : content.phrases).map((item) => (
              <Row
                key={item.sr}
                item={item}
                place={kind.sr}
                script={script}
                collectable={tab === 'words'}
                onSpeak={speak}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/**
 * Строка списка: слово или фраза.
 *
 * У слова есть ещё и «плюс» — оно уходит в личный словарь вместе с местом, в
 * котором встретилось: «џезва» без пометки «сувенирница» через неделю уже ни о
 * чём не говорит.
 */
function Row({
  item,
  place,
  script,
  collectable,
  onSpeak,
}: {
  item: Phrase;
  place: string;
  script: Script;
  collectable: boolean;
  onSpeak: (text: string) => void;
}) {
  const { sync } = useSync();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSaved(false);
  }, [item.sr]);

  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await saveVocabularyWord({
        word: item.sr,
        lemma: item.sr,
        translation: item.ru,
        forms: { где: place, источник: 'Путешествие по Сербии' },
      });
      setSaved(true);
      void sync();
    } catch {
      // Слово можно добавить ещё раз: кнопка остаётся живой.
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-start gap-1 rounded-2xl bg-[var(--bg-sunken)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{inScript(item.sr, script)}</p>
        <p className="text-sm text-[var(--text-muted)]">{item.ru}</p>
      </div>
      <button
        type="button"
        onClick={() => onSpeak(item.sr)}
        aria-label={`Произнести: ${item.sr}`}
        className="rounded-full p-2 text-[var(--accent)] hover:bg-[var(--bg-raised)]"
      >
        <LuVolume2 className="size-5" />
      </button>
      {collectable && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || saved}
          aria-label={saved ? `${item.sr} уже в словаре` : `Добавить в словарь: ${item.sr}`}
          className="rounded-full p-2 text-[var(--accent)] hover:bg-[var(--bg-raised)] disabled:text-[var(--text-muted)]"
        >
          {saved ? <LuCheck className="size-5" /> : <LuPlus className="size-5" />}
        </button>
      )}
    </li>
  );
}

interface Line {
  speaker: string;
  text: string;
  mine: boolean;
}

/**
 * Разговор с продавцом целиком: реплика — выбор — ответ.
 *
 * Устроен как диалоги курса: тот же `startNodeId` и переходы по `next`. Ветка
 * без продолжения — это зависший экран, поэтому связность проверяется тестом
 * `src/travel/content.test.ts`, а не здесь.
 */
function Dialogue({
  dialogue,
  script,
  onSpeak,
}: {
  dialogue: PlaceDialogue;
  script: Script;
  onSpeak: (text: string) => void;
}) {
  const nodes = useMemo(
    () => new Map(dialogue.nodes.map((node) => [node.id, node])),
    [dialogue],
  );
  const [current, setCurrent] = useState(dialogue.startNodeId);
  const [said, setSaid] = useState<Line[]>([]);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrent(dialogue.startNodeId);
    setSaid([]);
  }, [dialogue]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [said, current]);

  const node = nodes.get(current);
  if (!node) return null;

  const restart = () => {
    setSaid([]);
    setCurrent(dialogue.startNodeId);
  };

  return (
    <div className="flex flex-col gap-3">
      {[...said, { speaker: node.speaker, text: node.text, mine: false }].map((line, index) => (
        <div
          key={`${index}-${line.text}`}
          className={[
            'max-w-[85%] rounded-2xl px-4 py-2',
            line.mine
              ? 'self-end bg-[var(--accent)] text-parchment'
              : 'self-start bg-[var(--bg-sunken)]',
          ].join(' ')}
        >
          <p className="text-xs opacity-70">{inScript(line.speaker, script)}</p>
          <p className="mt-0.5">{inScript(line.text, script)}</p>
          {!line.mine && (
            <button
              type="button"
              onClick={() => onSpeak(line.text)}
              aria-label={`Произнести: ${line.text}`}
              className="mt-1 text-[var(--accent)]"
            >
              <LuVolume2 className="size-4" />
            </button>
          )}
        </div>
      ))}

      {node.end ? (
        <button
          type="button"
          onClick={restart}
          className="self-start rounded-xl bg-[var(--bg-sunken)] px-4 py-2 text-sm font-semibold hover:bg-[var(--accent)] hover:text-parchment"
        >
          Ещё раз
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {(node.choices ?? []).map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => {
                setSaid((lines) => [
                  ...lines,
                  { speaker: node.speaker, text: node.text, mine: false },
                  { speaker: dialogue.participants[0] ?? 'Читавук', text: choice.label, mine: true },
                ]);
                setCurrent(choice.next);
              }}
              className="rounded-2xl border border-[var(--line)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]"
            >
              {inScript(choice.label, script)}
            </button>
          ))}
        </div>
      )}
      <div ref={bottom} />
    </div>
  );
}
