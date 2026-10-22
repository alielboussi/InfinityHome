import React from 'react';

export default function RouteLoadingFallback() {
  return (
    <div className="app-route-fallback" role="status" aria-live="polite">
      <span className="app-route-fallback__spinner" aria-hidden="true" />
      <span>Loading page…</span>
    </div>
  );
}
