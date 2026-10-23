import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveSessionUserFromAuth } from '../accessControl';
import { signInWithEmailPassword } from '../utils/authLogin';
import { ensureAuthSession } from '../utils/authSession';
import { fetchProductionKioskAccess } from '../services/warehouseProductionApi';
import { tUi } from '../utils/productionKioskI18n';
import { readProductionKioskLocale } from './productionKioskLocale';

function persistAppLogin(minimal) {
  localStorage.setItem('user', JSON.stringify(minimal));
  try { sessionStorage.setItem('bestrest:tabAuthed:v1', '1'); } catch {}
}

export default function WarehouseProductionLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locale = readProductionKioskLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams(location.search || '');
  const nextTarget = params.get('next') || '/warehouse-production';

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await signInWithEmailPassword(email, password);
      if (!result.ok) {
        setError(result.error || tUi('loginError', locale));
        return;
      }
      const minimal = resolveSessionUserFromAuth({
        id: result.user.id || result.user.user_uid,
        email: result.user.email,
        full_name: result.user.full_name || result.user.name,
      });
      persistAppLogin(minimal);
      const session = await ensureAuthSession();
      if (!session.ok) {
        setError(tUi('loginError', locale));
        return;
      }
      const access = await fetchProductionKioskAccess();
      if (!access.allowed) {
        setError(tUi('loginNoAccess', locale));
        return;
      }
      navigate(nextTarget.startsWith('/warehouse-production') ? nextTarget : '/warehouse-production', { replace: true });
    } catch (err) {
      setError(err?.message || tUi('loginError', locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="warehouse-production-kiosk warehouse-production-kiosk--login" dir={dir}>
      <img src="/bestrest-logo.png" alt="" className="warehouse-production-kiosk__logo" />
      <h1 className="warehouse-production-kiosk__title">{tUi('loginTitle', locale)}</h1>
      {error ? <div className="warehouse-production-kiosk__notice warehouse-production-kiosk__notice--err">{error}</div> : null}
      <form className="warehouse-production-kiosk__card" onSubmit={onSubmit}>
        <label className="warehouse-production-kiosk__label" htmlFor="prod-login-email">
          {tUi('loginEmail', locale)}
        </label>
        <input
          id="prod-login-email"
          className="warehouse-production-kiosk__input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          required
        />
        <label className="warehouse-production-kiosk__label" htmlFor="prod-login-password">
          {tUi('loginPassword', locale)}
        </label>
        <input
          id="prod-login-password"
          className="warehouse-production-kiosk__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          required
        />
        <button
          type="submit"
          className="warehouse-production-kiosk__btn warehouse-production-kiosk__btn--primary"
          disabled={busy}
        >
          {busy ? tUi('loading', locale) : tUi('loginButton', locale)}
        </button>
      </form>
    </div>
  );
}
