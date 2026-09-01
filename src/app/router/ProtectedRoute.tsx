import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ServerCrash, RefreshCw } from 'lucide-react';
import { useAuth, type Role } from '../providers/AuthProvider';

interface ProtectedRouteProps {
  /** When set, the signed-in user must hold one of these roles. */
  allowedRoles?: Role[];
}

/**
 * Blocks unauthenticated access and, optionally, roles that must not see a
 * screen at all. Convenience only — the API enforces the real boundary.
 */
export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, loading, connectionError, refresh } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="route-loading">
        <span>Loading your workspace...</span>
      </div>
    );
  }

  /*
   * The API is unreachable but a token is still held.
   *
   * Redirecting to /login here would be actively unhelpful: the session is
   * fine, and the login page cannot reach the server either — so the user
   * would be stuck on a form that always fails. Offer a retry instead, and
   * keep them signed in.
   */
  if (!user && connectionError) {
    return (
      <div className="route-offline">
        <ServerCrash size={40} />
        <h2>Cannot reach the server</h2>
        <p>{connectionError}</p>
        <p className="route-offline-hint">
          You are still signed in. Start the API and retry — no need to log in
          again.
        </p>
        <button className="btn-primary" onClick={() => void refresh()}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
