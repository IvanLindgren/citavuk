import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * A rejected lazy import or a malformed lesson must never leave a blank page.
 * The boundary is keyed by the route in App, so navigation creates a fresh one.
 */
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('page render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-[60vh] items-center justify-center px-5 py-16">
        <section className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 text-center shadow-sm sm:p-10">
          <img
            src="/img/citavuk_rule.webp"
            srcSet="/img/citavuk_rule.webp 1x, /img/citavuk_rule@2x.webp 2x"
            alt=""
            width={160}
            className="mx-auto mb-5 w-32"
          />
          <h1 className="text-2xl sm:text-3xl">Страница не загрузилась</h1>
          <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">
            Возможно, сайт обновился, пока эта вкладка была открыта. Обновите
            страницу: прогресс урока сохранится.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-parchment transition-colors hover:bg-[var(--accent-hover)]"
            >
              Обновить страницу
            </button>
            <a
              href="/course"
              className="rounded-xl border border-[var(--line)] px-5 py-3 font-semibold"
            >
              К карте курса
            </a>
          </div>
        </section>
      </main>
    );
  }
}
