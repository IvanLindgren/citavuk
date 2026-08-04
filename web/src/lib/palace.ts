import {
  STORE_PALACES,
  get,
  getAll,
  getAllByIndex,
  put,
  remove,
  tx,
} from './db';

/**
 * Дворцы памяти.
 *
 * Приём древний: чтобы запомнить список, его раскладывают по предметам
 * знакомого помещения и потом «проходят» по нему мысленно. Слова чужого языка
 * ложатся на него хорошо — вспоминается не строчка из списка, а место.
 *
 * Модель хранения та же, что у книг и словаря: глобальный `id`, время
 * изменения, флаг `dirty` и надгробие вместо стирания. Иначе устройство, у
 * которого дворец ещё есть, вернуло бы его обратно при следующей отправке, и
 * удаление никогда бы не запомнилось.
 */

export interface PalacePin {
  /** Сербское слово на предмете. */
  word: string;
  translation: string;
  /** Слово из словаря, если брали оттуда, — иначе введено руками. */
  vocabId: string | null;
  /**
   * Когда слово повесили. По нему строится маршрут обхода — см. walkOrder.
   *
   * Необязательное: развеска, сделанная до появления поля, его не имеет.
   */
  at?: number;
}

export interface Palace {
  id: string;
  name: string;
  sceneId: string;
  /** Ключ — идентификатор предмета сцены. */
  pins: Record<string, PalacePin>;
  createdAt: number;
  updatedAt: number;
  deleted: 0 | 1;
  /** Запись изменена локально и ждёт отправки. */
  dirty: 0 | 1;
}

export async function listPalaces(): Promise<Palace[]> {
  const palaces = await allPalaces();
  return palaces
    .filter((palace) => !palace.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Все дворцы, включая надгробия, — нужны синхронизации. */
export async function allPalaces(): Promise<Palace[]> {
  return tx(STORE_PALACES, 'readonly', (transaction) =>
    getAll<Palace>(transaction, STORE_PALACES),
  );
}

export async function getPalace(id: string): Promise<Palace | null> {
  const palace = await tx(STORE_PALACES, 'readonly', (transaction) =>
    get<Palace>(transaction, STORE_PALACES, id),
  );
  return palace && !palace.deleted ? palace : null;
}

export async function createPalace(name: string, sceneId: string): Promise<Palace> {
  const now = Date.now();
  const palace: Palace = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Мой дворец',
    sceneId,
    pins: {},
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    dirty: 1,
  };
  await savePalace(palace);
  return palace;
}

/** Сохраняет правку и помечает дворец к отправке. */
export async function savePalace(palace: Palace): Promise<void> {
  await putPalace({ ...palace, dirty: 1 });
}

/** Записывает дворец как есть — для синхронизации, снимающей пометку. */
async function putPalace(palace: Palace): Promise<void> {
  await tx(STORE_PALACES, 'readwrite', (transaction) =>
    put(transaction, STORE_PALACES, palace),
  );
}

/** Оставляет надгробие: стереть запись сразу — значит получить дворец обратно. */
export async function deletePalace(id: string): Promise<void> {
  const palace = await getPalace(id);
  if (!palace) return;
  await putPalace({
    ...palace,
    pins: {},
    deleted: 1,
    dirty: 1,
    updatedAt: Date.now(),
  });
}

export async function dirtyPalaces(limit = 100): Promise<Palace[]> {
  return tx(STORE_PALACES, 'readonly', (transaction) =>
    getAllByIndex<Palace>(transaction, STORE_PALACES, 'dirty', 1, limit),
  );
}

/** Снимает пометку после подтверждения сервером. */
export async function clearPalaceDirty(sent: Palace[]): Promise<void> {
  if (sent.length === 0) return;
  await tx(STORE_PALACES, 'readwrite', async (transaction) => {
    for (const snapshot of sent) {
      const current = await get<Palace>(transaction, STORE_PALACES, snapshot.id);
      // Дворец могли изменить снова, пока шёл запрос: тогда пометку снимать
      // нельзя, иначе правка потеряется.
      if (current?.dirty && current.updatedAt === snapshot.updatedAt) {
        await put(transaction, STORE_PALACES, { ...current, dirty: 0 });
      }
    }
  });
}

export async function applyRemotePalace(palace: Palace): Promise<boolean> {
  return tx(STORE_PALACES, 'readwrite', async (transaction) => {
    const current = await get<Palace>(transaction, STORE_PALACES, palace.id);
    if (current && current.updatedAt > palace.updatedAt) return false;
    // Удалённого дворца, которого у нас и не было, заводить незачем.
    if (!current && palace.deleted) return false;
    await put(transaction, STORE_PALACES, {
      ...palace,
      // Время постройки с сервера не приходит: там его хранить незачем, оно
      // нужно только для порядка в списке до первой правки.
      createdAt: current?.createdAt ?? palace.updatedAt,
      dirty: 0,
    });
    return true;
  });
}

/** Помечает всё к отправке — при смене аккаунта. */
export async function markPalacesDirty(): Promise<void> {
  const palaces = await allPalaces();
  await tx(STORE_PALACES, 'readwrite', async (transaction) => {
    for (const palace of palaces) {
      await put(transaction, STORE_PALACES, { ...palace, dirty: 1 });
    }
  });
}

/** Убирает надгробия, уже принятые сервером: они не нужны вечно. */
export async function purgePalaceTombstones(
  olderThanMs = 90 * 86_400_000,
): Promise<void> {
  const cutoff = Date.now() - olderThanMs;
  const stale = (await allPalaces()).filter(
    (palace) => palace.deleted && !palace.dirty && palace.updatedAt < cutoff,
  );
  if (stale.length === 0) return;

  await tx(STORE_PALACES, 'readwrite', async (transaction) => {
    for (const palace of stale) await remove(transaction, STORE_PALACES, palace.id);
  });
}

/** Прикрепляет слово к предмету. Пустое слово снимает прежнее. */
export function withPin(
  palace: Palace,
  objectId: string,
  pin: PalacePin | null,
): Palace {
  const pins = { ...palace.pins };
  if (pin && pin.word.trim()) {
    pins[objectId] = {
      ...pin,
      word: pin.word.trim(),
      // Место в маршруте закрепляется за предметом при первой развеске и
      // больше не меняется. Замена слова на том же предмете — это правка
      // ошибки, а не перестройка маршрута: переносить из-за неё предмет в
      // конец обхода значило бы ломать выученную последовательность.
      at: palace.pins[objectId]?.at ?? pin.at ?? Date.now(),
    };
  } else {
    delete pins[objectId];
  }
  return { ...palace, pins, updatedAt: Date.now(), dirty: 1 };
}

/**
 * Порядок обхода дворца — тот, в котором слова расставляли.
 *
 * Маршрут обязан быть постоянным: в этом весь приём, вспоминается не слово, а
 * место и путь к нему. Перемешивать карточки здесь было бы ошибкой, хотя для
 * обычного повторения это норма.
 *
 * Постоянным был и прежний порядок — порядок предметов в сцене, — но он был
 * чужим. Человек расставляет слова осознанно: сначала то, с чего начнёт, потом
 * следующее. Обход, идущий вопреки этому замыслу, заставляет держать в голове
 * ещё и авторскую нумерацию предметов.
 *
 * Развеска, сделанная до появления поля `at`, обходится по-старому и идёт
 * первой: у неё привычный порядок, и менять его задним числом нельзя — человек
 * этот маршрут уже выучил.
 */
export function walkOrder(
  palace: Palace,
  objectIds: string[],
): Array<{ objectId: string; pin: PalacePin }> {
  return objectIds
    .filter((id) => palace.pins[id])
    .map((id, index) => ({ objectId: id, pin: palace.pins[id]!, index }))
    .sort((a, b) => (a.pin.at ?? a.index) - (b.pin.at ?? b.index))
    .map(({ objectId, pin }) => ({ objectId, pin }));
}
