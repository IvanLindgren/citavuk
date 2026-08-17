import { useEffect, useState } from 'react';

import { getPublicLesson, getUnlistedLesson, type Lesson } from '../api/lessons';
import { ApiError } from '../api/client';
import { LessonPlayer } from '../components/LessonPlayer';
import { ErrorNote, Spinner } from '../components/ui';
import { useParams, useQuery, useRouter } from '../lib/router';

export function LessonView({ unlisted = false }: { unlisted?: boolean }) {
  const params = useParams();
  const query = useQuery();
  const { navigate } = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const key = unlisted ? params.token : params.slug;
    (unlisted ? getUnlistedLesson(key ?? '') : getPublicLesson(key ?? ''))
      .then(setLesson).catch((caught) => setError(messageOf(caught)));
  }, [params.slug, params.token, unlisted]);

  if (error) return <main className="mx-auto max-w-3xl px-5 py-20"><ErrorNote>{error}</ErrorNote></main>;
  if (!lesson) return <main className="grid min-h-[60vh] place-items-center"><Spinner className="size-6" /></main>;
  // `?stage=dialogue` — со страницы диалогов. Оттуда пришли за разговором, и
  // возврат ведёт туда же, а не в каталог уроков.
  const forDialogue = query.stage === 'dialogue';
  return (
    <LessonPlayer
      lesson={lesson}
      initialStage={forDialogue ? 'dialogue' : undefined}
      onExit={() => navigate(forDialogue ? '/dialogues' : '/lessons')}
    />
  );
}

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Неизвестная ошибка.';
}
