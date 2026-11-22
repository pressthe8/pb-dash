import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { FirebaseError } from 'firebase/app';
import { AppFooter, Brand } from '../components/Brand';
import { WakeArt } from '../components/WorkoutArt';

type AuthMode = 'signin' | 'signup';

export const LoginPage: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  
  // Form state
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      
      // Handle Firebase auth errors with user-friendly messages
      switch (error instanceof FirebaseError ? error.code : '') {
        case 'auth/user-not-found':
          setError('No account found with this email address');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Email or password is incorrect');
          break;
        case 'auth/email-already-in-use':
          setError('An account with this email already exists');
          break;
        case 'auth/weak-password':
          setError('Password should be at least 6 characters');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later');
          break;
        default:
          setError('Authentication failed. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google sign-in error:', error);
      setError('Google sign-in failed. Please try again');
    } finally {
      setGoogleLoading(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const busy = loading || googleLoading || resetting;

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setError('');
    setResetEmailSent(false);
    setResetting(true);

    try {
      await resetPassword(email);
      setResetEmailSent(true);
    } catch (error) {
      console.error('Password reset error:', error);
      switch (error instanceof FirebaseError ? error.code : '') {
        case 'auth/user-not-found':
          setError('No account found with this email address');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address');
          break;
        default:
          setError('Failed to send reset email. Please try again');
      }
    } finally {
      setResetting(false);
    }
  };

  const signingIn = authMode === 'signin';

  function changeMode(mode: AuthMode) {
    setAuthMode(mode);
    setError('');
    setResetEmailSent(false);
    setShowPassword(false);
  }

  return (
    <div className="pb-app">
      <header className="pb-header">
        <div className="pb-wrap pb-mast">
          <Brand to="/login" />
          <span className="pb-mast-note pb-label">Concept2 performance tracker</span>
        </div>
      </header>
      <main className="pb-wrap pb-login">
        <div className="pb-login-frame">
          <section className="pb-login-art">
            <WakeArt />
            <div className="pb-login-copy">
              <h1>Train today.<br /><em>Beat yesterday.</em></h1>
              <p>Connect your Concept2 Logbook to see your personal bests, track your pace and look back on a year of training.</p>
            </div>
            <ul className="pb-login-sports pb-label" aria-label="Supported machines">
              <li>RowErg</li><li>BikeErg</li><li>SkiErg</li>
            </ul>
          </section>

          <section className="pb-auth" aria-labelledby="auth-title">
            <div className="pb-auth-inner">
              <div className="pb-switch" role="group" aria-label="Account access">
                <button type="button" aria-pressed={signingIn} onClick={() => changeMode('signin')} disabled={busy}>Sign in</button>
                <button type="button" aria-pressed={!signingIn} onClick={() => changeMode('signup')} disabled={busy}>Create account</button>
              </div>
              <h2 id="auth-title">{signingIn ? 'Welcome back.' : 'Start tracking PBs.'}</h2>
              <p className="pb-auth-intro">{signingIn ? 'Sign in to see your training.' : 'Create an account to connect your Logbook.'}</p>

              <button className="pb-button pb-google" type="button" onClick={handleGoogleSignIn} disabled={busy}>
                {googleLoading ? <LoadingSpinner size="sm" /> : <GoogleMark />}
                {googleLoading ? 'Signing in…' : 'Continue with Google'}
              </button>
              <div className="pb-divider">or use email</div>

              {resetEmailSent && <p className="pb-feedback" role="status">Reset email sent. Check your inbox for a link.</p>}
              {error && <p className="pb-feedback pb-error" role="alert">{error}</p>}

              <form className="pb-auth-form" onSubmit={handleEmailAuth}>
                <div>
                  <label htmlFor="pb-email">Email address</label>
                  <input id="pb-email" type="email" autoComplete="email" value={email}
                    onChange={event => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} required />
                </div>
                <div>
                  <div className="pb-password-label">
                    <label htmlFor="pb-password">Password</label>
                    {signingIn && <button className="pb-text-button" type="button" onClick={handleForgotPassword} disabled={busy}>
                      {resetting ? 'Sending…' : 'Forgot password?'}
                    </button>}
                  </div>
                  <div className="pb-password">
                    <input id="pb-password" type={showPassword ? 'text' : 'password'}
                      autoComplete={signingIn ? 'current-password' : 'new-password'}
                      value={password} onChange={event => setPassword(event.target.value)}
                      placeholder={signingIn ? 'Enter your password' : 'At least 6 characters'}
                      minLength={signingIn ? undefined : 6} disabled={busy} required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'} disabled={busy}>
                      {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <button className="pb-button pb-primary pb-auth-submit" type="submit" disabled={busy}>
                  {loading ? 'Please wait…' : signingIn ? 'Sign in' : 'Create account'}
                  {loading ? <LoadingSpinner size="sm" /> : <ArrowRight size={18} aria-hidden="true" />}
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
      <AppFooter />
    </div>
  );
};

function GoogleMark() {
  return (
          <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
  );
}
