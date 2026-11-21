import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

// Sent by api.js when the server says the session is over, so every part of the site finds out at once.
export const SIGNED_OUT = 'wf-signed-out';

async function send(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await response.json(); } catch { /* no body */ }
  return { ok: response.ok, status: response.status, data };
}

// Who is signed in. `status` is 'checking' until the server has answered, then 'in' or 'out'.
// The session itself is a cookie the browser keeps and scripts cannot read; nothing is stored here.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    let live = true;
    send('/api/auth/me')
      .then((answer) => { if (live) setState(answer.ok ? { status: 'in', user: answer.data } : { status: 'out', user: null }); })
      .catch(() => { if (live) setState({ status: 'out', user: null }); });
    const ended = () => setState({ status: 'out', user: null });
    window.addEventListener(SIGNED_OUT, ended);
    return () => { live = false; window.removeEventListener(SIGNED_OUT, ended); };
  }, []);

  const signIn = useCallback(async (email, password) => {
    let answer;
    try { answer = await send('/api/auth/login', { email, password }); } catch { return 'The site could not be reached. Check that it is running and try again.'; }
    if (answer.ok) { setState({ status: 'in', user: answer.data }); return null; }
    return (answer.data && typeof answer.data.detail === 'string' && answer.data.detail) || 'Sign-in did not work. Try again.';
  }, []);

  const signOut = useCallback(async () => {
    try { await send('/api/auth/logout', {}); } catch { /* the cookie will lapse on its own */ }
    setState({ status: 'out', user: null });
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
