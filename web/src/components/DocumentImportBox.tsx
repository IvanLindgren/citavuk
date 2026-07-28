import { useCallback, useRef, useState } from "react";

import { DropOverlay } from "./DropOverlay";
import { Button, Card, ErrorNote, Spinner } from "./ui";
import { importText } from "../lib/books";
import {
  extractDocument,
  extractDocumentFromUrl,
  IMPORT_STAGE_LABELS,
  type ImportedDocument,
  type ImportStage,
} from "../lib/documentImport";
import { useRouter } from "../lib/router";
import { pickImportableFile, useFileDrop } from "../lib/useFileDrop";
import { useAuth } from "../state/auth";
import { useSync } from "../state/sync";

const ACCEPTED_DOCUMENTS =
  ".txt,.md,.pdf,.docx,.fb2,.epub,.djvu,.djv,.html,text/plain,text/markdown,application/pdf,application/epub+zip,image/vnd.djvu,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function DocumentImportBox() {
  const { navigate } = useRouter();
  const { account } = useAuth();
  const { sync } = useSync();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<ImportStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (document: ImportedDocument) => {
      setStage("saving");
      const book = await importText(document.title, document.text);
      if (account) void sync();
      navigate(`/reader/${book.id}`);
    },
    [account, navigate, sync],
  );

  const importFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        await save(await extractDocument(file, setStage));
      } catch (caught) {
        setError(messageOf(caught, "Не удалось прочитать документ."));
      } finally {
        setStage(null);
      }
    },
    [save],
  );

  const importUrl = useCallback(async () => {
    setError(null);
    try {
      await save(await extractDocumentFromUrl(url, setStage));
    } catch (caught) {
      setError(messageOf(caught, "Не удалось добавить документ по ссылке."));
    } finally {
      setStage(null);
    }
  }, [save, url]);

  const busy = stage !== null;

  // Зона броска — вся страница, а не только эта карточка: промах мимо неё
  // означал бы, что браузер откроет файл вместо импорта.
  const { dragging } = useFileDrop({
    enabled: !busy,
    onFiles: (files) => {
      const file = pickImportableFile(files);
      if (file) void importFile(file);
    },
  });

  return (
    <>
      <DropOverlay visible={dragging} />
      <Card
        className={[
          "paper-grain p-5 transition-colors sm:p-7",
          dragging ? "border-[var(--accent)] bg-[var(--accent)]/5" : "",
        ].join(" ")}
      >
        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl">Откройте свой текст</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                TXT, Markdown, PDF, DOCX, FB2, EPUB и DjVu — с устройства или по публичной ссылке.
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Или просто перетащите файл в окно.
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <>
                  <Spinner />
                  {IMPORT_STAGE_LABELS[stage]}
                </>
              ) : (
                "Выбрать файл"
              )}
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_DOCUMENTS}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = "";
            }}
          />

          <form
            className="mt-5 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void importUrl();
            }}
          >
            <label className="sr-only" htmlFor="landing-document-url">
              Ссылка на документ или статью
            </label>
            <input
              id="landing-document-url"
              type="text"
              inputMode="url"
              value={url}
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.rs/tekst или ссылка на файл книги"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-raised)] px-4 py-3 text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-muted)]/70 focus:border-[var(--accent)]"
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={busy || !url.trim()}
            >
              Добавить по ссылке
            </Button>
          </form>

          {error && (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}
