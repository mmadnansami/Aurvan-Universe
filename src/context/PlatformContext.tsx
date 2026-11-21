import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
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
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (fullName: string, email: string, password: string) => Promise<{ user: PublicUser; verificationToken?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue | undefined>(undefined);

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
      // Preserve canonical DEFAULT_BOOTSTRAP_DATA on static hosts or transient API errors
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ authenticated: boolean; user: PublicUser | null }>('/api/auth/me');
      setUser(data && typeof data === 'object' && data.authenticated ? data.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await Promise.all([refreshBootstrap(), refreshUser()]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshBootstrap, refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: PublicUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const data = await apiFetch<{ user: PublicUser; token: string; verificationToken?: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ full_name: fullName, email, password }),
      }
    );
    setStoredToken(data.token);
    setUser(data.user);
    return { user: data.user, verificationToken: data.verificationToken };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
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
        login,
        register,
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
