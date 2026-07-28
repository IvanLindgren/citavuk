import { useEffect, useRef, useState } from 'react';

/**
 * Приём файлов перетаскиванием на всю страницу.
 *
 * Зона броска намеренно во весь экран, а не только карточка импорта: человек
 * тянет файл примерно туда, где видит подсказку, и промах мимо небольшой
 * карточки означал бы, что браузер откроет PDF вместо импорта — самый обидный
 * исход, потому что выглядит как «перетаскивание не работает».
 *
 * Счётчик вместо простого флага нужен из-за устройства событий DOM: dragenter
 * и dragleave приходят на каждый вложенный элемент, под которым проходит
 * курсор, поэтому наивный `onDragLeave -> false` заставляет подсветку мигать.
 */
export function useFileDrop({
  onFiles,
  enabled = true,
}: {
  onFiles: (files: File[]) => void;
  enabled?: boolean;
}): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);

  // Обработчик держим в ref: он меняется на каждый рендер родителя, а
  // переподписываться на события окна из-за этого незачем.
  const handler = useRef(onFiles);
  handler.current = onFiles;

  const depth = useRef(0);

  useEffect(() => {
    // Перетаскивание файла на страницу браузер по умолчанию понимает как
    // «открыть его вместо страницы». Это надо гасить всегда, даже когда приём
    // выключен: иначе промах по зоне уносит пользователя с сайта, а
    // несохранённое состояние теряется.
    const isFileDrag = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current += 1;
      if (enabled) setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        // Курсор показывает «копирование», а не «перемещение»: файл у
        // пользователя остаётся.
        event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
      }
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!enabled) return;

      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) handler.current(files);
    };

    // Курсор может уйти за пределы окна прямо во время перетаскивания —
    // dragleave тогда не придёт, и подсветка осталась бы навсегда.
    const onWindowBlur = () => {
      depth.current = 0;
      setDragging(false);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('blur', onWindowBlur);
      depth.current = 0;
    };
  }, [enabled]);

  return { dragging };
}

/**
 * Выбирает первый файл, который имеет смысл импортировать.
 *
 * Из папки или архива браузер отдаёт набор — берём подходящий по расширению, а
 * не просто первый: иначе перетаскивание папки с картинками и одним PDF
 * закончилось бы ошибкой о неподдерживаемом формате.
 */
export function pickImportableFile(files: File[]): File | null {
  const supported = /\.(txt|md|pdf|docx|fb2|epub|djvu|djv|html?)$/i;
  return files.find((file) => supported.test(file.name)) ?? files[0] ?? null;
}
