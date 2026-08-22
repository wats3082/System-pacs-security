import { useEffect, useMemo, useState } from 'react';
import type { PasswordChallenge, UserSession } from './auth';
import { AuthClient } from './auth';
import { ApiClient } from './api';
import type { RuntimeConfig } from './config';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { EventsPage } from './pages/EventsPage';
import { VideosPage } from './pages/VideosPage';
import './App.css';

type Page = 'dashboard' | 'events' | 'devices' | 'videos';

const pages: Array<{ id: Page; label: string; eyebrow: string }> = [
  { id: 'dashboard', label: 'Operations', eyebrow: 'KPI' },
  { id: 'events', label: 'Access audit', eyebrow: 'EV' },
  { id: 'devices', label: 'Device fleet', eyebrow: 'DV' },
  { id: 'videos', label: 'Video library', eyebrow: 'VM' },
];

export default function App({ config }: { config: RuntimeConfig }) {
  const auth = useMemo(() => new AuthClient(config), [config]);
  const api = useMemo(() => new ApiClient(config, auth), [config, auth]);
  const [session, setSession] = useState<UserSession | null>(null);
  const [challenge, setChallenge] = useState<PasswordChallenge | null>(null);
  const [active, setActive] = useState<Page>('dashboard');
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    auth.restore()
      .then(setSession)
      .catch((error: unknown) => {
        auth.signOut();
        setAuthError(errorMessage(error));
      })
      .finally(() => setBooting(false));
  }, [auth]);

  const signIn = async (form: FormData) => {
    setSubmitting(true);
    setAuthError('');
    try {
      const result = await auth.signIn(
        String(form.get('email')),
        String(form.get('password')),
      );
      if (result.kind === 'newPassword') setChallenge(result.challenge);
      else setSession(result.session);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const completePassword = async (form: FormData) => {
    if (!challenge) return;
    setSubmitting(true);
    setAuthError('');
    try {
      setSession(await auth.completeNewPassword(challenge, String(form.get('password'))));
      setChallenge(null);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (booting) return <FullPageState title="Restoring secure session" />;
  if (!session) {
    return (
      <SignIn
        challenge={challenge}
        error={authError}
        submitting={submitting}
        onSignIn={signIn}
        onCompletePassword={completePassword}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div><strong>Sentinel Ops</strong><small>Unified control plane</small></div>
        </div>
        <nav aria-label="Primary navigation">
          {pages.map((page) => (
            <button
              key={page.id}
              className={active === page.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(page.id)}
              aria-current={active === page.id ? 'page' : undefined}
            >
              <span>{page.eyebrow}</span>{page.label}
            </button>
          ))}
        </nav>
        <div className="session-card">
          <small>Signed in</small>
          <strong title={session.email}>{session.email}</strong>
          <button onClick={() => {
            if (config.demoMode) window.location.reload();
            else { auth.signOut(); setSession(null); }
          }}>{config.demoMode ? 'Reset demo' : 'Sign out'}</button>
        </div>
      </aside>
      <main>
        {config.demoMode && (
          <div className="demo-banner" role="status">
            <strong>Public portfolio simulation</strong>
            <span>Data stays in this browser session; no live readers, credentials, or backend are connected.</span>
          </div>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">Security Operations Platform</p>
            <h1>{pages.find((page) => page.id === active)?.label}</h1>
          </div>
          <span className="live-pill"><i /> {config.demoMode ? 'Simulation ready' : 'Authenticated'}</span>
        </header>
        <div className="page-content">
          {active === 'dashboard' && <DashboardPage api={api} />}
          {active === 'events' && <EventsPage api={api} />}
          {active === 'devices' && <DevicesPage api={api} />}
          {active === 'videos' && <VideosPage api={api} />}
        </div>
      </main>
    </div>
  );
}

function SignIn({
  challenge,
  error,
  submitting,
  onSignIn,
  onCompletePassword,
}: {
  challenge: PasswordChallenge | null;
  error: string;
  submitting: boolean;
  onSignIn: (form: FormData) => Promise<void>;
  onCompletePassword: (form: FormData) => Promise<void>;
}) {
  const submit = (action: (form: FormData) => Promise<void>) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void action(new FormData(event.currentTarget));
    };
  return (
    <div className="auth-page">
      <section className="auth-intro">
        <p className="eyebrow">Unified physical security</p>
        <h1>Operate access, devices, and video from one auditable workspace.</h1>
        <p>Live operational metrics backed by persisted AWS data. No demo substitutions.</p>
      </section>
      <section className="auth-card">
        <div className="brand compact"><span className="brand-mark">S</span><strong>Sentinel Ops</strong></div>
        <h2>{challenge ? 'Set a permanent password' : 'Sign in to operations'}</h2>
        <p>{challenge
          ? 'Your administrator issued a temporary password. Replace it to continue.'
          : 'Use the Cognito account created by your platform administrator.'}</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form onSubmit={submit(challenge ? onCompletePassword : onSignIn)}>
          {!challenge && (
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          )}
          <label>{challenge ? 'New password' : 'Password'}
            <input
              name="password"
              type="password"
              autoComplete={challenge ? 'new-password' : 'current-password'}
              minLength={12}
              required
            />
          </label>
          <button className="primary" disabled={submitting}>
            {submitting ? 'Working...' : challenge ? 'Set password and continue' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}

function FullPageState({ title }: { title: string }) {
  return <div className="full-state"><span className="spinner" />{title}</div>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation failed';
}
