import { useState } from 'react';
import logo from '../assets/wf_isaca_logo.png';
import { useAuth } from '../auth.jsx';
import { PoweredBy } from '../Shell.jsx';

// The only page a visitor sees until they sign in.
export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const failed = await signIn(email, password);
    setBusy(false);
    if (failed) { setProblem(failed); setPassword(''); }
  };

  return (
    <div className="wf-shell wf-signin">
      <main className="wf-signin-card">
        <div className="wf-side-brand wf-signin-brand"><img src={logo} alt="ISACA West Florida Chapter" width="462" height="160" /></div>
        <h1 className="wf-signin-title">Sign in</h1>
        <p className="wf-signin-note">For chapter board members. Ask the site administrator if you need an account.</p>
        <form onSubmit={submit} noValidate>
          <label className="wf-field">Email
            <input type="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck="false" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="wf-field">Password
            <input type="password" name="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {problem && <p className="wf-signin-problem" role="alert">{problem}</p>}
          <button type="submit" className="wf-signin-go" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </main>
      <div className="wf-signin-foot"><PoweredBy /></div>
    </div>
  );
}
