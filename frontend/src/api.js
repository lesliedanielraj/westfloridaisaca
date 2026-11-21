import { useEffect, useState } from 'react';
import { SIGNED_OUT } from './auth.jsx';

// Builds "?a=1&b=2", leaving out empty values.
export function query(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') q.set(key, value);
  });
  const text = q.toString();
  return text ? `?${text}` : '';
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal, credentials: 'same-origin' });
  if (res.status === 401) window.dispatchEvent(new Event(SIGNED_OUT)); // the session ended: show the sign-in page
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body && body.detail) || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Fetches /api<path> with the given parameters, again whenever they change.
// The last answer stays in `data` while a new one loads, so charts don't blank out.
export function useApi(path, params) {
  const url = path ? `/api${path}${query(params)}` : null;
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    getJson(url, controller.signal).then(
      (data) => setState({ data, error: null, loading: false }),
      (err) => { if (err.name !== 'AbortError') setState({ data: null, error: err.message, loading: false }); },
    );
    return () => controller.abort();
  }, [url]);
  return state;
}
