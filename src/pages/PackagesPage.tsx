import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Filter,
  Package as PackageIcon,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './PackagesPage.css';

interface Plan {
  id: string;
  name: string;
  price: number;
  days: number;
  nights: number;
  validityMonths: number;
  isActive: boolean;
  createdAt: string;
  _count: { memberships: number };
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Numeric fields are held as strings so an empty field stays empty and shows
 * its placeholder. Seeding them with 0 forces the user to delete the zero
 * before typing, and makes "not filled in yet" indistinguishable from "zero".
 */
const emptyForm = {
  name: '',
  price: '',
  days: '',
  nights: '',
  validityMonths: '',
};

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** 60 -> "5 Years", 18 -> "18 Months". Matches how the client writes validity. */
export function formatValidity(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? 'Year' : 'Years'}`;
  }
  return `${months} ${months === 1 ? 'Month' : 'Months'}`;
}

export default function PackagesPage() {
  const { hasRole } = useAuth();
  // A Manager may add a plan; editing, deactivating and deleting one stay
  // with the Super Admin.
  const canCreate = hasRole('SUPER_ADMIN', 'MANAGER');
  const canManage = hasRole('SUPER_ADMIN');

  const [plans, setPlans] = useState<Plan[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 1,
  });
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setPageError('');
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        if (activeFilter) params.set('isActive', activeFilter);

        const res = await fetchApi(`/packages?${params.toString()}`);
        setPlans(res.data);
        setMeta(res.meta);
      } catch (err: any) {
        setPageError(err.message || 'Failed to load plans');
      } finally {
        setLoading(false);
      }
    },
    [search, activeFilter],
  );

  useEffect(() => {
    void load(1);
  }, [activeFilter, load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void load(1);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (p: Plan) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      price: String(p.price),
      days: String(p.days),
      nights: String(p.nights),
      validityMonths: String(p.validityMonths),
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name,
        price: Number(form.price),
        days: Number(form.days),
        nights: Number(form.nights),
        validityMonths: Number(form.validityMonths),
      };

      if (editingId) {
        await fetchApi(`/packages/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/packages', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      await load(meta.page);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Plan) => {
    setBusyId(p.id);
    setActionError('');
    try {
      await fetchApi(`/packages/${p.id}/${p.isActive ? 'deactivate' : 'activate'}`, {
        method: 'PATCH',
      });
      await load(meta.page);
    } catch (err: any) {
      setActionError(err.message || 'Failed to update plan');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await fetchApi(`/packages/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load(meta.page);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete plan');
    }
  };

  const clearFilters = () => {
    setActiveFilter('');
    setSearch('');
  };

  const hasFilters = Boolean(activeFilter || search);
  const activeCount = plans.filter((p) => p.isActive).length;

  return (
    <div className="packages-page">
      <div className="page-header-row">
        <div>
          <h1>Plans</h1>
          <p>
            {canManage
              ? 'The plan catalog. Every plan here is stored in the database and drives the plan dropdown when adding a customer.'
              : canCreate
                ? 'The plan catalog, shared across every team. You can add a plan; editing and deactivating are handled by a Super Admin.'
                : 'The plan catalog. Plans are configured by a Super Admin.'}
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={18} /> Add Plan
          </button>
        )}
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}
      {actionError && <div className="modal-error">{actionError}</div>}

      {!loading && plans.length > 0 && (
        <div className="stats-row">
          <div className="mini-stat static">
            <span className="mini-stat-value">{meta.total}</span>
            <span className="mini-stat-label">Plans defined</span>
          </div>
          <div className="mini-stat static">
            <span className="mini-stat-value" style={{ color: '#16a34a' }}>
              {activeCount}
            </span>
            <span className="mini-stat-label">Active (sellable)</span>
          </div>
          <div className="mini-stat static">
            <span className="mini-stat-value">
              {plans.reduce((s, p) => s + p._count.memberships, 0)}
            </span>
            <span className="mini-stat-label">Memberships sold</span>
          </div>
        </div>
      )}

      <div className="toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search plan name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="filter-select"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as '' | 'true' | 'false')
          }
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        {hasFilters && (
          <button className="btn-outline" onClick={clearFilters}>
            <Filter size={14} /> Clear <X size={14} />
          </button>
        )}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Price</th>
              <th>Days</th>
              <th>Nights</th>
              <th>Validity</th>
              <th>Sold</th>
              <th>Status</th>
              {canManage && <th className="col-actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="table-empty">
                  Loading...
                </td>
              </tr>
            ) : plans.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="table-empty">
                  {/* A failed load must not claim there are no plans. */}
                  {pageError
                    ? 'Could not load plans. See the message above.'
                    : hasFilters
                      ? 'No plans match these filters.'
                      : canCreate
                        ? 'No plans yet. Click "Add Plan" to create your first one — for example Gold, ₹90,000, 4 days / 3 nights, 5 years.'
                        : 'No plans have been configured yet.'}
                </td>
              </tr>
            ) : (
              plans.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'row-inactive'}>
                  <td>
                    <div className="plan-cell">
                      <div className="plan-icon">
                        <PackageIcon size={16} />
                      </div>
                      <span className="plan-name">{p.name}</span>
                    </div>
                  </td>
                  <td className="plan-price">{money(p.price)}</td>
                  <td>{p.days}</td>
                  <td>{p.nights}</td>
                  <td>{formatValidity(p.validityMonths)}</td>
                  <td>
                    <span className="count-pill">{p._count.memberships}</span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        p.isActive ? 'badge-green' : 'badge-red'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="cell-actions col-actions">
                      <button
                        className="icon-action"
                        title="Edit plan"
                        onClick={() => openEdit(p)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="icon-action"
                        title={
                          p.isActive
                            ? 'Deactivate (hides it from new sales)'
                            : 'Activate'
                        }
                        disabled={busyId === p.id}
                        onClick={() => toggleActive(p)}
                      >
                        {p.isActive ? (
                          <ToggleRight size={17} />
                        ) : (
                          <ToggleLeft size={17} />
                        )}
                      </button>
                      <button
                        className="icon-action danger"
                        title="Delete plan"
                        onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(p);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canManage && plans.length > 0 && (
        <p className="page-note">
          <Info size={14} /> Deactivating a plan keeps every existing membership
          intact — it only stops the plan appearing when adding new customers.
        </p>
      )}

      {/* Add / Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Plan' : 'Add New Plan'}</h3>
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
                <div className="form-group form-group-wide">
                  <label>Plan Name *</label>
                  <input
                    required
                    maxLength={60}
                    placeholder="e.g. Gold"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Price (₹) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="e.g. 90000"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Validity (months) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={1200}
                    placeholder="e.g. 60"
                    value={form.validityMonths}
                    onChange={(e) =>
                      setForm({ ...form, validityMonths: e.target.value })
                    }
                  />
                  {/* Only meaningful once something is typed. */}
                  {form.validityMonths !== '' && (
                    <small className="field-note">
                      = {formatValidity(Number(form.validityMonths))}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Days included *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="e.g. 4"
                    value={form.days}
                    onChange={(e) => setForm({ ...form, days: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Nights included *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="e.g. 3"
                    value={form.nights}
                    onChange={(e) =>
                      setForm({ ...form, nights: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete plan</h3>
            <p className="confirm-text">
              Delete <strong>{deleteTarget.name}</strong> permanently? A plan
              that customers have already bought cannot be deleted — deactivate
              it instead.
            </p>
            {deleteError && <div className="modal-error">{deleteError}</div>}
            <div className="modal-actions">
              <button
                className="btn-outline"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
