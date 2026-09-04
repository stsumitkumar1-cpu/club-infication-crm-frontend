import { useCallback, useEffect, useState } from 'react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './PackagesPage.css'; // Reusing similar table styles

interface UserSalaryRecord {
  userId: string;
  name: string;
  role: string;
  totalSales: number;
  baseSalary: number;
  incentivePercentage: number;
  incentiveEarned: number;
  totalSalary: number;
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function SalariesIncentivesPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('SUPER_ADMIN', 'MANAGER');

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [records, setRecords] = useState<UserSalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  
  // Local state for editable fields to avoid constant API calls
  const [edits, setEdits] = useState<Record<string, { baseSalary: string; incentivePercentage: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    setPageError('');
    try {
      const res = await fetchApi(`/salaries-incentives?period=${period}`);
      setRecords(res);
      
      const newEdits: Record<string, { baseSalary: string; incentivePercentage: string }> = {};
      res.forEach((r: UserSalaryRecord) => {
        newEdits[r.userId] = {
          baseSalary: String(r.baseSalary || ''),
          incentivePercentage: String(r.incentivePercentage || ''),
        };
      });
      setEdits(newEdits);
    } catch (err: any) {
      setPageError(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEditChange = (userId: string, field: 'baseSalary' | 'incentivePercentage', value: string) => {
    setEdits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value
      }
    }));
  };

  const handleSave = async (userId: string) => {
    setSavingId(userId);
    setPageError('');
    try {
      const edit = edits[userId];
      const payload = {
        period,
        baseSalary: Number(edit.baseSalary) || 0,
        incentivePercentage: Number(edit.incentivePercentage) || 0,
      };

      await fetchApi(`/salaries-incentives/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      await load(); // Reload to get updated calculated values
    } catch (err: any) {
      setPageError(err.message || 'Failed to save changes');
    } finally {
      setSavingId(null);
    }
  };

  const formatRole = (role: string) => {
    if (role === 'SUPER_ADMIN') return 'Super Admin';
    if (role === 'MANAGER') return 'Manager';
    if (role === 'EXECUTIVE') return 'Executive';
    return role;
  };

  return (
    <div className="packages-page">
      <div className="page-header-row">
        <div>
          <h1>Incentives & Salaries</h1>
          <p>Manage monthly base salaries and calculate incentives based on total sales targets.</p>
        </div>
        <div>
          <input
            type="month"
            className="filter-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}

      <div className="table-wrapper" style={{ marginTop: '20px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Total Sales (Month)</th>
              <th>Base Salary (₹)</th>
              <th>Incentive (%)</th>
              <th>Incentive Earned</th>
              <th>Total Salary</th>
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
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} className="table-empty">
                  {pageError ? 'Could not load records.' : 'No users found.'}
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const edit = edits[record.userId] || { baseSalary: '', incentivePercentage: '' };
                const isSaving = savingId === record.userId;

                return (
                  <tr key={record.userId}>
                    <td><strong>{record.name}</strong></td>
                    <td>{formatRole(record.role)}</td>
                    <td className="plan-price" style={{ color: '#16a34a' }}>
                      {money(record.totalSales)}
                    </td>
                    <td>
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          value={edit.baseSalary}
                          onChange={(e) => handleEditChange(record.userId, 'baseSalary', e.target.value)}
                          style={{ width: '100px', padding: '4px' }}
                        />
                      ) : (
                        money(record.baseSalary)
                      )}
                    </td>
                    <td>
                      {canManage ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={edit.incentivePercentage}
                          onChange={(e) => handleEditChange(record.userId, 'incentivePercentage', e.target.value)}
                          style={{ width: '80px', padding: '4px' }}
                        />
                      ) : (
                        `${record.incentivePercentage}%`
                      )}
                    </td>
                    <td className="plan-price">{money(record.incentiveEarned)}</td>
                    <td className="plan-price" style={{ fontWeight: 'bold' }}>{money(record.totalSalary)}</td>
                    {canManage && (
                      <td className="cell-actions col-actions">
                        <button
                          className="btn-primary"
                          style={{ padding: '4px 12px', fontSize: '13px' }}
                          disabled={isSaving}
                          onClick={() => handleSave(record.userId)}
                        >
                          {isSaving ? '...' : 'Save'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
