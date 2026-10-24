import React, { Component, type ErrorInfo, type ReactNode } from 'react';

const CHUNK_ERROR =
  /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i;

/** A failed lazy-page download. React.lazy caches the rejection, so only a reload recovers. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' || CHUNK_ERROR.test(error.message);
}

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. the active view), a previous error is cleared. */
  resetKey?: string;
  /** Test seam; defaults to window.location.reload. */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View error caught by ViewErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reload = () => (this.props.onReload ?? (() => window.location.reload()))();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-2xl border border-negative/30 bg-negative-soft px-6 py-10 text-center"
      >
        <h2 className="text-ui-base font-semibold text-foreground">
          {chunk ? 'Az oldal nem töltődött be' : 'Hiba történt a nézet megjelenítésekor'}
        </h2>
        <p className="mt-2 max-w-prose text-ui-sm text-muted-foreground">
          {chunk
            ? 'A hálózat megszakadt, vagy az alkalmazás közben frissült. Töltsd újra az oldalt.'
            : error.message || 'Váratlan hiba. A többi nézet használható.'}
        </p>
        <button
          type="button"
          onClick={chunk ? this.reload : () => this.setState({ error: null })}
          className="mt-4 rounded-lg bg-signal px-4 py-2 text-ui-sm font-medium text-signal-foreground focus:outline-none focus:ring-2 focus:ring-signal focus:ring-offset-2 focus:ring-offset-background"
        >
          {chunk ? 'Oldal újratöltése' : 'Újrapróbálkozás'}
        </button>
      </div>
    );
  }
}
