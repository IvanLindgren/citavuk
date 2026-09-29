import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCheck, LuCircleAlert, LuLoaderCircle, LuMic, LuPlay, LuRotateCcw, LuSquare, LuVolume2 } from 'react-icons/lu';

import { ApiError } from '../../api/client';
import { ttsAudioUrl } from '../../api/listening';
import {
  SPEAKING_MAX_CHARS,
  SPEAKING_MIN_WORDS,
  type SpeakingReview,
  type SpeakingTopic,
} from '../../api/speaking';
import { transcribeAudioFile } from '../../api/audioFiles';
import { Button } from '../../components/ui';
import { speechChunks } from '../../lib/speech';
import { annotate, countWords } from './highlight';
import { RecordingError, recordingFileName, startRecording, type ActiveRecorder } from './recorder';

export const MAX_RECORDING_SECONDS = 180;
const MIN_RECORDING_SECONDS = 3;

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Опорные слова темы: подсказка, которую можно убрать, чтобы не отвлекала. */
export function HintWords({ topic }: { topic: SpeakingTopic }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Опорные слова">
      {topic.words.map((word) => (
        <li
          key={word.sr}
          className="rounded-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1 text-sm"
        >
          <span className="font-semibold">{word.sr}</span>
          <span className="text-[var(--text-muted)]"> — {word.ru}</span>
        </li>
      ))}
    </ul>
  );
}

export function WordCounter({ text }: { text: string }) {
  const words = countWords(text);
  const left = SPEAKING_MIN_WORDS - words;
  return (
    <p className={['text-sm', left > 0 ? 'text-[var(--text-muted)]' : 'text-[var(--success,#2f7a3b)]'].join(' ')}>
      {words} {wordForm(words)}
      {left > 0 ? ` · нужно ещё хотя бы ${left}` : ''}
    </p>
  );
}

function wordForm(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return 'слов';
  return n % 10 === 1 ? 'слово' : n % 10 >= 2 && n % 10 <= 4 ? 'слова' : 'слов';
}

export function AnswerField({
  value,
  onChange,
  disabled,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label: string;
}) {
  return (
    <div>
      <label className="sr-only" htmlFor="speaking-answer">{label}</label>
      <textarea
        id="speaking-answer"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.slice(0, SPEAKING_MAX_CHARS))}
        placeholder={placeholder}
        rows={9}
        lang="sr"
        spellCheck={false}
        autoCapitalize="sentences"
        className="w-full resize-y rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 text-lg leading-relaxed outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <WordCounter text={value} />
        <span className="text-xs text-[var(--text-muted)]">
          {value.length} / {SPEAKING_MAX_CHARS}
        </span>
      </div>
    </div>
  );
}

type RecorderState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'error'; message: string };

/** Запись голоса и расшифровка. Готовый текст отдаётся наверх. */
export function VoiceRecorder({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<RecorderState>({ kind: 'idle' });
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recorder = useRef<ActiveRecorder | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => () => recorder.current?.cancel(), []);

  const finish = async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setState({ kind: 'transcribing' });
    try {
      const recording = await active.stop();
      if (recording.seconds < MIN_RECORDING_SECONDS) {
        setState({ kind: 'error', message: 'Запись слишком короткая. Скажи хотя бы пару предложений.' });
        return;
      }
      const file = new File([recording.blob], recordingFileName(recording.mimeType), { type: recording.mimeType });
      const transcript = await transcribeAudioFile(file);
      const text = transcript.segments.map((segment) => segment.text.trim()).filter(Boolean).join(' ');
      if (!text) throw new ApiError('Речь в записи не распознана.', 422);
      setState({ kind: 'idle' });
      onTranscriptRef.current(text);
    } catch (error) {
      setState({
        kind: 'error',
        message:
          error instanceof ApiError || error instanceof RecordingError
            ? error.message
            : 'Не удалось расшифровать запись. Попробуй ещё раз.',
      });
    }
  };

  const begin = async () => {
    setSeconds(0);
    try {
      recorder.current = await startRecording({
        maxSeconds: MAX_RECORDING_SECONDS,
        onLevel: setLevel,
        onTick: setSeconds,
        onLimit: () => void finish(),
      });
      setState({ kind: 'recording' });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof RecordingError ? error.message : 'Не удалось включить микрофон.',
      });
    }
  };

  const recording = state.kind === 'recording';
  const busy = state.kind === 'transcribing';
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="relative grid size-32 place-items-center">
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-[var(--accent)] transition-[width,height,opacity] duration-100"
          style={{
            width: recording ? 96 + level * 52 : 96,
            height: recording ? 96 + level * 52 : 96,
            opacity: recording ? 0.16 : 0,
          }}
        />
        <button
          type="button"
          onClick={() => (recording ? void finish() : void begin())}
          disabled={busy}
          aria-label={recording ? 'Остановить запись' : 'Начать запись'}
          className={[
            'relative grid size-24 place-items-center rounded-full text-parchment shadow-lg transition-transform active:scale-95 disabled:opacity-50',
            recording ? 'bg-[var(--accent)]' : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]',
          ].join(' ')}
        >
          {busy ? (
            <LuLoaderCircle className="size-9 animate-spin" aria-hidden="true" />
          ) : recording ? (
            <LuSquare className="size-8 fill-current" aria-hidden="true" />
          ) : (
            <LuMic className="size-10" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="min-h-14" aria-live="polite">
        {state.kind === 'idle' && (
          <p className="max-w-sm text-[var(--text-muted)]">
            Нажми и говори по-сербски: хватит одной-двух минут. Потом нажми ещё раз, чтобы закончить.
          </p>
        )}
        {recording && (
          <>
            <p className="text-3xl font-bold tabular-nums">{formatClock(seconds)}</p>
            <p className="text-sm text-[var(--text-muted)]">
              {MAX_RECORDING_SECONDS - seconds < 20
                ? `Запись остановится через ${Math.max(0, Math.ceil(MAX_RECORDING_SECONDS - seconds))} с`
                : 'Идёт запись…'}
            </p>
          </>
        )}
        {busy && <p className="text-[var(--text-muted)]">Читавук слушает запись и расшифровывает её…</p>}
        {state.kind === 'error' && (
          <p className="flex max-w-sm items-start gap-2 text-left text-[var(--accent)]" role="alert">
            <LuCircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}

/** Озвучка исправленного текста кусками по границам предложений. */
function usePolishedAudio(text: string) {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);

  const toggle = () => {
    if (playing) {
      stopRef.current();
      return;
    }
    const chunks = speechChunks(text);
    let index = 0;
    let stopped = false;
    let audio: HTMLAudioElement | null = null;
    const stop = () => {
      stopped = true;
      audio?.pause();
      setPlaying(false);
    };
    stopRef.current = stop;
    const next = () => {
      if (stopped || index >= chunks.length) {
        setPlaying(false);
        return;
      }
      audio = new Audio(ttsAudioUrl(chunks[index++]!));
      audio.onended = next;
      audio.onerror = stop;
      void audio.play().catch(stop);
    };
    setPlaying(true);
    next();
  };
  return { playing, toggle };
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function ReviewView({
  text,
  review,
  onAgain,
  onRewrite,
}: {
  text: string;
  review: SpeakingReview;
  onAgain: () => void;
  onRewrite: () => void;
}) {
  const parts = useMemo(() => annotate(text, review.mistakes), [text, review.mistakes]);
  const [active, setActive] = useState<number | null>(null);
  const audio = usePolishedAudio(review.polished || text);
  const clean = review.mistakes.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {review.level && (
          <span className="rounded-full bg-[var(--accent)] px-3.5 py-1 text-sm font-bold text-parchment">
            Уровень текста ≈ {review.level}
          </span>
        )}
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
            clean ? 'bg-[var(--success,#2f7a3b)]/15' : 'bg-gold/15',
          ].join(' ')}
        >
          {clean ? <LuCheck className="size-4" aria-hidden="true" /> : null}
          {clean ? 'Без ошибок' : `Ошибок: ${review.mistakes.length}`}
        </span>
        {!review.onTopic && (
          <span className="rounded-full bg-[var(--bg-sunken)] px-3 py-1 text-sm">Немного мимо темы</span>
        )}
      </div>

      <p className="mt-4 text-lg leading-relaxed">{review.summary}</p>
      {review.strengths.length > 0 && (
        <ul className="mt-3 space-y-1">
          {review.strengths.map((item) => (
            <li key={item} className="flex gap-2">
              <LuCheck className="mt-1 size-4 shrink-0 text-[var(--success,#2f7a3b)]" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      )}

      <Block title="Твой текст">
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4 text-lg leading-loose" lang="sr">
          {parts.map((part, index) =>
            part.mistake === undefined ? (
              <span key={index}>{part.text}</span>
            ) : (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setActive(part.mistake!);
                  document.getElementById(`speaking-mistake-${part.mistake}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }}
                title={review.mistakes[part.mistake]!.fixed}
                className={[
                  'rounded px-0.5 underline decoration-wavy decoration-2 underline-offset-4 transition-colors',
                  active === part.mistake ? 'bg-[var(--accent)]/15' : 'hover:bg-[var(--accent)]/10',
                  'decoration-[var(--accent)]',
                ].join(' ')}
              >
                {part.text}
              </button>
            ),
          )}
        </p>
      </Block>

      {!clean && (
        <Block title="Разбор">
          <ul className="space-y-2">
            {review.mistakes.map((mistake, index) => (
              <li
                key={`${mistake.original}-${index}`}
                id={`speaking-mistake-${index}`}
                onMouseEnter={() => setActive(index)}
                className={[
                  'rounded-2xl border p-4 transition-colors',
                  active === index ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--line)] bg-[var(--bg-raised)]',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg" lang="sr">
                    <span className="text-[var(--accent)] line-through decoration-2">{mistake.original}</span>
                    <span className="mx-2 text-[var(--text-muted)]" aria-hidden="true">→</span>
                    <span className="font-bold">{mistake.fixed}</span>
                  </span>
                  <span className="rounded-full bg-[var(--bg-sunken)] px-2.5 py-0.5 text-xs font-semibold">{mistake.label}</span>
                </div>
                {mistake.explanation && <p className="mt-1.5 leading-relaxed text-[var(--text-muted)]">{mistake.explanation}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {review.polished && !clean && (
        <Block title="Как это звучит правильно">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-raised)] p-4">
            <p className="text-lg leading-loose" lang="sr">{review.polished}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={audio.toggle}>
              {audio.playing ? <LuSquare className="size-4 fill-current" aria-hidden="true" /> : <LuVolume2 className="size-4" aria-hidden="true" />}
              {audio.playing ? 'Остановить' : 'Послушать'}
            </Button>
          </div>
        </Block>
      )}

      {review.tips.length > 0 && (
        <Block title="Что потренировать">
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {review.tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </Block>
      )}

      {review.words.length > 0 && (
        <Block title="Пригодилось бы по этой теме">
          <ul className="flex flex-wrap gap-2">
            {review.words.map((word) => (
              <li key={word.sr} className="rounded-full border border-[var(--line)] bg-[var(--bg-raised)] px-3 py-1 text-sm">
                <span className="font-semibold" lang="sr">{word.sr}</span>
                <span className="text-[var(--text-muted)]"> — {word.ru}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={onAgain}>
          <LuPlay className="size-5" aria-hidden="true" /> Крутить ещё
        </Button>
        <Button size="lg" variant="secondary" onClick={onRewrite}>
          <LuRotateCcw className="size-5" aria-hidden="true" /> Попробовать эту тему ещё раз
        </Button>
      </div>
    </div>
  );
}
