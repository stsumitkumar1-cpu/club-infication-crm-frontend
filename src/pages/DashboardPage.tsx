import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserSquare2,
  Wallet,
  TrendingUp,
  Undo2,
  BadgeCheck,
  CalendarClock,
  Sun,
  Moon,
  AlertTriangle,
  Info,
  Network,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './DashboardPage.css';

interface Dashboard {
  scope: 'global' | 'team' | 'own';
  role: string;
  generatedAt: string;
  customers: {
    total: number;
    newThisMonth: number;
    active: number;
    pending: number;
    cancelled: number;
  };
  sales: {
    planValue: number;
    recordedPaid: number;
    pending: number;
    customersWithPending: number;
    collectedFromPayments: number;
    paymentCount: number;
    collectedThisMonth: number;
    paymentsThisMonth: number;
  };
  refunds: { total: number; count: number };
  memberships: {
    total: number;
    active: number;
    expiringIn30Days: number;
    pastEndDate: number;
  };
  bookings: {
    total: number;
    upcoming: number;
    completed: number;
    cancelled: number;
  };
  usage: {
    // Nights are the only ledgered quantity. daysRemaining is derived from
    // nightsRemaining (nights + 1) and describes one continuous stay, so there
    // is no day figure for the individual movements.
    nightsAllocated: number;
    nightsUsed: number;
    nightsReturned: number;
    nightsAdjusted: number;
    nightsExpired: number;
    nightsRemaining: number;
    daysRemaining: number;
  };
  team: {
    executives: number;
    activeExecutives: number;
    managers: number;
    unassignedExecutives: number;
  } | null;
  incentives: { available: boolean; reason: string };
}

type PerfSort =
  | 'totalSales'
  | 'collected'
  | 'pending'
  | 'customers'
  | 'daysUsed'
  | 'name';

interface PerfQuery {
  page: number;
  limit: number;
  sortBy: PerfSort;
  sortDir: 'asc' | 'desc';
}

interface PerfMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sortBy: PerfSort;
  sortDir: 'asc' | 'desc';
  /** Across every in-scope executive, not just the visible page. */
  totals: {
    customers: number;
    totalSales: number;
    collected: number;
    pending: number;
    daysUsed: number;
    nightsUsed: number;
  };
}

interface PerformanceRow {
  executive: {
    id: string;
    name: string;
    isActive: boolean;
    manager: { id: string; name: string } | null;
  };
  customers: number;
  totalSales: number;
  collected: number;
  pending: number;
  daysUsed: number;
  nightsUsed: number;
  incentive: number | null;
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const SCOPE_LABEL: Record<string, string> = {
  global: 'Company-wide',
  team: 'Your team',
  own: 'Your records',
};

export default function DashboardPage() {
  const { user } = useAuth();

  const [data, setData] = useState<Dashboard | null>(null);
  const [performance, setPerformance] = useState<PerformanceRow[]>([]);
  const [perfMeta, setPerfMeta] = useState<PerfMeta | null>(null);
  const [perfQuery, setPerfQuery] = useState<PerfQuery>({
    page: 1,
    limit: 10,
    sortBy: 'totalSales',
    sortDir: 'desc',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Every role gets this: the API already narrows it — a Super Admin sees
      // all executives, a Manager their team, an Executive their own row
      // (Spec 12 lists "Personal sales" on the Executive dashboard).
      const params = new URLSearchParams({
        page: String(perfQuery.page),
        limit: String(perfQuery.limit),
        sortBy: perfQuery.sortBy,
        sortDir: perfQuery.sortDir,
      });
      const [dash, perf] = await Promise.all([
        fetchApi('/reports/dashboard'),
        fetchApi(`/reports/executive-performance?${params.toString()}`),
      ]);
      setData(dash);
      setPerformance(perf.data);
      setPerfMeta(perf.meta);
    } catch (err: any) {
      setError(err.message || 'Failed to load the dashboard');
    } finally {
      setLoading(false);
    }
  }, [perfQuery]);

  /** Clicking a header sorts by it; clicking again flips the direction. */
  const sortBy = (field: PerfSort) => {
    setPerfQuery((q) => ({
      ...q,
      page: 1,
      sortBy: field,
      sortDir:
        q.sortBy === field ? (q.sortDir === 'desc' ? 'asc' : 'desc') : 'desc',
    }));
  };

  const sortIndicator = (field: PerfSort) =>
    perfQuery.sortBy === field ? (perfQuery.sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="dash-loading">Loading your dashboard...</div>;
  }

  if (error || !data) {
    return (
      <div className="dashboard-page">
        <div className="modal-error">{error || 'No dashboard data'}</div>
      </div>
    );
  }

  const { customers, sales, refunds, memberships, bookings, usage, team } = data;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <h1>Overview</h1>
          <p>
            {user?.name} · <strong>{SCOPE_LABEL[data.scope]}</strong> — every
            figure below is limited to what you can access.
          </p>
        </div>
      </div>

      {/* Headline: customers and money */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#eef2ff', color: '#4f46e5' }}>
            <UserSquare2 size={24} />
          </div>
          <div className="stat-details">
            <h3>Customers</h3>
            <p className="stat-value">{customers.total.toLocaleString()}</p>
            <small className="stat-sub">
              {customers.newThisMonth} added this month
            </small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-details">
            <h3>Total sales</h3>
            <p className="stat-value">{money(sales.planValue)}</p>
            <small className="stat-sub">plan value on record</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
            <Wallet size={24} />
          </div>
          <div className="stat-details">
            <h3>Collected</h3>
            <p className="stat-value">{money(sales.recordedPaid)}</p>
            <small className="stat-sub">
              {money(sales.collectedThisMonth)} this month
            </small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="stat-details">
            <h3>Pending</h3>
            <p className="stat-value">{money(sales.pending)}</p>
            <small className="stat-sub">
              across {sales.customersWithPending} customer
              {sales.customersWithPending === 1 ? '' : 's'}
            </small>
          </div>
        </div>
      </div>

      {/* Secondary: memberships, refunds, bookings, team */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#f5f3ff', color: '#7c3aed' }}>
            <BadgeCheck size={24} />
          </div>
          <div className="stat-details">
            <h3>Active memberships</h3>
            <p className="stat-value">{memberships.active}</p>
            <small className="stat-sub">of {memberships.total} recorded</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#fff7ed', color: '#ea580c' }}>
            <Undo2 size={24} />
          </div>
          <div className="stat-details">
            <h3>Refunds</h3>
            <p className="stat-value">{money(refunds.total)}</p>
            <small className="stat-sub">{refunds.count} recorded</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ backgroundColor: '#ecfeff', color: '#0891b2' }}>
            <CalendarClock size={24} />
          </div>
          <div className="stat-details">
            <h3>Upcoming stays</h3>
            <p className="stat-value">{bookings.upcoming}</p>
            <small className="stat-sub">
              {bookings.total} bookings all time
            </small>
          </div>
        </div>

        {team ? (
          <div className="stat-card">
            <div className="stat-icon-wrapper" style={{ backgroundColor: '#fdf4ff', color: '#c026d3' }}>
              <Users size={24} />
            </div>
            <div className="stat-details">
              <h3>{data.scope === 'global' ? 'Executives' : 'Your executives'}</h3>
              <p className="stat-value">{team.activeExecutives}</p>
              <small className="stat-sub">
                {data.scope === 'global'
                  ? `${team.managers} manager${team.managers === 1 ? '' : 's'}`
                  : `${team.executives} assigned`}
              </small>
            </div>
          </div>
        ) : (
          <div className="stat-card">
            <div className="stat-icon-wrapper" style={{ backgroundColor: '#fdf2f8', color: '#db2777' }}>
              <Sun size={24} />
            </div>
            <div className="stat-details">
              <h3>Nights remaining</h3>
              <p className="stat-value">{usage.nightsRemaining}</p>
              <small className="stat-sub">
                across your customers · {usage.daysRemaining} days in one stay
              </small>
            </div>
          </div>
        )}
      </div>

      {/* Things needing action */}
      {(memberships.expiringIn30Days > 0 ||
        memberships.pastEndDate > 0 ||
        (team?.unassignedExecutives ?? 0) > 0) && (
        <div className="alert-strip">
          <AlertTriangle size={16} />
          <div className="alert-items">
            {memberships.expiringIn30Days > 0 && (
              <span>
                <strong>{memberships.expiringIn30Days}</strong> membership
                {memberships.expiringIn30Days === 1 ? '' : 's'} expiring within
                30 days
              </span>
            )}
            {memberships.pastEndDate > 0 && (
              <span>
                <strong>{memberships.pastEndDate}</strong> still marked active
                past their end date
              </span>
            )}
            {(team?.unassignedExecutives ?? 0) > 0 && (
              <span>
                <strong>{team?.unassignedExecutives}</strong> executive
                {team?.unassignedExecutives === 1 ? '' : 's'} with no manager —{' '}
                <Link to="/teams">assign in Teams</Link>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-content-grid">
        {/* Usage, reconciled from the ledger */}
        <div className="content-card">
          <div className="card-header">
            <h3>Customer usage</h3>
            <span className="card-note">from the entitlement ledger</span>
          </div>
          <div className="card-body">
            <table className="usage-table">
              <thead>
                <tr>
                  <th></th>
                  <th><Moon size={13} /> Nights</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Allocated</td>
                  <td className="pos">+{usage.nightsAllocated}</td>
                </tr>
                <tr>
                  <td>Used on stays</td>
                  <td className="neg">−{usage.nightsUsed}</td>
                </tr>
                {usage.nightsReturned > 0 && (
                  <tr>
                    <td>Returned (cancellations)</td>
                    <td className="pos">+{usage.nightsReturned}</td>
                  </tr>
                )}
                {usage.nightsAdjusted !== 0 && (
                  <tr>
                    <td>Adjustments</td>
                    <td className={usage.nightsAdjusted >= 0 ? 'pos' : 'neg'}>
                      {usage.nightsAdjusted > 0 ? '+' : ''}
                      {usage.nightsAdjusted}
                    </td>
                  </tr>
                )}
                {usage.nightsExpired > 0 && (
                  <tr>
                    <td>Closed on expiry</td>
                    <td className="neg">−{usage.nightsExpired}</td>
                  </tr>
                )}
                <tr className="usage-total">
                  <td>Remaining</td>
                  <td>{usage.nightsRemaining}</td>
                </tr>
              </tbody>
            </table>
            {usage.nightsAllocated === 0 && (
              <p className="empty-state">
                No entitlement allocated yet. Recording a membership credits the
                plan's nights.
              </p>
            )}
          </div>
        </div>

        {/* Payment reconciliation + incentives placeholder */}
        <div className="content-card">
          <div className="card-header">
            <h3>Collection</h3>
          </div>
          <div className="card-body">
            <dl className="dash-list">
              <div>
                <dt>Plan value</dt>
                <dd>{money(sales.planValue)}</dd>
              </div>
              <div>
                <dt>Recorded as paid</dt>
                <dd className="pos">{money(sales.recordedPaid)}</dd>
              </div>
              <div>
                <dt>Payment rows on file</dt>
                <dd>
                  {money(sales.collectedFromPayments)}{' '}
                  <small>({sales.paymentCount})</small>
                </dd>
              </div>
              <div>
                <dt>Still pending</dt>
                <dd className="neg">{money(sales.pending)}</dd>
              </div>
            </dl>

            {sales.collectedFromPayments !== sales.recordedPaid && (
              <p className="empty-state">
                The gap between recorded-paid and payment rows is opening
                balances entered without individual receipts.
              </p>
            )}

            {!data.incentives.available && (
              <p className="incentive-note">
                <Info size={14} /> {data.incentives.reason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Performance — every role, scoped by the API */}
      {(performance.length > 0 || data.scope !== 'own') && (
        <div className="content-card">
          <div className="card-header">
            <h3>
              <Network size={15} />{' '}
              {data.scope === 'own' ? 'Your performance' : 'Executive performance'}
            </h3>
            <span className="card-note">
              {data.scope === 'global'
                ? 'all executives'
                : data.scope === 'team'
                  ? 'your team'
                  : 'your own figures'}
            </span>
          </div>
          <div className="card-body">
            {performance.length === 0 ? (
              <p className="empty-state">
                No executives in scope yet. Create them under Team / Users.
              </p>
            ) : (
              <>
                {/* Horizontal scroll: eight columns will not fit a laptop
                    viewport, and the page body must never scroll sideways. */}
                <div className="table-scroll">
                  <table className="data-table perf-table">
                    <thead>
                      <tr>
                        <th
                          className="th-sort th-sticky"
                          onClick={() => sortBy('name')}
                          title="Sort by name"
                        >
                          {data.scope === 'own' ? 'You' : 'Executive'}
                          {sortIndicator('name')}
                        </th>
                        {data.scope === 'global' && <th>Manager</th>}
                        <th
                          className="th-sort num"
                          onClick={() => sortBy('customers')}
                          title="Sort by customer count"
                        >
                          Customers{sortIndicator('customers')}
                        </th>
                        <th
                          className="th-sort num"
                          onClick={() => sortBy('totalSales')}
                          title="Sort by sales"
                        >
                          Sales{sortIndicator('totalSales')}
                        </th>
                        <th
                          className="th-sort num"
                          onClick={() => sortBy('collected')}
                          title="Sort by amount collected"
                        >
                          Collected{sortIndicator('collected')}
                        </th>
                        <th
                          className="th-sort num"
                          onClick={() => sortBy('pending')}
                          title="Sort by amount pending"
                        >
                          Pending{sortIndicator('pending')}
                        </th>
                        <th
                          className="th-sort num"
                          onClick={() => sortBy('daysUsed')}
                          title="Sort by days used"
                        >
                          Days / nights{sortIndicator('daysUsed')}
                        </th>
                        <th className="num">Incentive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.map((row) => (
                        <tr
                          key={row.executive.id}
                          className={row.executive.isActive ? '' : 'row-inactive'}
                        >
                          <td className="td-sticky">
                            <strong>{row.executive.name}</strong>
                            {!row.executive.isActive && (
                              <span className="status-badge badge-red inline-tag">
                                inactive
                              </span>
                            )}
                          </td>
                          {data.scope === 'global' && (
                            <td>{row.executive.manager?.name ?? '—'}</td>
                          )}
                          <td className="num">{row.customers}</td>
                          <td className="num">{money(row.totalSales)}</td>
                          <td className="num pos">{money(row.collected)}</td>
                          <td className="num neg">{money(row.pending)}</td>
                          <td className="num">
                            {row.daysUsed} / {row.nightsUsed}
                          </td>
                          <td className="num">
                            {row.incentive === null ? (
                              <span
                                className="muted-dash"
                                title="Pending the client's incentive slabs (Phase 7)"
                              >
                                —
                              </span>
                            ) : (
                              money(row.incentive)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* Totals span every in-scope executive, not just this page. */}
                    {perfMeta && perfMeta.total > 1 && (
                      <tfoot>
                        <tr className="perf-totals">
                          <td className="td-sticky">
                            All {perfMeta.total} executives
                          </td>
                          {data.scope === 'global' && <td />}
                          <td className="num">{perfMeta.totals.customers}</td>
                          <td className="num">{money(perfMeta.totals.totalSales)}</td>
                          <td className="num pos">{money(perfMeta.totals.collected)}</td>
                          <td className="num neg">{money(perfMeta.totals.pending)}</td>
                          <td className="num">
                            {perfMeta.totals.daysUsed} / {perfMeta.totals.nightsUsed}
                          </td>
                          <td className="num">—</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {perfMeta && perfMeta.totalPages > 1 && (
                  <div className="pagination">
                    <button
                      disabled={perfMeta.page <= 1}
                      onClick={() =>
                        setPerfQuery((q) => ({ ...q, page: q.page - 1 }))
                      }
                    >
                      <ChevronLeft size={16} /> Prev
                    </button>
                    <span>
                      Page {perfMeta.page} of {perfMeta.totalPages} ·{' '}
                      {perfMeta.total} executives
                    </span>
                    <button
                      disabled={perfMeta.page >= perfMeta.totalPages}
                      onClick={() =>
                        setPerfQuery((q) => ({ ...q, page: q.page + 1 }))
                      }
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
