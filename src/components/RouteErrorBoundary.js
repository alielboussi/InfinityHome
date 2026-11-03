import React from 'react';

function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
}

export default class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[RouteErrorBoundary]', error, info?.componentStack);
    if (typeof window === 'undefined' || !isChunkLoadError(error)) return;
    try {
      const path = window.location.pathname || '/';
      const flag = `ih_chunk_reload:${path}`;
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
      window.location.reload();
    } catch (_) {
      /* ignore storage errors */
    }
  }

  componentDidUpdate(prevProps) {
    const { resetKey } = this.props;
    if (resetKey !== prevProps.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    return (
      <div className="app-route-error" role="alert">
        <p className="app-route-error__title">{chunk ? 'This page failed to load' : 'Something went wrong'}</p>
        <p className="app-route-error__message">{String(error?.message || error)}</p>
        <button
          type="button"
          className="app-route-error__btn"
          onClick={() => {
            if (chunk) window.location.reload();
            else this.setState({ error: null });
          }}
        >
          {chunk ? 'Reload page' : 'Try again'}
        </button>
      </div>
    );
  }
}
