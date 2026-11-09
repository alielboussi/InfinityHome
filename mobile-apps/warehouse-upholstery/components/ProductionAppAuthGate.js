import FirebaseAuthGate from '../shared/AuthGate';
import ProductionKioskTopBar from './ProductionKioskTopBar';
import { useProductionKioskLocale } from '../hooks/useProductionKioskLocale';
import { tUi } from '../lib/productionKioskI18n';

/** Sign-in + Arabic toggle for Production, Carpentry, and Delivery kiosk apps. */
export default function ProductionAppAuthGate({
  titleKey = 'dashTitle',
  children,
  signInMethods = 'google',
}) {
  const { locale, toggleLocale } = useProductionKioskLocale();
  const allowEmail = signInMethods === 'email' || signInMethods === 'both';
  const allowGoogle = signInMethods === 'google' || signInMethods === 'both';
  const hintKey = allowGoogle && !allowEmail ? 'loginHintGoogle' : 'loginHintBoth';

  return (
    <FirebaseAuthGate
      showUserBar={false}
      signInMethods={signInMethods}
      signInHeader={(
        <ProductionKioskTopBar
          title={tUi(titleKey, locale)}
          locale={locale}
          onToggleLocale={toggleLocale}
        />
      )}
      signInHint={tUi(hintKey, locale)}
      signInEmailPlaceholder={tUi('loginEmail', locale)}
      signInPasswordPlaceholder={tUi('loginPassword', locale)}
      signInButtonLabel={tUi('loginButton', locale)}
      signInSigningInLabel={tUi('loginSigningIn', locale)}
      googleButtonLabel={tUi('loginGoogle', locale)}
      googleSigningInLabel={tUi('loginSigningIn', locale)}
      googleNotConfiguredLabel={tUi('loginGoogleNotConfigured', locale)}
      loginNotAllowedLabel={tUi('loginNotAllowed', locale)}
      signInFailedLabel={tUi('loginFailed', locale)}
    >
      {children}
    </FirebaseAuthGate>
  );
}
