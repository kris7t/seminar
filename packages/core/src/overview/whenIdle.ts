/** Calls `callback` during idle time, with a fallback for older browsers. */
export function whenIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback, { timeout: 1000 });
    return () => {
      cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(callback, 50);
  return () => {
    clearTimeout(handle);
  };
}
