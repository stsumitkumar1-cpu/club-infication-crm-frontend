import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, X, Receipt } from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './PackagesPage.css'; // Reusing similar styles

interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  description?: string;
  recordedBy: {
    id: string;
    name: string;
  };
  createdAt: string;
}

const emptyForm = {
  title: '',
  amount: '',
  date: '',
  description: '',
};

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function MiscellaneousExpensesPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('SUPER_ADMIN', 'MANAGER'); // Assuming managers can also add expenses

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const res = await fetchApi('/miscellaneous-expenses');
      setExpenses(res);
    } catch (err: any) {
      setPageError(err.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = () => {
    setForm({
      ...emptyForm,
      date: new Date().toISOString().slice(0, 10),
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        amount: Number(form.amount),
        date: form.date,
        description: form.description,
      };

      await fetchApi('/miscellaneous-expenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setShowModal(false);
      await load();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await fetchApi(`/miscellaneous-expenses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete expense');
    }
  };

  const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="packages-page">
      <div className="page-header-row">
        <div>
          <h1>Miscellaneous Expenses</h1>
          <p>Track additional or unexpected expenses outside of standard plans (e.g. Team trips, dinners).</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={openAdd}>
            <Plus size={18} /> Add Expense
          </button>
        )}
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}

      {!loading && expenses.length > 0 && (
        <div className="stats-row">
          <div className="mini-stat static">
            <span className="mini-stat-value">{expenses.length}</span>
            <span className="mini-stat-label">Total Expenses</span>
          </div>
          <div className="mini-stat static">
            <span className="mini-stat-value" style={{ color: '#dc2626' }}>
              {money(totalAmount)}
            </span>
            <span className="mini-stat-label">Total Spent</span>
          </div>
        </div>
      )}

      <div className="table-wrapper" style={{ marginTop: '20px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Description</th>
              <th>Recorded By</th>
              {canManage && <th className="col-actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="table-empty">
                  Loading...
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="table-empty">
                  {pageError ? 'Could not load expenses.' : 'No expenses recorded yet.'}
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>
                    <div className="plan-cell">
                      <div className="plan-icon">
                        <Receipt size={16} />
                      </div>
                      <span className="plan-name">{exp.title}</span>
                    </div>
                  </td>
                  <td className="plan-price">{money(exp.amount)}</td>
                  <td>{new Date(exp.date).toLocaleDateString()}</td>
                  <td>{exp.description || '-'}</td>
                  <td>{exp.recordedBy?.name || 'Unknown'}</td>
                  {canManage && (
                    <td className="cell-actions col-actions">
                      <button
                        className="icon-action danger"
                        title="Delete expense"
                        onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(exp);
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

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Expense</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            {formError && <div className="modal-error">{formError}</div>}

            <form onSubmit={handleSave} className="modal-form">
              <div className="form-grid">
                <div className="form-group form-group-wide">
                  <label>Title *</label>
                  <input
                    required
                    maxLength={100}
                    placeholder="e.g. Team dinner"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    placeholder="e.g. 5000"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="form-group form-group-wide">
                  <label>Description</label>
                  <textarea
                    placeholder="Optional details"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Delete expense</h3>
            <p className="confirm-text">
              Delete <strong>{deleteTarget.title}</strong> (₹{deleteTarget.amount}) permanently? This action cannot be undone.
            </p>
            {deleteError && <div className="modal-error">{deleteError}</div>}
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)}>
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
