import { useState, useEffect } from 'react';
import { App as KonstaApp, Preloader } from 'konsta/react';
import type { User } from './api/auth';
import { getMe } from './api/auth';
import { detectTheme } from './lib/theme';
import { SESSION_EXPIRED_EVENT } from './lib/http';
import { disconnectSocket } from './lib/socket';
import { clearSession, savedToken } from './lib/session';
import { clearOfflineData, loadProfile, saveProfile, setOfflineOwner } from './lib/offline';
import { LoginView } from './components/LoginView';
import { SignUpView } from './components/SignUpView';
import { ForgotPasswordView } from './components/ForgotPasswordView';
import { MainShell } from './components/MainShell';
import { UpdateBanner } from './components/UpdateBanner';

type ViewMode = 'login' | 'signup' | 'forgot_password' | 'dashboard';

const theme = detectTheme();

/** The user id a login token was issued for (the token is only read here, never trusted: the server checks it) */
function tokenOwner(token: string): string {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(part)).sub ?? '');
  } catch {
    return '';
  }
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('login');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(() => !!savedToken());

  // Restore the session from the saved token when the app opens
  useEffect(() => {
    const token = savedToken();
    if (!token) return;

    getMe()
      .then((user) => {
        setOfflineOwner(user.id);
        void saveProfile(user);
        setCurrentUser(user);
        setViewMode('dashboard');
      })
      .catch(async (e: { status?: number }) => {
        // No connection (phone offline, airplane mode): do NOT log out. Open the app with the saved profile,
        // so recent messages can be read and new ones written (they are sent when the connection is back).
        if (e?.status === undefined || e.status === 0) {
          const profile = await loadProfile<User>();
          if (profile && profile.id === tokenOwner(token)) {
            setOfflineOwner(profile.id);
            setCurrentUser(profile);
            setViewMode('dashboard');
            return;
          }
        }
        // A real "no": the login ended or is not valid
        clearSession();
        void clearOfflineData();
        setCurrentUser(null);
        setViewMode('login');
      })
      .finally(() => setInitialLoading(false));
  }, []);

  // The server (or the inactivity timer) ended the login: back to the login screen with an explanation
  useEffect(() => {
    const onExpired = (e: Event) => {
      disconnectSocket();
      void clearOfflineData();
      setCurrentUser(null);
      setViewMode('login');
      setSessionNotice((e as CustomEvent<string>).detail || 'Your session ended. Please log in again.');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const handleLoggedIn = (user: User) => {
    setOfflineOwner(user.id);
    void saveProfile(user);
    setSessionNotice(null);
    setCurrentUser(user);
    setViewMode('dashboard');
  };

  const handleLogout = () => {
    setSessionNotice(null);
    setCurrentUser(null);
    setViewMode('login');
  };

  return (
    // On a phone the app fills the screen. On a laptop it stays phone-width in the middle.
    // "transform" makes the fixed tab bar stay inside this column instead of the whole window.
    <div className="mx-auto h-dvh w-full max-w-[480px] relative overflow-hidden bg-white md:shadow-2xl [transform:translateZ(0)]">
      <KonstaApp theme={theme} safeAreas>
        {initialLoading ? (
          <div className="h-full flex items-center justify-center">
            <Preloader />
          </div>
        ) : (
          <>
            {viewMode === 'login' && (
              <LoginView
                onLoginSuccess={handleLoggedIn}
                onNavigateToSignUp={() => setViewMode('signup')}
                onNavigateToForgotPassword={() => setViewMode('forgot_password')}
                notice={sessionNotice}
              />
            )}
            {viewMode === 'signup' && (
              <SignUpView onSignUpSuccess={() => setViewMode('login')} onNavigateToLogin={() => setViewMode('login')} />
            )}
            {viewMode === 'forgot_password' && (
              <ForgotPasswordView onResetSuccess={handleLoggedIn} onNavigateToLogin={() => setViewMode('login')} />
            )}
            {viewMode === 'dashboard' && currentUser && <MainShell user={currentUser} onLogout={handleLogout} />}
          </>
        )}
        <UpdateBanner />
      </KonstaApp>
    </div>
  );
}

export default App;
