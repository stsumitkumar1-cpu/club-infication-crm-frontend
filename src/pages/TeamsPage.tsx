import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  UserCog,
  Mail,
  Info,
  X,
  Briefcase,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from '../shared/password';
import './TeamsPage.css';

interface TeamExecutive {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  _count: { customers: number };
}

interface Team {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  executives: TeamExecutive[];
  _count: { executives: number };
}

export default function TeamsPage() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole('SUPER_ADMIN');

  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<TeamExecutive[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Assign modal: which team we are adding an existing executive to.
  const [assignTo, setAssignTo] = useState<Team | null>(null);
  const [selectedExec, setSelectedExec] = useState('');

  // Create modal: onboard a brand-new executive straight into a team.
  const [createFor, setCreateFor] = useState<Team | null>(null);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const [teamsRes, unassignedRes] = await Promise.all([
        fetchApi('/teams'),
        fetchApi('/teams/unassigned-executives'),
      ]);
      setTeams(teamsRes.data);
      setUnassigned(unassignedRes);
    } catch (err: any) {
      setPageError(err.message || 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAssign = (team: Team) => {
    setActionError('');
    setSelectedExec('');
    setAssignTo(team);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTo || !selectedExec) return;

    setBusyId(assignTo.id);
    setActionError('');
    try {
      // A Manager may omit managerId (the API assigns to their own team);
      // a Super Admin must name the target team explicitly.
      const body: Record<string, unknown> = { executiveId: selectedExec };
      if (isSuperAdmin) body.managerId = assignTo.id;

      await fetchApi('/teams/assign', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setAssignTo(null);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Failed to assign executive');
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = (team: Team) => {
    setCreateError('');
    setCreateForm({ name: '', email: '', password: '' });
    setCreateFor(team);
  };

  /**
   * Creates the login and places it in the team in one step. The API forces a
   * Manager's new Executive into their own team regardless of what is sent, so
   * managerId here only matters for a Super Admin choosing a team.
   */
  const handleCreateExec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFor) return;

    setCreating(true);
    setCreateError('');
    try {
      await fetchApi('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
          role: 'EXECUTIVE',
          managerId: createFor.id,
        }),
      });
      setCreateFor(null);
      await load();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create executive');
    } finally {
      setCreating(false);
    }
  };

  const handleUnassign = async (exec: TeamExecutive) => {
    setBusyId(exec.id);
    setActionError('');
    try {
      await fetchApi('/teams/unassign', {
        method: 'POST',
        body: JSON.stringify({ executiveId: exec.id }),
      });
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Failed to remove executive');
    } finally {
      setBusyId(null);
    }
  };

  const totalExecutives = teams.reduce(
    (sum, t) => sum + t._count.executives,
    0,
  );

  return (
    <div className="teams-page">
      <div className="page-header-row">
        <div>
          <h1>Teams</h1>
          <p>
            {isSuperAdmin
              ? 'Assign Executives to Managers. A Manager only ever sees their own team.'
              : 'Your team. You can add unassigned Executives and release your own.'}
          </p>
        </div>
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}
      {actionError && <div className="modal-error">{actionError}</div>}

      {/* Why this page exists: team membership is what makes a Manager able to
          see anything at all. Spell it out rather than assume. */}
      <div className="workflow-note">
        <Info size={16} />
        <div>
          <strong>How team scope works:</strong> a Manager can only see
          customers belonging to the Executives in their team. Moving an
          Executive here moves their whole customer history with them.
        </div>
      </div>

      {!loading && (
        <div className="stats-row">
          <div className="mini-stat static">
            <span className="mini-stat-value">{teams.length}</span>
            <span className="mini-stat-label">
              {isSuperAdmin ? 'Teams' : 'Your team'}
            </span>
          </div>
          <div className="mini-stat static">
            <span className="mini-stat-value">{totalExecutives}</span>
            <span className="mini-stat-label">Assigned executives</span>
          </div>
          <div className="mini-stat static">
            <span className="mini-stat-value" style={{ color: '#d97706' }}>
              {unassigned.length}
            </span>
            <span className="mini-stat-label">Unassigned executives</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="teams-empty">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="teams-empty">
          {/* A failed load must not claim there are no teams. */}
          {pageError
            ? 'Could not load teams. See the message above.'
            : 'No teams yet. Create a Manager under Team / Users first.'}
        </div>
      ) : (
        <div className="teams-grid">
          {teams.map((team) => (
            <div key={team.id} className="team-card">
              <div className="team-card-header">
                <div className="team-manager">
                  <div className="team-avatar">{team.name.charAt(0)}</div>
                  <div>
                    <h3>
                      {team.name}
                      {!team.isActive && (
                        <span className="status-badge badge-red inline-badge">
                          Deactivated
                        </span>
                      )}
                    </h3>
                    <small>
                      <Mail size={12} /> {team.email}
                    </small>
                  </div>
                </div>
                {/* Both paths are always available: you may need a brand-new
                    Executive whether or not unassigned ones happen to exist. */}
                <div className="card-actions">
                  <button
                    className="btn-outline"
                    onClick={() => openCreate(team)}
                    disabled={!team.isActive}
                    title={
                      team.isActive
                        ? 'Create a new Executive login in this team'
                        : 'This manager is deactivated'
                    }
                  >
                    <UserPlus size={14} /> New Executive
                  </button>
                  <button
                    className="btn-outline"
                    onClick={() => openAssign(team)}
                    disabled={!team.isActive || unassigned.length === 0}
                    title={
                      !team.isActive
                        ? 'This manager is deactivated'
                        : unassigned.length === 0
                          ? 'No unassigned executives to move — use "New Executive"'
                          : `Move one of ${unassigned.length} unassigned executive(s) into this team`
                    }
                  >
                    <UserCog size={14} /> Assign Existing
                    {unassigned.length > 0 ? ` (${unassigned.length})` : ''}
                  </button>
                </div>
              </div>

              <div className="team-meta">
                <span>
                  <Users size={13} /> {team._count.executives} executive
                  {team._count.executives === 1 ? '' : 's'}
                </span>
                <span>
                  <Briefcase size={13} />{' '}
                  {team.executives.reduce((s, e) => s + e._count.customers, 0)}{' '}
                  customers
                </span>
              </div>

              {team.executives.length === 0 ? (
                <div className="team-empty-row">
                  No executives in this team yet.
                  {unassigned.length > 0
                    ? ` Use "New Executive" to create one, or "Assign Existing" to move one of the ${unassigned.length} waiting.`
                    : ' Use "New Executive" to add one — customers they add become visible to this manager.'}
                </div>
              ) : (
                <ul className="exec-list">
                  {team.executives.map((exec) => (
                    <li key={exec.id} className={exec.isActive ? '' : 'muted'}>
                      <div className="exec-identity">
                        <span className="exec-name">{exec.name}</span>
                        <small>{exec.email}</small>
                      </div>
                      <div className="exec-right">
                        <span className="exec-customers">
                          {exec._count.customers} cust.
                        </span>
                        {!exec.isActive && (
                          <span className="status-badge badge-red">
                            Deactivated
                          </span>
                        )}
                        <button
                          className="icon-action danger"
                          title="Remove from this team"
                          disabled={busyId === exec.id}
                          onClick={() => handleUnassign(exec)}
                        >
                          <UserMinus size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && unassigned.length > 0 && (
        <div className="unassigned-panel">
          <div className="unassigned-header">
            <h3>
              <Info size={16} /> Unassigned Executives ({unassigned.length})
            </h3>
            <p>
              These Executives have no Manager, so no Manager can see their
              records. Assign them to a team.
            </p>
          </div>
          <ul className="exec-list">
            {unassigned.map((exec) => (
              <li key={exec.id} className={exec.isActive ? '' : 'muted'}>
                <div className="exec-identity">
                  <span className="exec-name">{exec.name}</span>
                  <small>{exec.email}</small>
                </div>
                <div className="exec-right">
                  <span className="exec-customers">
                    {exec._count.customers} cust.
                  </span>
                  {!exec.isActive && (
                    <span className="status-badge badge-red">Deactivated</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Create a new Executive directly into a team */}
      {createFor && (
        <div className="modal-overlay" onClick={() => setCreateFor(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>New Executive</h3>
              <button className="modal-close" onClick={() => setCreateFor(null)}>
                <X size={20} />
              </button>
            </div>

            {createError && <div className="modal-error">{createError}</div>}

            <form onSubmit={handleCreateExec} className="modal-form">
              <p className="create-target">
                Joining <strong>{createFor.name}</strong>'s team.
              </p>

              <div className="form-group">
                <label>Full Name *</label>
                <input
                  required
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, email: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  placeholder="Min. 8 characters"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                />
                <small className="field-note">{PASSWORD_RULES}</small>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setCreateFor(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Executive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignTo && (
        <div className="modal-overlay" onClick={() => setAssignTo(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Add Executive</h3>
              <button className="modal-close" onClick={() => setAssignTo(null)}>
                <X size={20} />
              </button>
            </div>

            {actionError && <div className="modal-error">{actionError}</div>}

            <form onSubmit={handleAssign} className="modal-form">
              <div className="form-group">
                <label>Assign to {assignTo.name}</label>
                <select
                  required
                  value={selectedExec}
                  onChange={(e) => setSelectedExec(e.target.value)}
                >
                  <option value="">Select an unassigned executive</option>
                  {unassigned.map((exec) => (
                    <option key={exec.id} value={exec.id}>
                      {exec.name} ({exec.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setAssignTo(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!selectedExec || busyId === assignTo.id}
                >
                  {busyId === assignTo.id ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
