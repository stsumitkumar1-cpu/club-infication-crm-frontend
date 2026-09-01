import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, fetchApi } from '../../api/fetchApi';

export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'EXECUTIVE';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  /** True once a profile has been resolved from the API. */
  isAuthenticated: boolean;
  /** Set when the API could not be reached — distinct from being signed out. */
  connectionError: string;
  hasRole: (...roles: Role[]) => boolean;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEYS = ['crm_token', 'crm_refresh_token', 'crm_user'];

/**
 * Single source of the signed-in identity for the whole app.
 *
 * Role information here drives *visibility only*. The backend re-checks role
 * and record scope on every request — see Master Spec 5.1.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');

  const loadProfile = useCallback(async () => {
    if (!localStorage.getItem('crm_token')) {
      setUser(null);
      setConnectionError('');
      setLoading(false);
      return;
    }
    try {
      const profile = await fetchApi('/auth/me');
      setUser(profile);
      setConnectionError('');
    } catch (err) {
      /*
       * A dead API is not a dead session.
       *
       * Signing the user out because the server was briefly unreachable is
       * doubly wrong: the token is still valid, and /login cannot reach the
       * server either — so they are stranded on a page that cannot help them.
       * The token is kept and the outage surfaced instead.
       */
      if (err instanceof ApiError && err.isUnreachable) {
        setConnectionError(err.message);
      } else {
        // A real auth failure: fetchApi has already cleared storage.
        setUser(null);
        setConnectionError('');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const logout = useCallback(() => {
    TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
    setUser(null);
    window.location.href = '/login';
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      connectionError,
      hasRole,
      logout,
      refresh: loadProfile,
    }),
    [user, loading, connectionError, hasRole, logout, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
