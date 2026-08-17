import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiSpeakerWave, HiStop } from 'react-icons/hi2';

import { ttsAudioUrl } from '../api/listening';
import { WordReader } from './WordReader';

/**
 * Обстановка диалога: портреты собеседников, реплики облачками, озвучка и
 * полоса ответов внизу.
 *
 * Заведено общим, потому что диалогов в Читавуке два вида и выглядели они
 * по-разному. «Дорога к Дринкиту» — переписка с портретами, озвучкой и историей
 * разговора; диалог внутри урока преподавателя — одна серая карточка с текущей
 * репликой и парой кнопок под ней. Разница не задумывалась: просто второй писали
 * позже и проще. Читателю от этого доставался разговор, в котором не видно, что
 * уже сказано, некого слушать и не на кого смотреть.
 *
 * Персонаж реплики в данных урока лежал с самого начала — поле `avatar` в
 * редакторе выбирается из четырёх, — и всё это время выбрасывался при показе.
 */
export type DialogueFace =
  | 'citavuk'
  | 'marja'
  | 'narrator'
  | 'teacher'
  | 'student'
  | 'woman'
  | 'man';

const FACE_IMAGE: Record<Exclude<DialogueFace, 'narrator'>, string> = {
  citavuk: '/img/citavuk_icon.webp',
  marja: '/img/marja-spilberic.png',
  teacher: '/img/face_teacher.webp',
  student: '/img/face_student.webp',
  woman: '/img/face_woman.webp',
  man: '/img/face_man.webp',
};

const FACE_ALT: Record<Exclude<DialogueFace, 'narrator'>, string> = {
  citavuk: 'Читавук',
  marja: 'Марья Спилберич',
  teacher: 'Преподаватель',
  student: 'Ученик',
  woman: 'Собеседница',
  man: 'Собеседник',
};

/** Реплика в истории разговора. */
export interface DialogueLine {
  /** Ключ реплики: по нему же отмечается, что сейчас звучит. */
  key: string;
  speaker: string;
  text: string;
  face: DialogueFace;
  /** Реплика читателя — она встаёт справа. */
  own?: boolean;
}

/**
 * Озвучка реплик.
 *
 * Ключ, а не текст: одна и та же фраза в диалоге встречается дважды, и по тексту
 * подсветилось бы сразу два облачка. Последовательность нужна выбору ответа:
 * сначала слышно, что сказал читатель, потом ответ собеседника.
 */
export function useDialogueSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const stop = useCallback(() => {
    runRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    audioRef.current = null;
    setSpeakingKey(null);
  }, []);

  // Уход со страницы посреди реплики не должен оставлять голос в наушниках.
  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (lines: Array<{ key: string; text: string }>) => {
      const run = ++runRef.current;
      const previous = audioRef.current;
      if (previous) {
        previous.pause();
        previous.src = '';
      }
      for (const line of lines) {
        if (run !== runRef.current) return;
        const audio = new Audio(ttsAudioUrl(line.text));
        audioRef.current = audio;
        setSpeakingKey(line.key);
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          // Недоступная озвучка не должна останавливать сам диалог.
          audio.onerror = () => resolve();
          void audio.play().catch(() => resolve());
        });
      }
      if (run === runRef.current) {
        audioRef.current = null;
        setSpeakingKey(null);
      }
    },
    [],
  );

  const toggle = useCallback(
    (line: { key: string; text: string }) => {
      if (speakingKey === line.key) stop();
      else void speak([line]);
    },
    [speakingKey, speak, stop],
  );

  return { speakingKey, speak, stop, toggle };
}

export function SpeakButton({
  speaking,
  onClick,
}: {
  speaking: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/12"
      aria-label={speaking ? 'Остановить озвучку' : 'Озвучить реплику'}
      title={speaking ? 'Остановить' : 'Прослушать'}
    >
      {speaking ? <HiStop aria-hidden="true" /> : <HiSpeakerWave aria-hidden="true" />}
    </button>
  );
}

export function DialogueAvatar({ face }: { face: Exclude<DialogueFace, 'narrator'> }) {
  return (
    <img
      src={FACE_IMAGE[face]}
      // Второй размер для плотных экранов: собран тем же prepare-assets.py.
      srcSet={`${FACE_IMAGE[face]} 1x, ${FACE_IMAGE[face].replace('.webp', '@2x.webp')} 2x`}
      alt={FACE_ALT[face]}
      width={64}
      height={64}
      className="size-12 shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] object-cover sm:size-16"
    />
  );
}

export function DialogueBubble({
  line,
  index,
  reducedMotion,
  speaking,
  onSpeak,
}: {
  line: DialogueLine;
  index: number;
  reducedMotion: boolean;
  speaking: boolean;
  onSpeak: () => void;
}) {
  if (line.face === 'narrator') {
    return (
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-xl rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-sunken)] px-5 py-4 text-center"
      >
        <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase text-[var(--text-muted)]">
          Рассказчик
          <SpeakButton speaking={speaking} onClick={onSpeak} />
        </div>
        <WordReader
          paragraphs={[line.text]}
          paragraphClassName="reader-selectable font-display text-base leading-relaxed sm:text-lg"
        />
      </motion.div>
    );
  }

  const own = Boolean(line.own);
  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, x: own ? 18 : -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.18) }}
      className={['flex items-end gap-2.5 sm:gap-3', own ? 'flex-row-reverse' : ''].join(' ')}
    >
      <DialogueAvatar face={line.face} />
      <div
        className={[
          'relative max-w-[calc(100%-4.25rem)] rounded-2xl border px-4 py-3 shadow-[var(--shadow-soft)] sm:max-w-[82%] sm:px-5 sm:py-4',
          own
            ? 'rounded-br-md border-[var(--accent)]/30 bg-[var(--accent)]/9'
            : 'rounded-bl-md border-[var(--line)] bg-[var(--bg-raised)]',
        ].join(' ')}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-[var(--accent)]">
            {line.speaker}
          </span>
          <SpeakButton speaking={speaking} onClick={onSpeak} />
        </div>
        <WordReader
          paragraphs={[line.text]}
          paragraphClassName="reader-selectable font-display text-lg leading-relaxed sm:text-xl"
        />
      </div>
    </motion.article>
  );
}

/**
 * Полоса ответов, приклеенная к низу экрана.
 *
 * Ответы стоят под рукой, а не в конце страницы: на телефоне разговор из десяти
 * реплик длиннее экрана, и до кнопок пришлось бы каждый раз доскролливать.
 */
export function DialogueChoiceBar({
  title = 'Выберите ответ',
  choices,
  onChoose,
  inline = false,
}: {
  title?: string;
  choices: Array<{ key: string; label: string }>;
  onChoose: (index: number) => void;
  /** Встать в поток вместо приклеивания к окну — для предпросмотра в редакторе. */
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? ''
          : 'fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--bg)]/95 px-3 pt-3 shadow-[0_-8px_30px_rgba(35,24,13,0.12)] backdrop-blur-md sm:px-5 sm:pt-4'
      }
    >
      <div
        className={inline ? 'mx-auto max-w-3xl' : 'mx-auto max-h-[42dvh] max-w-3xl overflow-y-auto'}
        style={inline ? undefined : { paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <p className="mb-2 text-center text-xs font-bold uppercase text-[var(--text-muted)]">
          {title}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((choice, index) => (
            <motion.button
              key={choice.key}
              type="button"
              onClick={() => onChoose(index)}
              whileTap={{ y: 2 }}
              className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-left font-semibold shadow-[0_3px_0_0_var(--line)] transition-colors hover:border-[var(--accent)]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">
                {index + 1}
              </span>
              <span>{choice.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Отступ под приклеенную полосу: иначе последняя реплика окажется под ней. */
export const CHOICE_BAR_SPACE = 'min(46dvh, 22rem)';

/**
 * Сцена над разговором: фотография урока и лица участников.
 *
 * Обложка у уроков есть с самого начала и до сих пор показывалась только над
 * теорией. Диалог начинался с пустого места, хотя в данных лежала фотография
 * ровно того, о чём разговор, — кафаны, рынка, ботанического сада.
 *
 * Без обложки сцена не исчезает, а становится плашкой с участниками: увидеть,
 * с кем предстоит говорить, полезно и без фотографии.
 */
export function DialogueScene({
  coverUrl,
  participants,
}: {
  coverUrl?: string;
  participants: Array<{ face: DialogueFace; name: string }>;
}) {
  const faces = participants.filter(
    (item): item is { face: Exclude<DialogueFace, 'narrator'>; name: string } =>
      item.face !== 'narrator',
  );

  if (!coverUrl) {
    if (faces.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-sunken)] px-4 py-4">
        {faces.map((item) => (
          <span key={item.name} className="flex items-center gap-2">
            <DialogueAvatar face={item.face} />
            <span className="font-semibold">{item.name}</span>
          </span>
        ))}
      </div>
    );
  }

  // Высота задана в пикселях, а не пропорцией: на широком экране 16/7 давали
  // фотографию в пол-экрана, и первая реплика уходила под сгиб. Сцена должна
  // задать настроение, а не занять собой весь разговор.
  return (
    <div className="relative h-36 w-full overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--bg-sunken)] sm:h-44">
      <img src={coverUrl} alt="" className="size-full object-cover" />
      {/* Затемнение снизу: без него имена на светлой фотографии не читаются. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(20,14,8,0.78)] via-[rgba(20,14,8,0.15)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-3 p-3 sm:p-5">
        {faces.map((item) => (
          <span key={item.name} className="flex items-center gap-2">
            <DialogueAvatar face={item.face} />
            <span className="font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
              {item.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
