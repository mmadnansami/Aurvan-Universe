import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { apiFetch, setStoredToken } from '../lib/api';
import { auth, googleProvider } from '../lib/firebase';
import { ensureFirebaseUserProfile } from '../lib/firebaseBackend';
import {
  DEFAULT_BOOTSTRAP_DATA,
  isValidBootstrapPayload,
  type BootstrapPayload,
} from '../shared/defaultBootstrap';
import type { PublicUser } from '../shared/types';

export type BootstrapData = BootstrapPayload;

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
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(DEFAULT_BOOTSTRAP_DATA);
  const [loading, setLoading] = useState(true);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapData>('/api/public/bootstrap');
      if (isValidBootstrapPayload(data)) {
        setBootstrap(data);
      }
    } catch {
      // Preserve canonical DEFAULT_BOOTSTRAP_DATA on transient network errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setUser(null);
      return;
    }
    try {
      const profile = await ensureFirebaseUserProfile(current);
      if (profile.status === 'SUSPENDED') {
        await signOut(auth);
        setUser(null);
      } else {
        setUser(profile);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refreshBootstrap();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await ensureFirebaseUserProfile(firebaseUser);
        if (!active) return;
        if (profile.status === 'SUSPENDED') {
          await signOut(auth);
          setUser(null);
        } else {
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

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshBootstrap]);

  const loginWithGoogle = useCallback(async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await ensureFirebaseUserProfile(cred.user);
      if (profile.status === 'SUSPENDED') {
        await signOut(auth);
        throw new Error('Your account is currently suspended. Contact the Directorate.');
      }
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
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user).catch(() => undefined);
          await signOut(auth);
          throw new Error(
            'Please verify your email address first (check your inbox), or click "Continue with Google" for instant verified access.'
          );
        }
        const profile = await ensureFirebaseUserProfile(cred.user);
        if (profile.status === 'SUSPENDED') {
          await signOut(auth);
          throw new Error('Your account is currently suspended. Contact the Directorate.');
        }
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
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (fullName.trim()) {
        await updateProfile(cred.user, { displayName: fullName.trim() }).catch(() => undefined);
      }
      await sendEmailVerification(cred.user).catch(() => undefined);
      await signOut(auth);
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
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err: any) {
      throw new Error(mapFirebaseAuthError(err));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
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
