import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { usePlatform } from '../context/PlatformContext';
import { OFFICIAL_PLATFORM_LOGO_URL } from '../shared/defaultBootstrap';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';

export function AuthPage() {
  const { user, bootstrap, login, register } = usePlatform();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (user) {
    return <Navigate to={user.role === 'PLAYER' ? '/dashboard' : '/admin'} replace />;
  }

  const logoUrl = bootstrap?.settings?.platform_logo_url ?? OFFICIAL_PLATFORM_LOGO_URL;

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
      const res = await register(fullName, email, password);
      if (res.verificationToken) {
        await apiFetch('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token: res.verificationToken }),
        }).catch(() => undefined);
      }
      navigate('/dashboard', { replace: true });
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
      const res = await apiFetch<{ message: string; resetTokenPreview?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo(
        res.resetTokenPreview
          ? `${res.message} Token: ${res.resetTokenPreview}`
          : res.message
      );
      if (res.resetTokenPreview) {
        setTokenInput(res.resetTokenPreview);
        setMode('reset');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: tokenInput, newPassword }),
      });
      setInfo(res.message);
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: tokenInput }),
      });
      setInfo(res.message);
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
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
              : mode === 'forgot'
              ? 'Forgot Password'
              : mode === 'reset'
              ? 'Reset Password'
              : 'Verify Email'}
          </h1>
          <p className="text-xs text-slate-400">
            Your session remains active in this browser until you explicitly sign out.
          </p>
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
              mode === 'login' ? 'bg-[#C9A45C] text-[#070B13] font-semibold' : 'text-slate-400 hover:text-white'
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
              mode === 'register' ? 'bg-[#C9A45C] text-[#070B13] font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/50 px-3.5 py-2.5 text-xs text-emerald-200 break-words">
            {info}
          </div>
        )}

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
              disabled={loading}
              className="w-full rounded-md bg-[#C9A45C] py-2.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774] disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <button type="button" onClick={() => setMode('forgot')} className="hover:text-white">
                Forgot Password?
              </button>
              <button type="button" onClick={() => setMode('verify')} className="hover:text-white">
                Verify Email Token
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
              disabled={loading}
              className="w-full rounded-md bg-[#C9A45C] py-2.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774] disabled:opacity-50"
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
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#C9A45C] py-2.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              {loading ? 'Generating Token...' : 'Request Password Reset'}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label htmlFor="reset-token" className="block text-xs font-medium text-slate-300 mb-1.5">
                Reset Token
              </label>
              <input
                id="reset-token"
                type="text"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white font-mono-tabular focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reset-pass" className="block text-xs font-medium text-slate-300 mb-1.5">
                New Password (min. 8 characters)
              </label>
              <input
                id="reset-pass"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#C9A45C] py-2.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="verify-token" className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Verification Token
              </label>
              <input
                id="verify-token"
                type="text"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-[#070B13] px-3.5 py-2.5 text-sm text-white font-mono-tabular focus:border-[#C9A45C] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#C9A45C] py-2.5 text-sm font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              Verify Email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
