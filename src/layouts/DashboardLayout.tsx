import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Network,
  UserSquare2,
  Package as PackageIcon,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../app/providers/AuthProvider';
import GlobalSearch from '../components/GlobalSearch';
import UserMenu from '../components/UserMenu';
import './DashboardLayout.css';

export default function DashboardLayout() {
  // ProtectedRoute guarantees a user before this renders.
  const { user, logout, hasRole } = useAuth();

  if (!user) {
    return null;
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-item active' : 'nav-item';

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img
            className="brand-logo"
            src="/logo.png"
            alt="Club Infication"
            width={36}
            height={36}
          />
          <h2>Club Infication</h2>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className={navClass}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          {/* Super Admin manages every user; a Manager onboards Executives. */}
          {hasRole('SUPER_ADMIN', 'MANAGER') && (
            <NavLink to="/users" className={navClass}>
              <Users size={20} />
              <span>Team / Users</span>
            </NavLink>
          )}

          {/* Executives have no team-management rights. */}
          {hasRole('SUPER_ADMIN', 'MANAGER') && (
            <NavLink to="/teams" className={navClass}>
              <Network size={20} />
              <span>Teams</span>
            </NavLink>
          )}

          <NavLink to="/customers" className={navClass}>
            <UserSquare2 size={20} />
            <span>Customers</span>
          </NavLink>

          {/* Plan catalog — readable by every role, editable by Super Admin. */}
          <NavLink to="/packages" className={navClass}>
            <PackageIcon size={20} />
            <span>Plans</span>
          </NavLink>

        </nav>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={logout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="top-header">
          <GlobalSearch />

          <div className="header-right">
            {/* Notifications button hidden for now — there is nothing behind
                it yet. Re-import Bell from lucide-react to bring it back. */}
            <UserMenu />
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
