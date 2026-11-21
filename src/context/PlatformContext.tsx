import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
import {
  DEFAULT_BOOTSTRAP_DATA,
  isValidBootstrapPayload,
  type BootstrapPayload,
} from '../shared/defaultBootstrap';
import type { PublicUser } from '../shared/types';

export type BootstrapData = BootstrapPayload;

const BOOTSTRAP_CACHE_KEY = 'aurvan_cache_bootstrap_v1';
const AUTH_HINT_KEY = 'aurvan_has_auth_hint';

function readCachedBootstrap(): BootstrapData {
  if (typeof window === 'undefined') return DEFAULT_BOOTSTRAP_DATA;
  try {
    const raw = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidBootstrapPayload(parsed)) {
        return {
          ...DEFAULT_BOOTSTRAP_DATA,
          ...parsed,
          settings: { ...DEFAULT_BOOTSTRAP_DATA.settings, ...(parsed.settings || {}) },
          content: { ...DEFAULT_BOOTSTRAP_DATA.content, ...(parsed.content || {}) },
        };
      }
    }
  } catch {
    // Fallback cleanly to default bootstrap
  }
  return DEFAULT_BOOTSTRAP_DATA;
}

function readAuthHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUTH_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAuthHint(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      window.localStorage.setItem(AUTH_HINT_KEY, '1');
    } else {
      window.localStorage.removeItem(AUTH_HINT_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function isAuthSensitivePath(): boolean {
  if (typeof window === 'undefined') return false;
  const p = window.location.pathname || '/';
  return (
    p.startsWith('/auth') ||
    p.startsWith('/dashboard') ||
    p.startsWith('/admin') ||
    p.startsWith('/investigate')
  );
}

let firebaseModulesPromise: Promise<{
  firebaseAuth: typeof import('firebase/auth');
  firebaseLib: typeof import('../lib/firebase');
  firebaseBackend: typeof import('../lib/firebaseBackend');
}> | null = null;

function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import('firebase/auth'),
      import('../lib/firebase'),
      import('../lib/firebaseBackend'),
    ]).then(([firebaseAuth, firebaseLib, firebaseBackend]) => ({
      firebaseAuth,
      firebaseLib,
      firebaseBackend,
    }));
  }
  return firebaseModulesPromise;
}

interface PlatformContextValue {
  user: PublicUser | null;
  bootstrap: BootstrapData | null;
  loading: boolean;
  loginWithGoogle: () => Promise<PublicUser>;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (
    fullName: string,
    email: string,
    password: string
  ) => Promise<{ user: PublicUser; verificationSent?: boolean }>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue | undefined>(undefined);

function mapFirebaseAuthError(err: any): string {
  const code = String(err?.code || '');
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  switch (code) {
    case 'auth/unauthorized-domain':
      return `Domain "${hostname}" is not authorized yet in Firebase Authentication. Add "${hostname}" under Firebase Console -> Authentication -> Settings -> Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Console yet. Click "Continue with Google" above for instant access.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and click Continue with Google again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in window was closed before completing authentication.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password. Try "Continue with Google" if you created your account with Google.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters (8+ recommended).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few moments before trying again.';
    default:
      return err?.message || 'Authentication failed.';
  }
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(() => readCachedBootstrap());
  const [loading, setLoading] = useState(() => readAuthHint() || isAuthSensitivePath());

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapData>('/api/public/bootstrap');
      if (isValidBootstrapPayload(data)) {
        setBootstrap(data);
      }
    } catch {
      // Preserve cached or canonical DEFAULT_BOOTSTRAP_DATA on transient network errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { firebaseAuth, firebaseLib, firebaseBackend } = await loadFirebaseModules();
    const current = firebaseLib.auth.currentUser;
    if (!current) {
      writeAuthHint(false);
      setUser(null);
      return;
    }
    try {
      const profile = await firebaseBackend.ensureFirebaseUserProfile(current);
      if (profile.status === 'SUSPENDED') {
        await firebaseAuth.signOut(firebaseLib.auth);
        writeAuthHint(false);
        setUser(null);
      } else {
        writeAuthHint(true);
        setUser(profile);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const immediateAuth = readAuthHint() || isAuthSensitivePath();

    const safetyTimer = immediateAuth
      ? setTimeout(() => {
          if (active) setLoading(false);
        }, 6000)
      : null;

    const initFirebaseAndData = async () => {
      void refreshBootstrap();
      try {
        const { firebaseAuth, firebaseLib, firebaseBackend } = await loadFirebaseModules();
        if (!active) return;

        unsubscribe = firebaseAuth.onAuthStateChanged(firebaseLib.auth, async (firebaseUser) => {
          if (!active) return;
          if (!firebaseUser) {
            writeAuthHint(false);
            setUser(null);
            setLoading(false);
            return;
          }
          try {
            const profile = await firebaseBackend.ensureFirebaseUserProfile(firebaseUser);
            if (!active) return;
            if (profile.status === 'SUSPENDED') {
              await firebaseAuth.signOut(firebaseLib.auth);
              writeAuthHint(false);
              setUser(null);
            } else {
              writeAuthHint(true);
              setUser(profile);
              if (profile.role === 'SUPER_ADMIN' || profile.role === 'ADMIN') {
                void refreshBootstrap();
              }
            }
          } catch {
            if (active) setUser(null);
          } finally {
            if (active) setLoading(false);
          }
        });
      } catch {
        if (active) setLoading(false);
      }
    };

    if (immediateAuth) {
      void initFirebaseAndData();
    } else {
      idleTimer = setTimeout(() => {
        if (active) {
          void initFirebaseAndData();
        }
      }, 350);
    }

    return () => {
      active = false;
      if (safetyTimer) clearTimeout(safetyTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (unsubscribe) unsubscribe();
    };
  }, [refreshBootstrap]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const { firebaseAuth, firebaseLib, firebaseBackend } = await loadFirebaseModules();
      const cred = await firebaseAuth.signInWithPopup(firebaseLib.auth, firebaseLib.googleProvider);
      const profile = await firebaseBackend.ensureFirebaseUserProfile(cred.user);
      if (profile.status === 'SUSPENDED') {
        await firebaseAuth.signOut(firebaseLib.auth);
        writeAuthHint(false);
        throw new Error('Your account is currently suspended. Contact the Directorate.');
      }
      writeAuthHint(true);
      setUser(profile);
      await refreshBootstrap();
      return profile;
    } catch (err: any) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }, [refreshBootstrap]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const { firebaseAuth, firebaseLib, firebaseBackend } = await loadFirebaseModules();
        const cred = await firebaseAuth.signInWithEmailAndPassword(
          firebaseLib.auth,
          email.trim(),
          password
        );
        if (!cred.user.emailVerified) {
          await firebaseAuth.sendEmailVerification(cred.user).catch(() => undefined);
          await firebaseAuth.signOut(firebaseLib.auth);
          writeAuthHint(false);
          throw new Error(
            'Please verify your email address first (check your inbox), or click "Continue with Google" for instant verified access.'
          );
        }
        const profile = await firebaseBackend.ensureFirebaseUserProfile(cred.user);
        if (profile.status === 'SUSPENDED') {
          await firebaseAuth.signOut(firebaseLib.auth);
          writeAuthHint(false);
          throw new Error('Your account is currently suspended. Contact the Directorate.');
        }
        writeAuthHint(true);
        setUser(profile);
        await refreshBootstrap();
        return profile;
      } catch (err: any) {
        throw new Error(mapFirebaseAuthError(err));
      }
    },
    [refreshBootstrap]
  );

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    try {
      const { firebaseAuth, firebaseLib } = await loadFirebaseModules();
      const cred = await firebaseAuth.createUserWithEmailAndPassword(
        firebaseLib.auth,
        email.trim(),
        password
      );
      if (fullName.trim()) {
        await firebaseAuth
          .updateProfile(cred.user, { displayName: fullName.trim() })
          .catch(() => undefined);
      }
      await firebaseAuth.sendEmailVerification(cred.user).catch(() => undefined);
      await firebaseAuth.signOut(firebaseLib.auth);
      writeAuthHint(false);
      return {
        user: {
          id: cred.user.uid,
          email: email.trim().toLowerCase(),
          full_name: fullName.trim() || 'Investigator',
          player_code: `AUR-2026-${cred.user.uid.slice(-4).toUpperCase()}`,
          role: 'PLAYER',
          institution_id: 1,
          institution_code: 'AURVAN_POLICE',
          institution_name: 'AURVAN POLICE',
          rank_id: 1,
          rank_title: 'Probationary Investigator',
          rank_order: 1,
          status: 'ACTIVE',
          email_verified: false,
          bio: '',
          created_at: new Date().toISOString(),
        } as PublicUser,
        verificationSent: true,
      };
    } catch (err: any) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      const { firebaseAuth, firebaseLib } = await loadFirebaseModules();
      await firebaseAuth.sendPasswordResetEmail(firebaseLib.auth, email.trim());
    } catch (err: any) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const { firebaseAuth, firebaseLib } = await loadFirebaseModules();
      await firebaseAuth.signOut(firebaseLib.auth);
    } finally {
      writeAuthHint(false);
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  return (
    <PlatformContext.Provider
      value={{
        user,
        bootstrap,
        loading,
        loginWithGoogle,
        login,
        register,
        sendPasswordReset,
        logout,
        refreshUser,
        refreshBootstrap,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
