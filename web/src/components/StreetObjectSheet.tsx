import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuPlus, LuVolume2, LuX } from 'react-icons/lu';

import { ttsAudioUrl } from '../api/listening';
import { saveVocabularyWord } from '../lib/vocabulary';
import { useSync } from '../state/sync';
import { inScript, type Script } from '../travel/content';
import { STREET_OBJECTS, type StreetObject } from '../travel/scene3d';

export function StreetObjectSheet({
  object,
  script,
  onClose,
}: {
  object: StreetObject;
  script: Script;
  onClose: () => void;
}) {
  const lesson = STREET_OBJECTS[object.kind];
  const { sync } = useSync();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSaved(false);
    setFailed(false);
  }, [object.id]);

  useEffect(() => () => audio.current?.pause(), []);

  const speak = (text: string) => {
    audio.current?.pause();
    const player = new Audio(ttsAudioUrl(text));
    audio.current = player;
    void player.play().catch(() => undefined);
  };

  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await saveVocabularyWord({
        word: lesson.sr,
        lemma: lesson.sr,
        translation: lesson.ru,
        forms: {
          контекст: lesson.exampleSr,
          'перевод контекста': lesson.exampleRu,
          источник: 'Путешествие по Сербии',
        },
      });
      setSaved(true);
      setFailed(false);
      void sync();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[68dvh] flex-col rounded-t-3xl border border-[var(--line)] bg-[var(--bg-raised)] shadow-2xl sm:inset-y-auto sm:bottom-5 sm:left-5 sm:right-auto sm:w-[25rem] sm:rounded-2xl"
      aria-label={`Объект: ${lesson.ru}`}
    >
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <div className="min-w-0 flex-1">
          {object.name && <p className="truncate text-xs text-[var(--text-muted)]">{object.name}</p>}
          <h2 className="font-display text-2xl" lang="sr">{inScript(lesson.sr, script)}</h2>
          <p className="text-sm text-[var(--text-muted)]">{lesson.ru}</p>
        </div>
        <button
          type="button"
          onClick={() => speak(lesson.sr)}
          aria-label={`Произнести: ${lesson.sr}`}
          className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--accent)] hover:bg-[var(--bg-sunken)]"
        >
          <LuVolume2 className="size-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-sunken)]"
        >
          <LuX className="size-5" />
        </button>
      </header>

      <div className="overflow-y-auto px-5 py-5">
        <button
          type="button"
          onClick={() => speak(lesson.exampleSr)}
          className="w-full border-l-2 border-[var(--accent)]/45 pl-4 text-left"
        >
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-lg leading-relaxed" lang="sr">{inScript(lesson.exampleSr, script)}</span>
              <span className="mt-1 block text-sm leading-relaxed text-[var(--text-muted)]">{lesson.exampleRu}</span>
            </span>
            <LuVolume2 className="mt-1 size-4 shrink-0 text-[var(--accent)]" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || saved}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-[var(--accent)] hover:border-[var(--accent)] disabled:text-[var(--text-muted)]"
        >
          {saved ? <LuCheck /> : <LuPlus />}
          {saving ? 'Добавляем…' : saved ? 'В словаре' : 'Добавить в словарь'}
        </button>
        {failed && <p className="mt-2 text-sm text-red-700">Не удалось добавить слово. Попробуй ещё раз.</p>}
      </div>
    </aside>
  );
}
