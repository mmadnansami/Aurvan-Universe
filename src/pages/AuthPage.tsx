import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { OFFICIAL_PLATFORM_LOGO_URL } from '../shared/defaultBootstrap';

type AuthMode = 'login' | 'register' | 'forgot';

export function AuthPage() {
  const { user, bootstrap, loginWithGoogle, login, register, sendPasswordReset } = usePlatform();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (user) {
    return <Navigate to={user.role === 'PLAYER' ? '/dashboard' : '/admin'} replace />;
  }

  const logoUrl = bootstrap?.settings?.platform_logo_url ?? OFFICIAL_PLATFORM_LOGO_URL;

  const handleGoogleSignIn = async () => {
    setError('');
    setInfo('');
    setGoogleLoading(true);
    try {
      const loggedUser = await loginWithGoogle();
      navigate(loggedUser.role === 'PLAYER' ? '/dashboard' : '/admin', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      navigate(loggedUser.role === 'PLAYER' ? '/dashboard' : '/admin', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await register(fullName, email, password);
      setInfo(
        'Account created! Check your email inbox for the verification link, or use "Continue with Google" above for instant verified access.'
      );
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setInfo('Password reset link sent to your email address. Check your inbox or spam folder.');
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#070B13] py-16 sm:py-24 px-4">
      <div className="mx-auto max-w-md rounded-lg border border-slate-800 bg-[#0B111E] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="space-y-2 border-b border-slate-800 pb-5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="AURVAN UNIVERSE"
              referrerPolicy="no-referrer"
              className="h-14 w-auto object-contain mb-3"
            />
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
            AURVAN UNIVERSE Access
          </p>
          <h1 className="font-display text-3xl font-semibold text-white">
            {mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? 'Create Investigator Account'
              : 'Forgot Password'}
          </h1>
          <p className="text-xs text-slate-400">
            Powered by Cloud Firestore & Firebase Auth. Your session stays active across browser visits until you sign out.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200 leading-relaxed">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-xs text-emerald-200 break-words leading-relaxed">
            {info}
          </div>
        )}

        {/* Primary Recommended Instant Cloud Login */}
        <div className="space-y-2.5">
          <button
            type="button"
            disabled={googleLoading || loading}
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-md border border-[#C9A45C]/70 bg-[#C9A45C] px-4 py-3 text-sm font-semibold text-[#070B13] shadow-lg transition hover:bg-[#D8B774] disabled:opacity-50"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-[#C9A45C] shrink-0" />
            <span>Recommended instant access for Directorate Admins & Investigators</span>
          </p>
        </div>

        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-slate-800" />
          <span className="mx-3 shrink-0 text-[11px] uppercase tracking-wider text-slate-500">
            Or Email Credentials
          </span>
          <div className="flex-grow border-t border-slate-800" />
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex rounded-md border border-slate-800 bg-[#070B13] p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 rounded py-2 transition-colors ${
              mode === 'login' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 rounded py-2 transition-colors ${
              mode === 'register' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2.5 text-sm font-semibold text-slate-200 hover:border-[#C9A45C]/60 hover:text-white disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In with Email'}
            </button>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <button type="button" onClick={() => setMode('forgot')} className="hover:text-white">
                Forgot Password?
              </button>
              <button type="button" onClick={() => setMode('register')} className="hover:text-white">
                Need an account?
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Investigator Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Tariq Rahman"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password (min. 8 characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a strong password"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-[#C9A45C] focus:outline-none"
              />
            </div>

            <p className="text-[11px] text-slate-400">
              All new accounts begin as Probationary Investigators in AURVAN POLICE.
            </p>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2.5 text-sm font-semibold text-slate-200 hover:border-[#C9A45C]/60 hover:text-white disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Registered Email Address
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-md border border-slate-700 bg-[#070B13] py-2.5 text-sm font-semibold text-slate-200 hover:border-[#C9A45C]/60 hover:text-white disabled:opacity-50"
            >
              {loading ? 'Sending Reset Email...' : 'Send Password Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-center text-xs text-slate-400 hover:text-white"
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
