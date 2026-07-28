import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DropOverlay } from "../components/DropOverlay";
import { Mascot } from "../components/Mascot";
import { SyncBadge } from "../components/SyncBadge";
import { Button, Card, ErrorNote, Reveal, Spinner } from "../components/ui";
import {
  deleteBook,
  importText,
  listBooks,
  plural,
  readingMinutes,
  type BookMeta,
} from "../lib/books";
import {
  addDraftFolder,
  countWithoutFolder,
  dissolveFolder,
  foldersOf,
  moveToFolder,
  normalizeFolder,
  renameFolder,
} from "../lib/folders";
import {
  extractDocument,
  IMPORT_STAGE_LABELS,
  type ImportStage,
} from "../lib/documentImport";
import { Link, useQuery, useRouter } from "../lib/router";
import { pickImportableFile, useFileDrop } from "../lib/useFileDrop";
import { useAuth } from "../state/auth";
import { useSync } from "../state/sync";
import { useSeo } from '../lib/seo';

/** Пример на случай пустой библиотеки: без него первый экран нечем занять. */
const SAMPLE = `Ово је прича о вуку који је волео да чита.

Сваког јутра он би отворио књигу и читао до вечери. Књиге су биле његови најбољи пријатељи.

Jednog dana vuk je sreo orla koji je voleo da sluša. Zajedno su proveli mnogo sati: jedan je čitao naglas, a drugi je slušao i ponavljao reči.

Тако су обојица научили нешто ново.`;

/** Какие книги показывать: все, без папки или из конкретной папки. */
type View = { kind: "all" } | { kind: "loose" } | { kind: "folder"; name: string };

export function Library() {
  useSeo({
    title: 'Моя библиотека — Читавук',
    noindex: true,
  });

  const { navigate } = useRouter();
  const query = useQuery();
  const { account } = useAuth();
  const { revision, sync } = useSync();

  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importStage, setImportStage] = useState<ImportStage | null>(null);
  const [view, setView] = useState<View>(() =>
    query.folder ? { kind: "folder", name: query.folder } : { kind: "all" },
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setBooks(await listBooks());
    } catch (caught) {
      setBooks([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось прочитать библиотеку.",
      );
    }
  }, []);

  // revision меняется после каждой синхронизации, принёсшей новое: список
  // обязан подхватывать книги с других устройств без перезагрузки страницы.
  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const folders = useMemo(() => foldersOf(books ?? []), [books]);
  const loose = useMemo(() => countWithoutFolder(books ?? []), [books]);

  const shown = useMemo(() => {
    const all = books ?? [];
    if (view.kind === "all") return all;
    if (view.kind === "loose") return all.filter((book) => !book.folder);
    return all.filter((book) => book.folder === view.name);
  }, [books, view]);

  // Папка могла исчезнуть после того, как из неё вынули последнюю книгу, — в
  // этом случае возвращаемся ко всей библиотеке, а не показываем пустоту.
  useEffect(() => {
    if (view.kind !== "folder" || books === null) return;
    if (!folders.some((folder) => folder.name === view.name)) {
      setView({ kind: "all" });
    }
  }, [folders, view, books]);

  const afterChange = useCallback(async () => {
    await reload();
    if (account) void sync();
  }, [reload, account, sync]);

  const addText = useCallback(
    async (title: string, text: string) => {
      setError(null);
      try {
        const book = await importText(title, text);
        // Документ, добавленный внутри папки, в ней и остаётся: иначе
        // раскладку пришлось бы поправлять после каждого импорта.
        if (view.kind === "folder") await moveToFolder(book.id, view.name);
        await reload();
        // Новая книга уходит на сервер сразу, а не через две минуты: закрой
        // пользователь вкладку — она осталась бы только здесь.
        if (account) void sync();
        navigate(`/reader/${book.id}`);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось сохранить книгу.",
        );
      }
    },
    [navigate, reload, account, sync, view],
  );

  const readFile = useCallback(
    async (file: File) => {
      setError(null);
      setImportStage("reading");
      try {
        const document = await extractDocument(file, setImportStage);
        setImportStage("saving");
        await addText(document.title, document.text);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось прочитать документ.",
        );
      } finally {
        setImportStage(null);
      }
    },
    [addText],
  );

  // Зона броска — вся страница: целиться в узкую полосу между карточками книг
  // неудобно, а промах открыл бы файл в браузере вместо импорта.
  const { dragging } = useFileDrop({
    enabled: importStage === null,
    onFiles: (files) => {
      const file = pickImportableFile(files);
      if (file) void readFile(file);
    },
  });

  const createFolder = useCallback(() => {
    const name = normalizeFolder(window.prompt("Название папки") ?? "");
    if (!name) return;
    addDraftFolder(name);
    setView({ kind: "folder", name });
    void reload();
  }, [reload]);

  return (
    <main className="px-5 py-10 sm:py-14">
      <DropOverlay visible={dragging} />
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl">Моя библиотека</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--text-muted)]">
              <span>
                {books === null
                  ? "Загружаем…"
                  : books.length > 0
                    ? `${books.length} ${plural(books.length, "книга", "книги", "книг")}`
                    : "Пока пусто"}
              </span>
              <SyncBadge />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={createFolder}>
              Новая папка
            </Button>
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={importStage !== null}
            >
              {importStage ? (
                <>
                  <Spinner />
                  {IMPORT_STAGE_LABELS[importStage]}
                </>
              ) : (
                "Добавить документ"
              )}
            </Button>
          </div>
        </Reveal>

        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx,.fb2,.epub,.djvu,.djv,.html,text/plain,text/markdown,application/pdf,application/epub+zip,image/vnd.djvu,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
            // Сброс нужен, чтобы повторный выбор того же файла тоже сработал.
            event.target.value = "";
          }}
        />

        {error && (
          <div className="mb-6">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {!account && books !== null && books.length > 0 && (
          <Reveal className="mb-6">
            <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                Книги и папки хранятся только в этом браузере. Войдите, чтобы
                они появились на телефоне и компьютере.
              </p>
              <Link to="/login">
                <Button variant="secondary" size="sm">
                  Войти
                </Button>
              </Link>
            </Card>
          </Reveal>
        )}

        {books !== null && books.length > 0 && (
          <FolderBar
            view={view}
            folders={folders}
            total={books.length}
            loose={loose}
            onSelect={setView}
            onRename={async (from) => {
              const to = window.prompt("Новое название папки", from);
              if (!to) return;
              await renameFolder(books, from, to);
              setView({ kind: "folder", name: normalizeFolder(to) });
              await afterChange();
            }}
            onDissolve={async (name) => {
              if (
                !window.confirm(
                  `Убрать папку «${name}»? Книги останутся в библиотеке.`,
                )
              ) {
                return;
              }
              await dissolveFolder(books, name);
              setView({ kind: "all" });
              await afterChange();
            }}
          />
        )}

        <div
          className={[
            "rounded-3xl border-2 border-dashed p-1 transition-colors duration-200",
            dragging
              ? "border-[var(--accent)] bg-[var(--accent)]/5"
              : "border-transparent",
          ].join(" ")}
        >
          {books === null ? (
            <div className="flex min-h-48 items-center justify-center text-[var(--text-muted)]">
              <Spinner className="size-6" />
            </div>
          ) : books.length === 0 ? (
            <EmptyState onSample={() => void addText("Вук и орао", SAMPLE)} />
          ) : shown.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-lg">В этой папке пока пусто</p>
              <p className="mt-2 text-[var(--text-muted)]">
                Перетащите сюда документ или переложите книгу из другой папки.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {shown.map((book, index) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    index={index}
                    folders={folders.map((folder) => folder.name)}
                    onMove={async (folder) => {
                      await moveToFolder(book.id, folder);
                      await afterChange();
                    }}
                    onDelete={async () => {
                      await deleteBook(book.id);
                      await afterChange();
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function FolderBar({
  view,
  folders,
  total,
  loose,
  onSelect,
  onRename,
  onDissolve,
}: {
  view: View;
  folders: Array<{ name: string; count: number; draft: boolean }>;
  total: number;
  loose: number;
  onSelect: (view: View) => void;
  onRename: (name: string) => void;
  onDissolve: (name: string) => void;
}) {
  const active = view.kind === "folder" ? view.name : null;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <FolderChip
          active={view.kind === "all"}
          onClick={() => onSelect({ kind: "all" })}
          count={total}
        >
          Все книги
        </FolderChip>
        {loose > 0 && folders.length > 0 && (
          <FolderChip
            active={view.kind === "loose"}
            onClick={() => onSelect({ kind: "loose" })}
            count={loose}
          >
            Без папки
          </FolderChip>
        )}
        {folders.map((folder) => (
          <FolderChip
            key={folder.name}
            active={active === folder.name}
            onClick={() => onSelect({ kind: "folder", name: folder.name })}
            count={folder.count}
            draft={folder.draft}
          >
            {folder.name}
          </FolderChip>
        ))}
      </div>

      {active !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-[var(--text-muted)]">
          <button
            type="button"
            onClick={() => onRename(active)}
            className="font-semibold transition-colors hover:text-[var(--accent)]"
          >
            Переименовать
          </button>
          <button
            type="button"
            onClick={() => onDissolve(active)}
            className="font-semibold transition-colors hover:text-serb-red"
          >
            Убрать папку
          </button>
          {folders.find((folder) => folder.name === active)?.draft && (
            <span>
              Папка пуста и пока живёт только здесь — на другие устройства она
              уедет вместе с первой книгой.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FolderChip({
  active,
  count,
  draft = false,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  draft?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
        active
          ? "bg-[var(--accent)] text-parchment"
          : "bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]",
        draft && !active ? "opacity-70" : "",
      ].join(" ")}
    >
      {children}
      <span className="opacity-60">{count}</span>
    </button>
  );
}

function BookCard({
  book,
  index,
  folders,
  onMove,
  onDelete,
}: {
  book: BookMeta;
  index: number;
  folders: string[];
  onMove: (folder: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const progress =
    book.paragraphCount > 0
      ? Math.min(
          100,
          Math.round((book.lastParagraph / book.paragraphCount) * 100),
        )
      : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{
        duration: 0.32,
        delay: index * 0.04,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Card className="group h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
        <Link to={`/reader/${book.id}`} className="block p-5">
          <div className="flex items-start gap-2">
            <h3 className="line-clamp-2 flex-1 text-xl leading-snug">
              {book.title}
            </h3>
            {book.textMissing && (
              <span
                className="mt-1 shrink-0 rounded-full bg-[var(--accent)]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]"
                title="Книга с другого устройства — текст загрузится при открытии"
              >
                в облаке
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {book.paragraphCount}{" "}
            {plural(book.paragraphCount, "абзац", "абзаца", "абзацев")} ·{" "}
            {readingMinutes(book.paragraphCount)} мин
            {book.folder && <> · {book.folder}</>}
          </p>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{
                duration: 0.7,
                delay: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">
            {progress > 0 ? `Прочитано ${progress}%` : "Ещё не начата"}
          </p>
        </Link>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]"
          >
            {book.folder ? "Переложить" : "В папку"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-serb-red/10 hover:text-serb-red"
          >
            Удалить
          </button>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-[var(--line)] bg-[var(--bg-sunken)]"
            >
              <div className="flex flex-wrap gap-1.5 p-3">
                {book.folder && (
                  <MoveChip
                    onClick={() => {
                      setMenuOpen(false);
                      onMove("");
                    }}
                  >
                    Вынуть из папки
                  </MoveChip>
                )}
                {folders
                  .filter((name) => name !== book.folder)
                  .map((name) => (
                    <MoveChip
                      key={name}
                      onClick={() => {
                        setMenuOpen(false);
                        onMove(name);
                      }}
                    >
                      {name}
                    </MoveChip>
                  ))}
                <MoveChip
                  onClick={() => {
                    const name = window.prompt("Название папки") ?? "";
                    setMenuOpen(false);
                    if (name.trim()) onMove(name);
                  }}
                >
                  + Новая папка
                </MoveChip>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function MoveChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-[var(--bg-raised)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}

function EmptyState({ onSample }: { onSample: () => void }) {
  return (
    <Card className="paper-grain px-6 py-14 text-center">
      <div className="mx-auto mb-6 w-44">
        <Mascot pose="citavuk_zdravo" alt="" width={352} float />
      </div>
      <h2 className="text-2xl">Здесь появятся ваши книги</h2>
      <p className="mx-auto mt-3 max-w-md leading-relaxed text-[var(--text-muted)]">
        Перетащите сюда TXT, PDF, DOCX, FB2, EPUB или DjVu. PDF без текстового слоя
        будет автоматически распознан.
      </p>
      <Button onClick={onSample} className="mt-7" size="lg">
        Открыть рассказ
      </Button>
    </Card>
  );
}
