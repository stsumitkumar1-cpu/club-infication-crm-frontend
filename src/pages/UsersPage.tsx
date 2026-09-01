import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Edit2,
  X,
  ShieldCheck,
  UserCheck,
  UserX,
  KeyRound,
  Filter,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth, type Role } from '../app/providers/AuthProvider';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from '../shared/password';
import Pagination, { DEFAULT_PAGE_SIZE } from '../components/Pagination';
import './UsersPage.css';

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  managerId: string | null;
  createdAt: string;
  manager: { id: string; name: string; email: string } | null;
  _count: { executives: number; customers: number };
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UserStats {
  total: number;
  superAdmins: number;
  managers: number;
  executives: number;
  active: number;
  inactive: number;
  unassignedExecutives: number;
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
};

const ROLE_BADGE: Record<Role, string> = {
  SUPER_ADMIN: 'badge-purple',
  MANAGER: 'badge-blue',
  EXECUTIVE: 'badge-green',
};

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'EXECUTIVE' as Role,
  managerId: '',
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function UsersPage() {
  const { user: currentUser, hasRole } = useAuth();
  // A Manager may onboard Executives into their own team, but editing,
  // password resets and activation stay with the Super Admin.
  const isSuperAdmin = hasRole('SUPER_ADMIN');

  /**
   * Whether the caller may set this user's password — the same rule the API
   * enforces (UsersService.setPassword).
   *
   * Super Admin for anyone but themselves (their own change goes through the
   * Profile page, which asks for their current password as proof); a Manager for
   * an Executive in their own team. Nobody resets their own password here.
   */
  const canSetPasswordFor = (u: ManagedUser) =>
    u.id !== currentUser?.id &&
    (isSuperAdmin ||
      (u.role === 'EXECUTIVE' && u.managerId === currentUser?.id));

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [managers, setManagers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  /*
   * Held separately from meta.limit, which is what the API last reported. The
   * two agree after a successful load; keeping the request's own value means a
   * failed load does not leave the selector showing a size that was never
   * applied.
   */
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pendingToggle, setPendingToggle] = useState<ManagedUser | null>(null);
  const [toggleError, setToggleError] = useState('');

  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadUsers = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      setPageError('');
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(size),
        });
        if (search) params.set('search', search);
        if (roleFilter) params.set('role', roleFilter);
        if (activeFilter) params.set('isActive', activeFilter);

        const res = await fetchApi(`/users?${params.toString()}`);
        setUsers(res.data);
        setMeta(res.meta);
      } catch (err: any) {
        setPageError(err.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    },
    [search, roleFilter, activeFilter, pageSize],
  );

  /**
   * Changing the size goes back to page 1: page 4 of a 10-per-page list is past
   * the end of the same list at 50 per page, and asking for it would show an
   * empty table over a non-empty result.
   */
  const changePageSize = (size: number) => {
    setPageSize(size);
    void loadUsers(1, size);
  };

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchApi('/users/stats'));
    } catch {
      setStats(null);
    }
  }, []);

  /** Manager options for the assignment dropdown. */
  const loadManagers = useCallback(async () => {
    try {
      const res = await fetchApi('/users?role=MANAGER&isActive=true&limit=100');
      setManagers(res.data);
    } catch {
      setManagers([]);
    }
  }, []);

  useEffect(() => {
    void loadUsers(1);
  }, [roleFilter, activeFilter, loadUsers]);

  useEffect(() => {
    void loadStats();
    void loadManagers();
  }, [loadStats, loadManagers]);

  const refresh = async () => {
    await Promise.all([loadUsers(meta.page), loadStats(), loadManagers()]);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadUsers(1);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (u: ManagedUser) => {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      managerId: u.managerId ?? '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      if (editingUser) {
        const payload: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          role: form.role,
        };
        if (form.password) payload.password = form.password;
        // Only an executive carries a managerId; send '' to detach.
        if (form.role === 'EXECUTIVE') {
          payload.managerId = form.managerId || '';
        }
        await fetchApi(`/users/${editingUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        const payload: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
        };
        if (form.role === 'EXECUTIVE' && form.managerId) {
          payload.managerId = form.managerId;
        }
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setShowModal(false);
      await refresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const confirmToggleActive = async () => {
    if (!pendingToggle) return;
    setToggleError('');
    const action = pendingToggle.isActive ? 'deactivate' : 'activate';
    try {
      await fetchApi(`/users/${pendingToggle.id}/${action}`, {
        method: 'PATCH',
      });
      setPendingToggle(null);
      await refresh();
    } catch (err: any) {
      setToggleError(err.message || `Failed to ${action} user`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await fetchApi(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await refresh();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const openReset = (u: ManagedUser) => {
    setResetTarget(u);
    setNewPassword('');
    setResetError('');
    setResetDone(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    setResetError('');
    try {
      /*
       * PATCH :id/password, not PATCH :id. The general update endpoint also
       * carries role, email and isActive and is Super Admin only, so a Manager
       * resetting their own Executive has to come through the narrow one.
       */
      await fetchApi(`/users/${resetTarget.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      });
      setResetDone(true);
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const clearFilters = () => {
    setRoleFilter('');
    setActiveFilter('');
    setSearch('');
  };

  const hasFilters = Boolean(roleFilter || activeFilter || search);

  return (
    <div className="users-page">
      <div className="page-header-row">
        <div>
          <h1>Team / Users</h1>
          <p>
            {isSuperAdmin
              ? 'Create CRM logins and manage roles, manager assignment and access.'
              : 'Add Executives to your team. They are created under you, so their customers are visible to you straight away.'}
          </p>
        </div>
        <button className="btn-primary" onClick={openAddModal}>
          <Plus size={18} /> {isSuperAdmin ? 'Add User' : 'Add Executive'}
        </button>
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}

      {/* Counters — click a role tile to filter the table by it */}
      {stats && (
        <div className="stats-row">
          <div
            className={`mini-stat ${roleFilter === '' && activeFilter === '' ? 'is-active' : ''}`}
            onClick={clearFilters}
          >
            <span className="mini-stat-value">{stats.total}</span>
            <span className="mini-stat-label">All users</span>
          </div>
          {isSuperAdmin && (
            <div
              className={`mini-stat ${roleFilter === 'SUPER_ADMIN' ? 'is-active' : ''}`}
              onClick={() => setRoleFilter('SUPER_ADMIN')}
            >
              <span className="mini-stat-value" style={{ color: '#7c3aed' }}>
                {stats.superAdmins}
              </span>
              <span className="mini-stat-label">Super Admins</span>
            </div>
          )}
          <div
            className={`mini-stat ${roleFilter === 'MANAGER' ? 'is-active' : ''}`}
            onClick={() => setRoleFilter('MANAGER')}
          >
            <span className="mini-stat-value" style={{ color: '#2563eb' }}>
              {stats.managers}
            </span>
            <span className="mini-stat-label">Managers</span>
          </div>
          <div
            className={`mini-stat ${roleFilter === 'EXECUTIVE' ? 'is-active' : ''}`}
            onClick={() => setRoleFilter('EXECUTIVE')}
          >
            <span className="mini-stat-value" style={{ color: '#16a34a' }}>
              {stats.executives}
            </span>
            <span className="mini-stat-label">Executives</span>
          </div>
          <div
            className={`mini-stat ${activeFilter === 'false' ? 'is-active' : ''}`}
            onClick={() => setActiveFilter('false')}
          >
            <span className="mini-stat-value" style={{ color: '#dc2626' }}>
              {stats.inactive}
            </span>
            <span className="mini-stat-label">Deactivated</span>
          </div>
        </div>
      )}

      {/* An Executive with no Manager is invisible to every Manager. */}
      {stats && stats.unassignedExecutives > 0 && (
        <div className="notice-banner">
          <AlertTriangle size={16} />
          <span>
            <strong>{stats.unassignedExecutives}</strong> executive
            {stats.unassignedExecutives === 1 ? ' has' : 's have'} no Manager, so
            no Manager can see their customers.
          </span>
          <Link to="/teams" className="notice-link">
            Assign in Teams →
          </Link>
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as '' | Role)}
        >
          <option value="">All roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="EXECUTIVE">Executive</option>
        </select>

        <select
          className="filter-select"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as '' | 'true' | 'false')
          }
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </select>

        {hasFilters && (
          <button className="btn-outline" onClick={clearFilters}>
            <Filter size={14} /> Clear <X size={14} />
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="data-table users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Reports To</th>
              <th>Team</th>
              <th>Customers</th>
              <th>Status</th>
              <th>Added</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  {/* A failed load must not claim there are no users — that
                      asserts something we do not actually know. */}
                  {pageError
                    ? 'Could not load users. See the message above.'
                    : hasFilters
                      ? 'No users match these filters.'
                      : 'No users yet. Click "Add User" to create the first one.'}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={u.isActive ? '' : 'row-inactive'}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-chip ${ROLE_BADGE[u.role]}`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-cell-text">
                          <span className="user-cell-name">
                            {u.name}
                            {isSelf && <em className="you-tag">you</em>}
                          </span>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td>
                      {u.role === 'EXECUTIVE' ? (
                        u.manager ? (
                          u.manager.name
                        ) : (
                          <span className="status-badge badge-yellow">
                            Unassigned
                          </span>
                        )
                      ) : (
                        <span className="muted-dash">—</span>
                      )}
                    </td>
                    <td>
                      {u.role === 'MANAGER' ? (
                        <span className="count-pill">
                          {u._count.executives} exec
                        </span>
                      ) : (
                        <span className="muted-dash">—</span>
                      )}
                    </td>
                    <td>
                      <span className="count-pill">{u._count.customers}</span>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          u.isActive ? 'badge-green' : 'badge-red'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="col-date">{shortDate(u.createdAt)}</td>
                    <td className="cell-actions col-actions">
                      {isSuperAdmin && (
                        <button
                          className="icon-action"
                          title="Edit user"
                          onClick={() => openEditModal(u)}
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {/* Never on your own row: your own password is not yours
                          to reset here. The API refuses it too. */}
                      {canSetPasswordFor(u) && (
                        <button
                          className="icon-action"
                          title={`Set a new password for this ${u.role === 'MANAGER' ? 'manager' : 'executive'}`}
                          onClick={() => openReset(u)}
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
                      {isSuperAdmin && (
                        <>
                        <button
                          className={`icon-action ${u.isActive ? 'danger' : ''}`}
                          title={
                            isSelf
                              ? 'You cannot deactivate your own account'
                              : u.isActive
                                ? 'Deactivate'
                                : 'Activate'
                          }
                          disabled={isSelf}
                          onClick={() => {
                            setToggleError('');
                            setPendingToggle(u);
                          }}
                        >
                          {u.isActive ? (
                            <UserX size={16} />
                          ) : (
                            <UserCheck size={16} />
                          )}
                        </button>
                        <button
                          className="icon-action danger"
                          title={
                            isSelf
                              ? 'You cannot delete your own account'
                              : 'Delete permanently'
                          }
                          disabled={isSelf}
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(u);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                        </>
                      )}
                      {/* A row the caller has no action on. Better than an empty
                          cell, which reads as a rendering failure. */}
                      {!isSuperAdmin && !canSetPasswordFor(u) && (
                        <span className="cell-actions-none">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        meta={meta}
        pageSize={pageSize}
        loading={loading}
        label="users"
        onPageChange={(p) => loadUsers(p)}
        onPageSizeChange={changePageSize}
      />

      {/* Add / Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingUser
                  ? 'Edit User'
                  : isSuperAdmin
                    ? 'Add New User'
                    : 'New Executive'}
              </h3>
              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            {formError && <div className="modal-error">{formError}</div>}

            <form onSubmit={handleSave} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{editingUser ? 'New Password' : 'Password *'}</label>
                  <input
                    type="password"
                    required={!editingUser}
                    minLength={PASSWORD_MIN_LENGTH}
                    placeholder={
                      editingUser
                        ? 'Leave blank to keep current'
                        : 'Min. 8 characters'
                    }
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                  <small className="field-note">{PASSWORD_RULES}</small>
                </div>
                <div className="form-group">
                  <label>Role *</label>
                  {isSuperAdmin ? (
                    <select
                      required
                      value={form.role}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          role: e.target.value as Role,
                          // A non-executive cannot hold a manager.
                          managerId:
                            e.target.value === 'EXECUTIVE' ? form.managerId : '',
                        })
                      }
                    >
                      <option value="EXECUTIVE">Executive</option>
                      <option value="MANAGER">Manager</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </select>
                  ) : (
                    // A Manager can only create Executives, so there is nothing
                    // to choose. The API enforces this regardless.
                    <input value="Executive" readOnly disabled />
                  )}
                </div>

                {form.role === 'EXECUTIVE' &&
                  (isSuperAdmin ? (
                    <div className="form-group form-group-wide">
                      <label>Reports To (Manager)</label>
                      <select
                        value={form.managerId}
                        onChange={(e) =>
                          setForm({ ...form, managerId: e.target.value })
                        }
                      >
                        <option value="">Unassigned</option>
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group form-group-wide">
                      <label>Reports To (Manager)</label>
                      <div className="assigned-self-note">
                        <ShieldCheck size={15} />
                        <span>
                          {currentUser?.name} — new Executives join your team
                          automatically
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              <p className="form-hint">
                <ShieldCheck size={14} />{' '}
                {isSuperAdmin
                  ? 'Only an Executive can report to a Manager. Users are never deleted — deactivate them instead, so their customers and audit history stay intact.'
                  : 'Changing roles, resetting passwords and deactivating accounts is handled by a Super Admin.'}
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving
                    ? 'Saving...'
                    : editingUser
                      ? 'Update User'
                      : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate / Deactivate */}
      {pendingToggle && (
        <div className="modal-overlay" onClick={() => setPendingToggle(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{pendingToggle.isActive ? 'Deactivate' : 'Activate'} user</h3>
            <p className="confirm-text">
              {pendingToggle.isActive ? (
                <>
                  <strong>{pendingToggle.name}</strong> will no longer be able to
                  log in. Their customer records and history are kept.
                </>
              ) : (
                <>
                  <strong>{pendingToggle.name}</strong> will be able to log in
                  again.
                </>
              )}
            </p>
            {toggleError && <div className="modal-error">{toggleError}</div>}
            <div className="modal-actions">
              <button
                className="btn-outline"
                onClick={() => setPendingToggle(null)}
              >
                Cancel
              </button>
              <button
                className={
                  pendingToggle.isActive ? 'btn-danger' : 'btn-primary'
                }
                onClick={confirmToggleActive}
              >
                {pendingToggle.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Delete user</h3>
              <button
                className="modal-close"
                onClick={() => setDeleteTarget(null)}
              >
                <X size={20} />
              </button>
            </div>

            <p className="confirm-text">
              Permanently delete <strong>{deleteTarget.name}</strong> (
              {ROLE_LABEL[deleteTarget.role]})? This cannot be undone.
            </p>
            <p className="confirm-text danger-note">
              Only an account that has left no trace can be deleted. If they own
              customers, have a team, or have any audit history, the API will
              refuse — <strong>deactivate</strong> instead, which blocks login
              while keeping their records intact.
            </p>

            {deleteError && <div className="modal-error">{deleteError}</div>}

            <div className="modal-actions">
              <button
                className="btn-outline"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set a new password */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Set new password</h3>
              <button
                className="modal-close"
                onClick={() => setResetTarget(null)}
              >
                <X size={20} />
              </button>
            </div>

            {resetDone ? (
              <>
                <p className="confirm-text">
                  Password updated for <strong>{resetTarget.name}</strong>. Share
                  it with them over a secure channel — it is stored hashed and
                  cannot be read back.
                </p>
                <div className="modal-actions">
                  <button
                    className="btn-primary"
                    onClick={() => setResetTarget(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleResetPassword} className="modal-form">
                <p className="confirm-text">
                  Setting a new password for <strong>{resetTarget.name}</strong>{' '}
                  ({resetTarget.email}).
                </p>
                {resetError && <div className="modal-error">{resetError}</div>}
                <div className="form-group">
                  <label>New password *</label>
                  <input
                    type="password"
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    placeholder="Min. 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <small className="field-note">{PASSWORD_RULES}</small>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setResetTarget(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={resetting}
                  >
                    {resetting ? 'Saving...' : 'Set password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
