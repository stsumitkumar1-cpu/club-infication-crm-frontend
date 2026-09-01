import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  UserCircle2,
  Users,
} from 'lucide-react';
import { fetchApi, ApiError } from '../api/fetchApi';
import { useAuth, type Role } from '../app/providers/AuthProvider';
import './ProfilePage.css';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  EXECUTIVE: 'Executive',
};

/** What each role may actually do — the same rules the API enforces (Spec 2.1). */
const ROLE_SCOPE: Record<Role, string> = {
  SUPER_ADMIN: 'Full access to every team, customer and record.',
  MANAGER: 'Your own team: your executives and the customers they own.',
  EXECUTIVE: 'The customers assigned to you.',
};

/**
 * Mirrors the API's own policy (IsStrongPassword). Duplicated here only to
 * describe it before submitting — the server re-checks every rule, and its
 * message is what the user sees if the two ever disagree.
 */
const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
];

interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  managerId: string | null;
  createdAt: string;
  updatedAt: string;
  manager: { id: string; name: string; email: string } | null;
  executives: { id: string; name: string; email: string; isActive: boolean }[];
}

const date = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default function ProfilePage() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false });
  const [saving, setSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState('');

  /*
   * Read through /users/:id rather than /auth/me: that endpoint answers from the
   * JWT, so it cannot report the manager, the team or the join date, and it
   * would show a stale name after an admin renamed the account. Every role's
   * scope filter resolves to at least their own id, so this is always readable.
   */
  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchApi(`/users/${user.id}`);
      setProfile(res as Profile);
    } catch (err: unknown) {
      setLoadError(
        err instanceof ApiError && err.isUnreachable
          ? 'The server is not responding. Your details could not be loaded.'
          : err instanceof Error
            ? err.message
            : 'Could not load your profile',
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /*
   * Only a Super Admin manages credentials (client rule); the API refuses a
   * self-service change from anyone else. Showing the form anyway would only
   * produce a 403 on submit, so the card is replaced with the answer to "then
   * how do I change it?".
   */
  const canChangeOwnPassword =
    (profile?.role ?? user?.role) === 'SUPER_ADMIN';

  const unmetRules = PASSWORD_RULES.filter((r) => !r.test(form.next));
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const canSubmit =
    !saving &&
    form.current.length > 0 &&
    form.next.length > 0 &&
    unmetRules.length === 0 &&
    !mismatch &&
    form.next !== form.current;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwDone('');

    if (form.next !== form.confirm) {
      setPwError('The two new passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await fetchApi('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.current,
          newPassword: form.next,
        }),
      });
      /*
       * Deliberately does NOT sign the user out. The access token was issued
       * before the change and stays valid, so there is no security reason to
       * end the session — and dumping someone at the login screen right after
       * they succeeded reads as a failure.
       */
      setForm({ current: '', next: '', confirm: '' });
      setShow({ current: false, next: false });
      setPwDone('Password changed. Use the new one next time you sign in.');
    } catch (err: unknown) {
      setPwError(
        err instanceof Error ? err.message : 'Could not change your password',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      <div className="page-header-row">
        <div>
          <h1>Your profile</h1>
          <p>Your account details, and where to change your password.</p>
        </div>
      </div>

      {loadError && (
        <div className="modal-error">
          {loadError}{' '}
          <button className="link-button" onClick={() => void loadProfile()}>
            Try again
          </button>
        </div>
      )}

      <div className="profile-grid">
        {/* ------------------------------ identity ------------------------ */}
        <section className="profile-card">
          <h2>
            <UserCircle2 size={16} /> Account
          </h2>

          <div className="profile-identity">
            <div className="profile-avatar">
              {(profile?.name ?? user.name).charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="profile-name">{profile?.name ?? user.name}</span>
              <span className="profile-email">
                <Mail size={13} /> {profile?.email ?? user.email}
              </span>
            </div>
          </div>

          <dl className="profile-list">
            <div>
              <dt>Role</dt>
              <dd>
                <span className="status-badge badge-blue">
                  {ROLE_LABEL[profile?.role ?? user.role]}
                </span>
              </dd>
            </div>
            <div>
              <dt>Account status</dt>
              <dd>
                {loading ? (
                  '—'
                ) : (
                  <span
                    className={`status-badge ${
                      profile?.isActive ? 'badge-green' : 'badge-red'
                    }`}
                  >
                    {profile?.isActive ? 'Active' : 'Inactive'}
                  </span>
                )}
              </dd>
            </div>
            {profile?.manager && (
              <div>
                <dt>Reports to</dt>
                <dd>
                  {profile.manager.name}
                  <small> · {profile.manager.email}</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Member since</dt>
              <dd>{profile ? date(profile.createdAt) : '—'}</dd>
            </div>
          </dl>

          <p className="profile-hint">
            <ShieldCheck size={13} /> {ROLE_SCOPE[profile?.role ?? user.role]}
          </p>

          {/*
            Name, email and role are set by whoever administers the account, not
            here. Saying so is better than offering fields the API would refuse:
            PATCH /users/:id is Super Admin only.
          */}
          <p className="profile-hint">
            Your name, email and role are managed by a Super Admin. Ask them if
            any of these need changing.
          </p>
        </section>

        {/* ------------------------------ password ------------------------ */}
        {!canChangeOwnPassword ? (
          <section className="profile-card">
            <h2>
              <KeyRound size={16} /> Password
            </h2>
            <p className="profile-hint">
              <ShieldCheck size={13} />
              Your password is set for you rather than changed here.
            </p>
            {/* Names whoever can actually do it: an Executive's Manager can,
                a Manager's cannot — only a Super Admin. */}
            <p className="profile-hint">
              {(profile?.role ?? user.role) === 'EXECUTIVE'
                ? profile?.manager
                  ? `Ask ${profile.manager.name} (${profile.manager.email}) or a Super Admin to set a new one for you.`
                  : 'Ask your Manager or a Super Admin to set a new one for you.'
                : 'Ask a Super Admin to set a new one for you. They can do it from Team / Users.'}
            </p>
          </section>
        ) : (
        <section className="profile-card">
          <h2>
            <KeyRound size={16} /> Change password
          </h2>

          {pwDone && (
            <p className="profile-success">
              <CheckCircle2 size={15} /> {pwDone}
            </p>
          )}
          {pwError && <div className="modal-error">{pwError}</div>}

          <form onSubmit={changePassword} className="profile-form">
            <div className="form-group">
              <label htmlFor="current-password">Current password *</label>
              <div className="password-input">
                <input
                  id="current-password"
                  type={show.current ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={form.current}
                  onChange={(e) =>
                    setForm({ ...form, current: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => setShow({ ...show, current: !show.current })}
                  aria-label={
                    show.current ? 'Hide password' : 'Show password'
                  }
                >
                  {show.current ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <small className="field-note">
                Required even though you are signed in — it proves the account
                is yours, so an unattended session cannot be used to take it
                over.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="new-password">New password *</label>
              <div className="password-input">
                <input
                  id="new-password"
                  type={show.next ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={form.next}
                  onChange={(e) => setForm({ ...form, next: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShow({ ...show, next: !show.next })}
                  aria-label={show.next ? 'Hide password' : 'Show password'}
                >
                  {show.next ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Live, so the rules are visible before submitting rather than
                  arriving as a rejection afterwards. */}
              <ul className="password-rules">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(form.next);
                  return (
                    <li
                      key={rule.label}
                      className={
                        form.next.length === 0
                          ? ''
                          : met
                            ? 'is-met'
                            : 'is-unmet'
                      }
                    >
                      {form.next.length > 0 && met ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <AlertCircle size={13} />
                      )}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>

              {form.next.length > 0 && form.next === form.current && (
                <small className="field-warning">
                  This is your current password. Choose a different one.
                </small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password">Confirm new password *</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
              {mismatch && (
                <small className="field-warning">
                  The two new passwords do not match.
                </small>
              )}
            </div>

            <button type="submit" className="btn-primary" disabled={!canSubmit}>
              {saving ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </section>
        )}

        {/* --------------------------- own team, if any ------------------- */}
        {profile && profile.executives.length > 0 && (
          <section className="profile-card profile-card-wide">
            <h2>
              <Users size={16} /> Your team ({profile.executives.length})
            </h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.executives.map((e) => (
                    <tr key={e.id}>
                      <td><strong>{e.name}</strong></td>
                      <td>{e.email}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            e.isActive ? 'badge-green' : 'badge-red'
                          }`}
                        >
                          {e.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="profile-hint">
              Managed under <Link to="/teams">Teams</Link>.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
