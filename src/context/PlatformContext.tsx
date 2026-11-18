import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Institution, PublicUser, Rank, Region, SiteContentItem } from '../shared/types';

export interface BootstrapData {
  settings: Record<string, string>;
  content: Record<string, SiteContentItem>;
  institutions: Institution[];
  ranks: Rank[];
  regions: Region[];
}

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
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshBootstrap = useCallback(async () => {
    const data = await apiFetch<BootstrapData>('/api/public/bootstrap');
    setBootstrap(data);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ authenticated: boolean; user: PublicUser | null }>('/api/auth/me');
      setUser(data.authenticated ? data.user : null);
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
