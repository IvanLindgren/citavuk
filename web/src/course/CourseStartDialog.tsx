import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuLockKeyholeOpen } from 'react-icons/lu';
import { Button } from '../components/ui';
import { useFocusTrap, useScrollLock } from '../lib/overlay';
import { useRouter } from '../lib/router';
import { startCourseFrom, uploadCourseProgress } from './data';
import type { CourseBundle } from './types';

export function CourseStartDialog({ bundle, lesson, close }: {
  bundle: CourseBundle;
  lesson: CourseBundle['units'][number]['skills'][number]['lessons'][number];
  close: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const { navigate } = useRouter();
  useFocusTrap(true, panel);
  useScrollLock(true);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [close]);
  function start() {
    if (saving.current) return;
    saving.current = true;
    try {
      const next = startCourseFrom(bundle, lesson.id);
      // Запись локальная; недоступная сеть не блокирует открытие урока.
      void uploadCourseProgress(bundle, next).catch(() => undefined);
      close();
      navigate(`/course/lesson/${encodeURIComponent(lesson.id)}`);
    } catch (e) {
      saving.current = false;
      setError(e instanceof Error ? e.message : 'Не удалось открыть урок.');
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="course-start-title" aria-describedby="course-start-description" tabIndex={-1} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--line)] bg-[var(--bg-raised)] p-6 shadow-xl sm:p-8">
        <LuLockKeyholeOpen className="mb-4 size-9 text-[var(--accent)]" aria-hidden />
        <h2 id="course-start-title" className="text-2xl">Открыть «{lesson.title}»?</h2>
        <p id="course-start-description" className="mt-4 leading-relaxed">Если предыдущие темы тебе уже знакомы, начни с этого урока. К ним можно вернуться в любой момент.</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">Пройденные уроки сохранятся. Пропущенные темы не дают опыт и серию. Незавершённая попытка будет сброшена.</p>
        {error && <p role="alert" className="mt-3">{error}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={close}>Отмена</Button>
          <Button onClick={start}>Уже знаю, открыть урок</Button>
        </div>
      </div>
    </div>, document.body,
  );
}
