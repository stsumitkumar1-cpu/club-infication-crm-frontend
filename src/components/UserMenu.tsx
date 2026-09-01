import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, UserCircle2 } from 'lucide-react';
import { useAuth, type Role } from '../app/providers/AuthProvider';
import './UserMenu.css';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
};

/**
 * The header's account chip, now a menu.
 *
 * Logout stays in the sidebar as well: it has always been there, people know
 * where it is, and moving it into a menu would hide something reached for
 * daily. This adds a second route to it, not a replacement.
 */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* Click outside closes it. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* Escape closes it and hands focus back, so the keyboard is not stranded. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // ProtectedRoute guarantees a user before the layout renders; the type does
  // not know that. Declared after the hooks so their order stays stable.
  if (!user) return null;

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        className="user-profile user-menu-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
        <div className="user-info">
          <span className="user-name">{user.name}</span>
          <span className="user-role">{ROLE_LABEL[user.role]}</span>
        </div>
        <ChevronDown
          size={16}
          className={`user-menu-caret${open ? ' is-open' : ''}`}
        />
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          {/* Repeats the identity: the trigger truncates a long name, and this
              is where someone checks which account they are signed in as. */}
          <div className="user-menu-head">
            <span className="user-menu-name">{user.name}</span>
            <span className="user-menu-email">{user.email}</span>
          </div>

          <Link
            to="/profile"
            className="user-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <UserCircle2 size={16} /> Profile
          </Link>

          <button
            className="user-menu-item is-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}
