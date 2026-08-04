/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import db from './dataClient';
import { getHomeDashboardPath, getPreferredLandingPath, isHassanAwadUser, isPathAllowed, resolveSessionUserFromAuth } from './accessControl';
import { USE_FIREBASE } from './config/backend';
import { clearStaleAppLogin, ensureAuthSession } from './utils/authSession';
import { hasOAuthReturnParams, resolveAppUserFromSession, startGoogleSignIn } from './utils/googleAuth';
import { signInWithEmailPassword } from './utils/authLogin';

// App version string (unused)
const _bestrestAppVersion = "0c1e214ac027f84a7dc99eb41faf2199a2a2ced1d73c9eff6cb474e95f2c9d35";

function getCurrentLocalUser() {
  try {
    const raw = localStorage.getItem('user');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.id || parsed.email)) return parsed;
  } catch {}
  return null;
}

const QUOTATIONER_HOME_PATHS = new Set([
  '/quotationer',
  '/quotes-dashboard',
  '/quotesdashboard',
  '/QuotesDashboard',
]);

function normalizeNextPath(nextTarget) {
  const raw = String(nextTarget || '').trim();
  if (!raw) return { path: '', hasQuery: false, raw: '' };
  const normalizedRaw = raw.startsWith('/') ? raw : `/${raw}`;
  const [pathPart, queryPart] = normalizedRaw.split('?');
  const path = (pathPart || '/').replace(/\/+$/, '') || '/';
  return { path, hasQuery: Boolean(queryPart), raw: normalizedRaw };
}

function computeDestination(minimalUser, nextTarget) {
  const home = getHomeDashboardPath(minimalUser);
  const { path: nextPath, hasQuery, raw } = normalizeNextPath(nextTarget);

  if (raw && nextPath && isPathAllowed(minimalUser, nextPath)) {
    const isQuotationerHome = QUOTATIONER_HOME_PATHS.has(nextPath);
    if (!isHassanAwadUser(minimalUser) && isQuotationerHome && !hasQuery) {
      return home;
    }
    return raw;
  }

  const preferred = getPreferredLandingPath(minimalUser);
  if (preferred && isPathAllowed(minimalUser, preferred)) return preferred;

  return home;
}

function toMinimalUser(loginUser) {
  return resolveSessionUserFromAuth({
    id: loginUser.id || loginUser.user_uid,
    email: loginUser.email,
    full_name: loginUser.full_name || loginUser.name || null,
  });
}

function persistAppLogin(minimal) {
  localStorage.setItem('user', JSON.stringify(minimal));
  try { sessionStorage.setItem('bestrest:tabAuthed:v1', '1'); } catch {}
}

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search || '');
  const nextTarget = params.get('next');
  const oauthError = params.get('error_description') || params.get('error');

  React.useEffect(() => {
    let active = true;

    const finishLogin = (minimal) => {
      persistAppLogin(minimal);
      const dest = computeDestination(minimal, nextTarget);
      if (active) navigate(dest, { replace: true });
    };

    const maybeRedirect = async (localUser) => {
      if (!localUser) return;
      let tabAuthed = false;
      try {
        tabAuthed = sessionStorage.getItem('bestrest:tabAuthed:v1') === '1';
      } catch {}
      if (!tabAuthed) return;

      const sessionResult = await ensureAuthSession();
      if (!sessionResult.ok) {
        clearStaleAppLogin();
        return;
      }

      finishLogin(toMinimalUser(localUser));
    };

    const finishGoogleReturn = async () => {
      if (oauthError) {
        setError(String(oauthError));
        return;
      }

      let sessionReady = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const sessionResult = await ensureAuthSession();
        if (sessionResult.ok) {
          sessionReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!sessionReady && !hasOAuthReturnParams()) return;
      if (!sessionReady) {
        setError('Google sign-in did not return a session. Please try again.');
        return;
      }

      setGoogleLoading(true);
      try {
        const profile = await resolveAppUserFromSession();
        if (!profile.ok) {
          try { await db.auth.signOut(); } catch {}
          clearStaleAppLogin();
          setError(profile.error || 'Google account is not authorized for this app.');
          return;
        }
        setError('');
        finishLogin(toMinimalUser(profile.user));
      } catch (err) {
        try { await db.auth.signOut(); } catch {}
        clearStaleAppLogin();
        setError(err?.message || 'Google sign-in failed.');
      } finally {
        if (active) setGoogleLoading(false);
      }
    };

    (async () => {
      if (hasOAuthReturnParams() || oauthError) {
        await finishGoogleReturn();
        return;
      }
      await maybeRedirect(getCurrentLocalUser());
    })();

    return () => {
      active = false;
    };
  }, [navigate, nextTarget, oauthError]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setError('');
    try {
      const result = await signInWithEmailPassword(email, password);
      if (!result.ok) {
        setError(result.error || 'Invalid credentials, please try again.');
        setLoggingIn(false);
        return;
      }

      const minimal = toMinimalUser(result.user);
      persistAppLogin(minimal);
      const dest = computeDestination(minimal, nextTarget);
      navigate(dest, { replace: true });
      setLoggingIn(false);
    } catch (err) {
      setError(err?.message || 'An error occurred. Please try again.');
      setLoggingIn(false);
      console.error('Login Error:', err);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await startGoogleSignIn({
        nextTarget: nextTarget || '',
        returnPath: '/login',
      });
      if (USE_FIREBASE && result?.ok && result.user) {
        const minimal = toMinimalUser(result.user);
        persistAppLogin(minimal);
        navigate(computeDestination(minimal, nextTarget), { replace: true });
        return;
      }
    } catch (err) {
      setError(err?.message || 'Could not start Google sign-in.');
      console.error('Google login error:', err);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="login-container">
      <img src="/bestrest-logo.png" alt="Company Logo" className="logo" />
      <h2>Login</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" className="login-button" disabled={loggingIn || googleLoading}>
          {loggingIn ? 'Signing in...' : 'Login with email'}
        </button>
      </form>

      <div className="login-divider" aria-hidden="true">
        <span>or</span>
      </div>

      <button
        type="button"
        className="google-login-button"
        onClick={handleGoogleLogin}
        disabled={loggingIn || googleLoading}
      >
        <span className="google-login-icon" aria-hidden="true">G</span>
        {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
      </button>
      <p className="google-login-hint">
        {USE_FIREBASE
          ? 'Sign in with Firebase Auth — email/password or Google. Works on localhost and production.'
          : 'Sign in with your Firebase account — email/password or Google. Works on localhost and production.'}
      </p>
    </div>
  );
};

export default LoginPage;
