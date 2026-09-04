import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApi } from '../api/fetchApi';
import { useAuth, type Role } from '../app/providers/AuthProvider';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Info,
  X,
  Filter,
  UserCircle2,
  ExternalLink,
} from 'lucide-react';
import Pagination, { DEFAULT_PAGE_SIZE } from '../components/Pagination';
import ImportButton from '../components/ImportButton';
import ExportButton from '../components/ExportButton';
import './CustomersPage.css';

interface Customer {
  id: string;
  membershipId: string | null;
  name: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  coApplicant: string | null;
  location: string | null;
  plan: string;
  amount: number;
  amountPaid: number;
  pendingAmount: number;
  validity: string | null;
  totalDays: number;
  totalNights: number;
  status: string;
  assignedExec: {
    id: string;
    name: string;
    manager?: { id: string; name: string } | null;
  } | null;
  /**
   * What this customer holds. Non-zero in any of these means Spec 6.3 forbids
   * deleting them, and the API will refuse — so the list uses this to decide
   * whether a delete control belongs on the row at all.
   */
  _count: {
    payments: number;
    refunds: number;
    bookings: number;
    entitlementLog: number;
    memberships: number;
  };
  /**
   * The opening payment only. Present so the edit form can show how the money
   * was taken; _count.payments says whether there are others behind it.
   */
  payments: { id: string; method: string | null }[];
  createdAt: string;
  registrationDate: string | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  cancelled: number;
  expired: number;
  totalSales: number;
  totalPaid: number;
  totalPending: number;
}

interface AssignableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  manager: { id: string; name: string } | null;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  days: number;
  nights: number;
  validityMonths: number;
  isActive: boolean;
}

/**
 * Numeric fields are held as strings so an empty field stays empty and shows
 * its placeholder, rather than a literal 0 the user must delete first.
 */
/*
 * Mirrors the columns of the member sheet the team has filled in every month
 * for two years, because from now on this form replaces it. Anything the sheet
 * records has a home here — co-applicant, second number, location, ADA, offers
 * and conditions — so nothing has to be kept on the side.
 */
const emptyForm = {
  name: '', phone: '', altPhone: '', email: '', coApplicant: '', location: '',
  plan: '', amount: '', amountPaid: '', paymentMethod: '',
  validity: '', totalDays: '', totalNights: '',
  saleDate: '', adaAmount: '', complimentaryNights: '',
  offersText: '', remarksText: '',
  assignedExecId: '', membershipId: '', packageId: '',
};

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function CustomersPage() {
  const { user, hasRole } = useAuth();
  const canDelete = hasRole('SUPER_ADMIN');
  // PATCH /payments/:id is Super Admin and Manager only, so an Executive sees
  // the recorded method but cannot change it.
  const canEditPayment = hasRole('SUPER_ADMIN', 'MANAGER');
  const isExecutive = user?.role === 'EXECUTIVE';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    totalPages: 1,
  });
  /*
   * Held separately from meta.limit, which is what the API last reported. The
   * two agree after a successful load; keeping the request's own value means a
   * failed load does not leave the selector showing a size that was never
   * applied.
   */
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  /*
   * What the edit form's "Paid by" is looking at.
   *
   * `id` is the payment it would correct, and is null unless the customer has
   * exactly one: with none there is nothing to correct, and with several a
   * single dropdown cannot say which row it means. `count` is kept so the field
   * can explain which of those two it is.
   */
  const [editPayment, setEditPayment] = useState<{
    id: string | null;
    method: string;
    count: number;
  }>({ id: null, method: '', count: 0 });

  const [stats, setStats] = useState<Stats>({
    total: 0, active: 0, pending: 0, cancelled: 0, expired: 0,
    totalSales: 0, totalPaid: 0, totalPending: 0,
  });
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [execFilter, setExecFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState('');

  /**
   * The filters currently in force, as query params.
   *
   * Built once and used by both the list and the summary tiles: they used to be
   * fetched with different queries, which is how the table came to show one
   * Executive's 198 customers under a headline of 835.
   */
  const filterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (planFilter) params.set('plan', planFilter);
    if (execFilter) params.set('assignedExecId', execFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params;
  }, [search, statusFilter, planFilter, execFilter, startDate, endDate]);

  const loadCustomers = useCallback(
    async (page = 1, size = pageSize) => {
      setLoading(true);
      setPageError('');
      try {
        const params = filterParams();
        params.set('page', String(page));
        params.set('limit', String(size));

        const res = await fetchApi(`/customers?${params.toString()}`);
        setCustomers(res.data);
        setMeta(res.meta);
      } catch (err: any) {
        setPageError(err.message || 'Failed to load customers');
      } finally {
        setLoading(false);
      }
    },
    [filterParams, pageSize],
  );

  /**
   * Changing the size goes back to page 1: page 4 of a 10-per-page list is past
   * the end of the same list at 50 per page, and asking for it would show an
   * empty table over a non-empty result.
   */
  const changePageSize = (size: number) => {
    setPageSize(size);
    void loadCustomers(1, size);
  };

  const loadStats = useCallback(async () => {
    try {
      // Same filters as the list, so the tiles describe the rows beneath them.
      setStats(await fetchApi(`/customers/stats?${filterParams().toString()}`));
    } catch (err) {
      console.error('Failed to load stats', err);
    }
  }, [filterParams]);

  /** Owner options come from the API so the UI can only offer valid targets. */
  const loadAssignableUsers = useCallback(async () => {
    try {
      setAssignableUsers(await fetchApi('/customers/assignable-users'));
    } catch {
      setAssignableUsers([]);
    }
  }, []);

  /** The plan catalog lives in the database — nothing here is hardcoded. */
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetchApi('/packages?limit=200');
      setPlans(res.data);
    } catch {
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    void loadCustomers(1);
    // The tiles have to follow the filters too, or they describe a different
    // set of customers from the table.
    void loadStats();
  }, [statusFilter, planFilter, execFilter, startDate, endDate, loadCustomers, loadStats]);

  useEffect(() => {
    void loadStats();
    void loadAssignableUsers();
    void loadPlans();
  }, [loadStats, loadAssignableUsers, loadPlans]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadCustomers(1);
    void loadStats();
  };

  const openAddModal = () => {
    setEditingId(null);
    setEditPayment({ id: null, method: '', count: 0 });
    setForm({ ...emptyForm });
    setFormError('');
    setShowModal(true);
  };

  const openEditModal = (c: Customer) => {
    const opening =
      c._count.payments === 1 && c.payments[0] ? c.payments[0] : null;
    setEditPayment({
      id: opening?.id ?? null,
      method: opening?.method ?? '',
      count: c._count.payments,
    });

    setEditingId(c.id);
    setForm({
      name: c.name,
      phone: c.phone,
      altPhone: c.altPhone || '',
      email: c.email || '',
      coApplicant: c.coApplicant || '',
      location: c.location || '',
      /*
       * Sale-only fields stay blank when editing: they belong to the plan
       * purchase, which is managed from the customer's own page once it exists.
       */
      saleDate: '',
      adaAmount: '',
      complimentaryNights: '',
      offersText: '',
      remarksText: '',
      plan: c.plan,
      amount: String(c.amount),
      amountPaid: String(c.amountPaid),
      paymentMethod: opening?.method ?? '',
      validity: c.validity || '',
      // Editing records no new sale, so no packageId — the membership that
      // already exists is managed from the customer's own page.
      packageId: '',
      totalDays: String(c.totalDays),
      totalNights: String(c.totalNights),
      assignedExecId: c.assignedExec?.id || '',
      membershipId: c.membershipId || '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      // Empty optional numbers mean "none", so they become 0 rather than NaN.
      const payload: any = {
        name: form.name,
        phone: form.phone,
        plan: form.plan,
        amount: Number(form.amount || 0),
        totalDays: Number(form.totalDays || 0),
        totalNights: Number(form.totalNights || 0),
      };

      /*
       * Only sent on create. The API records this as the customer's first
       * payment row, which makes it the same money as the payment history
       * rather than a second, competing total — so editing it here afterwards
       * would double-count. Corrections happen in the payment history.
       */
      /*
       * The opening payment can be recorded from the edit form too, but only
       * while the customer has no payment row: with one, amountPaid is that
       * row's total and typing over it is what used to desynchronise the two
       * (the API refuses it outright). With none there is nothing to contradict,
       * and the API writes the missing row from these two fields.
       */
      if (!editingId || editPayment.count === 0) {
        payload.amountPaid = Number(form.amountPaid || 0);
        if (form.paymentMethod) payload.paymentMethod = form.paymentMethod;
      }

      /*
       * Sends the plan being sold, not just its name. The API then records the
       * membership, allocates its nights and attributes the opening payment to
       * it inside the same transaction — without this the customer's plan
       * columns described a plan the system did not actually hold.
       *
       * Create only: an existing customer's membership is managed from their own
       * page, where cancelling and reactivating move the entitlement ledger.
       */
      if (!editingId && form.packageId) {
        payload.packageId = form.packageId;
      }

      /*
       * Sale-only, so create-only. Editing a customer must not silently open a
       * second ADA charge or credit the complimentary nights again — those
       * belong to the purchase and are managed on the customer's own page.
       */
      if (!editingId) {
        if (form.saleDate) payload.saleDate = form.saleDate;
        if (form.adaAmount) payload.adaAmount = Number(form.adaAmount);
        if (form.complimentaryNights) {
          payload.complimentaryNights = Number(form.complimentaryNights);
        }
        if (form.offersText) payload.offersText = form.offersText;
        if (form.remarksText) payload.remarksText = form.remarksText;
      }
      if (form.email) payload.email = form.email;
      if (form.altPhone) payload.altPhone = form.altPhone;
      if (form.coApplicant) payload.coApplicant = form.coApplicant;
      if (form.location) payload.location = form.location;
      if (form.validity) payload.validity = form.validity;
      if (form.membershipId) payload.membershipId = form.membershipId;
      // An Executive always owns what they create, so the API ignores this
      // field for them — only send it when the caller may actually assign.
      if (!isExecutive && form.assignedExecId) {
        payload.assignedExecId = form.assignedExecId;
      }

      if (editingId) {
        await fetchApi(`/customers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      /*
       * A second request on purpose, and deliberately after the customer save:
       * the method lives on the Payment row, which has its own endpoint and its
       * own audit trail (PATCH /payments/:id — method, date and notes only, the
       * amount is immutable). Its failure is reported without pretending the
       * customer edit did not happen, because it did.
       */
      if (
        editingId &&
        editPayment.id &&
        form.paymentMethod !== editPayment.method
      ) {
        try {
          await fetchApi(`/payments/${editPayment.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ method: form.paymentMethod || null }),
          });
        } catch (err: any) {
          setFormError(
            `The customer was saved, but the payment method could not be updated: ${err?.message ?? 'unknown error'
            }`,
          );
          await Promise.all([loadCustomers(meta.page), loadStats()]);
          return;
        }
      }

      setShowModal(false);
      await Promise.all([loadCustomers(meta.page), loadStats()]);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await fetchApi(`/customers/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await Promise.all([loadCustomers(meta.page), loadStats()]);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete');
    }
  };

  const clearFilters = () => {
    setStatusFilter('');
    setPlanFilter('');
    setExecFilter('');
    setSearch('');
  };

  const hasFilters = Boolean(statusFilter || planFilter || execFilter || search);

  /**
   * Plans offered when adding/editing: active catalog entries, plus whatever
   * the customer already has so an archived plan is never silently dropped.
   */
  const selectablePlans = [
    ...plans.filter((p) => p.isActive).map((p) => p.name),
    ...(form.plan && !plans.some((p) => p.isActive && p.name === form.plan)
      ? [form.plan]
      : []),
  ];

  /** Filter list also includes plan names present on existing records. */
  const filterablePlanNames = Array.from(
    new Set([...plans.map((p) => p.name), ...customers.map((c) => c.plan)]),
  ).filter(Boolean);

  /** Selecting a plan pulls its price, days, nights and validity from the DB. */
  const applyPlan = (planName: string) => {
    const plan = plans.find((p) => p.name === planName);
    if (!plan) {
      // An archived plan carried on an existing record: keep the name, but there
      // is no catalogue entry to sell, so no packageId.
      setForm({ ...form, plan: planName, packageId: '' });
      return;
    }
    const years = plan.validityMonths % 12 === 0 ? plan.validityMonths / 12 : 0;
    setForm({
      ...form,
      plan: planName,
      packageId: plan.id,
      amount: String(plan.price),
      totalDays: String(plan.days),
      totalNights: String(plan.nights),
      validity: years
        ? `${years} ${years === 1 ? 'Year' : 'Years'}`
        : `${plan.validityMonths} Months`,
    });
  };

  /**
   * Reads the record's history back as a sentence, for the tooltip that stands
   * in for the delete button. Built from the same counts the API's own refusal
   * uses, so the explanation matches the reason.
   */
  const historySummary = (c: Customer) => {
    const parts: string[] = [];
    const add = (n: number, one: string, many = `${one}s`) => {
      if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
    };
    add(c._count.payments, 'payment');
    add(c._count.refunds, 'refund');
    add(c._count.bookings, 'booking');
    add(c._count.entitlementLog, 'ledger entry', 'ledger entries');
    add(c._count.memberships, 'membership');
    return parts.join(', ');
  };

  /*
   * This badge is the customer's membership status, kept in step by the API
   * whenever a plan is cancelled, expired or reactivated — it is not a field
   * anyone types into. EXPIRED is distinct from CANCELLED on purpose: one
   * reached the end of its term, the other was called off.
   */
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'badge-green',
      PENDING: 'badge-yellow',
      CANCELLED: 'badge-red',
      EXPIRED: 'badge-gray',
    };
    return <span className={`status-badge ${map[status] || ''}`}>{status}</span>;
  };

  return (
    <div className="customers-page">
      <div className="page-header-row">
        <div>
          <h1>Customers</h1>
          <p>Manage your customer base and memberships.</p>
        </div>
        <div className="page-header-actions">
          {/*
            Import is Super Admin only — it creates customers, memberships,
            payments, entitlement history AND user accounts in one action, which
            is more reach than any other control in the CRM. Export is open to a
            Manager as well, scoped to their own team by the API.
          */}
          {hasRole('SUPER_ADMIN') && (
            <ImportButton
              onImported={() => {
                void loadCustomers(1);
                void loadStats();
              }}
            />
          )}
          {hasRole('SUPER_ADMIN', 'MANAGER') && (
            <ExportButton path="/exports/customers" />
          )}
          <button className="btn-primary" onClick={openAddModal}>
            <Plus size={18} /> Add Customer
          </button>
        </div>
      </div>

      {pageError && <div className="modal-error">{pageError}</div>}

      {/* Status counters — click to filter */}
      <div className="stats-row">
        <div className="mini-stat" onClick={() => setStatusFilter('')}>
          <span className="mini-stat-value">{stats.total}</span>
          <span className="mini-stat-label">Total</span>
        </div>
        <div className="mini-stat" onClick={() => setStatusFilter('ACTIVE')}>
          <span className="mini-stat-value" style={{ color: '#16a34a' }}>{stats.active}</span>
          <span className="mini-stat-label">Active</span>
        </div>
        <div className="mini-stat" onClick={() => setStatusFilter('PENDING')}>
          <span className="mini-stat-value" style={{ color: '#d97706' }}>{stats.pending}</span>
          <span className="mini-stat-label">Pending</span>
        </div>
        <div className="mini-stat" onClick={() => setStatusFilter('CANCELLED')}>
          <span className="mini-stat-value" style={{ color: '#dc2626' }}>{stats.cancelled}</span>
          <span className="mini-stat-label">Cancelled</span>
        </div>
        <div className="mini-stat" onClick={() => setStatusFilter('EXPIRED')}>
          <span className="mini-stat-value" style={{ color: '#6b7280' }}>{stats.expired}</span>
          <span className="mini-stat-label">Expired</span>
        </div>
      </div>

      {/* Financial summary for the caller's own scope */}
      <div className="stats-row">
        <div className="mini-stat static">
          <span className="mini-stat-value">{money(stats.totalSales)}</span>
          <span className="mini-stat-label">Total plan value</span>
        </div>
        <div className="mini-stat static">
          <span className="mini-stat-value" style={{ color: '#16a34a' }}>{money(stats.totalPaid)}</span>
          <span className="mini-stat-label">Collected</span>
        </div>
        <div className="mini-stat static">
          <span className="mini-stat-value" style={{ color: '#dc2626' }}>{money(stats.totalPending)}</span>
          <span className="mini-stat-label">Pending</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="toolbar">
        <form onSubmit={handleSearch} className="search-form">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by name, phone, email or membership ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="filter-select"
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
        >
          <option value="">All plans</option>
          {filterablePlanNames.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {!isExecutive && assignableUsers.length > 0 && (
          <select
            className="filter-select"
            value={execFilter}
            onChange={(e) => setExecFilter(e.target.value)}
          >
            <option value="">All owners</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}

        <div className="date-filter">
          <input
            type="date"
            className="filter-select"
            title="From Date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span style={{ color: '#6b7280', margin: '0 4px' }}>to</span>
          <input
            type="date"
            className="filter-select"
            title="To Date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {statusFilter && (
          <button className="btn-outline" onClick={() => setStatusFilter('')}>
            <Filter size={14} /> {statusFilter} <X size={14} />
          </button>
        )}

        {hasFilters && (
          <button className="btn-outline" onClick={clearFilters}>
            Clear all <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Reg. Date</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="table-empty">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={10} className="table-empty">
                  {/* A failed load must not claim there are no customers. */}
                  {pageError
                    ? 'Could not load customers. See the message above.'
                    : hasFilters
                      ? 'No customers match these filters.'
                      : 'No customers found. Click "Add Customer" to create one.'}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="cell-name">
                    <Link to={`/customers/${c.id}`} className="row-link">
                      {c.name}
                    </Link>
                    {c.email && <small>{c.email}</small>}
                  </td>
                  <td>{c.registrationDate ? new Date(c.registrationDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                  <td>{c.phone}</td>
                  <td>{c.plan}</td>
                  <td>{money(c.amount)}</td>
                  <td>{money(c.amountPaid)}</td>
                  <td>{money(c.pendingAmount)}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>
                    {c.assignedExec ? (
                      <span className="owner-cell">
                        {c.assignedExec.name}
                        {c.assignedExec.manager && (
                          <small>{c.assignedExec.manager.name}</small>
                        )}
                      </span>
                    ) : (
                      <span className="status-badge badge-yellow">Unassigned</span>
                    )}
                  </td>
                  <td className="cell-actions">
                    <Link
                      to={`/customers/${c.id}`}
                      className="icon-action"
                      title="View details"
                    >
                      <ExternalLink size={16} />
                    </Link>
                    <button className="icon-action" title="Edit" onClick={() => openEditModal(c)}>
                      <Edit2 size={16} />
                    </button>
                    {/*
                      A delete button only where deleting can succeed. Offering
                      one on a customer with history meant the only way to learn
                      it was impossible was to click it and read a 409 — so the
                      row explains itself instead.
                    */}
                    {canDelete &&
                      (historySummary(c) ? (
                        <span
                          className="icon-action info-hint"
                          tabIndex={0}
                          role="note"
                          aria-label={`Cannot be deleted: ${historySummary(c)} on record`}
                        >
                          <Info size={16} />
                          <span className="info-tip" role="tooltip">
                            <strong>Kept on record</strong>
                            {' — '}
                            {historySummary(c)}.
                            <br />
                            Payments and stays are permanent history, so this
                            customer cannot be deleted. Cancel or expire their
                            membership instead; they stay in the list as
                            CANCELLED.
                          </span>
                        </span>
                      ) : (
                        <button
                          className="icon-action danger"
                          title="Delete"
                          onClick={() => { setDeleteError(''); setDeleteTarget(c); }}
                        >
                          <Trash2 size={16} />
                        </button>
                      ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        meta={meta}
        pageSize={pageSize}
        loading={loading}
        label="customers"
        onPageChange={(p) => loadCustomers(p)}
        onPageSizeChange={changePageSize}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>

            {formError && <div className="modal-error">{formError}</div>}

            <form onSubmit={handleSave} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone *</label>
                  <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Alternative phone</label>
                  <input
                    value={form.altPhone}
                    onChange={(e) =>
                      setForm({ ...form, altPhone: e.target.value })
                    }
                  />
                  <small className="field-note">
                    A second number for the same member, if there is one.
                  </small>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Co-applicant</label>
                  <input
                    placeholder="e.g. spouse's name"
                    value={form.coApplicant}
                    onChange={(e) =>
                      setForm({ ...form, coApplicant: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Location</label>
                  <input
                    placeholder="e.g. Bathinda"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Plan *</label>
                  <select
                    required
                    value={form.plan}
                    onChange={(e) => applyPlan(e.target.value)}
                  >
                    <option value="">
                      {plans.length === 0 ? 'No plans defined yet' : 'Select Plan'}
                    </option>
                    {selectablePlans.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {plans.length === 0 ? (
                    <small className="field-warning">
                      Add plans under Plans first — the list comes from the
                      database.
                    </small>
                  ) : (
                    <small className="field-note">
                      Selecting a plan records it as a real membership: its
                      nights are allocated and the opening payment is filed
                      against it. The price is prefilled and can be
                      negotiated; the nights cannot.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Total Amount *</label>
                  <input type="number" required min={0} placeholder="e.g. 90000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Amount paid now</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 30000"
                    value={form.amountPaid}
                    onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
                    disabled={!!editingId && editPayment.count > 0}
                  />
                  <small className="field-note">
                    {!editingId
                      ? 'Saved as the first entry in this customer’s payment history. Leave blank if nothing has been collected yet.'
                      : editPayment.count > 0
                        ? 'Locked — this is the total of the payment records. Add or remove a payment on the customer’s page to change it.'
                        : 'Nothing collected yet. Entering an amount here records this customer’s first payment.'}
                  </small>
                </div>
                <div className="form-group">
                  <label>Paid by</label>
                  {/*
                    On the add form this is deliberately NOT disabled while the
                    amount is blank. It was, and a greyed-out dropdown with no
                    stated reason reads as a broken control rather than as a
                    dependency — someone filling the form top-to-bottom reaches
                    this before the amount and concludes the field is dead.

                    On the edit form it IS disabled when there is no single
                    payment to correct, or when the caller may not correct one —
                    but never silently: the note below always says which.
                  */}
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    disabled={
                      !!editingId &&
                      editPayment.count > 0 &&
                      (!editPayment.id || !canEditPayment)
                    }
                  >
                    <option value="">Not specified</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                  </select>

                  {!editingId &&
                    form.paymentMethod &&
                    Number(form.amountPaid || 0) <= 0 && (
                      <small className="field-warning">
                        Enter an amount above for this to be recorded — a method
                        on its own creates no payment.
                      </small>
                    )}

                  {editingId && (
                    <small className="field-note">
                      {editPayment.count === 0
                        ? 'How the first payment was taken. Applies to the amount entered above.'
                        : !editPayment.id
                          ? 'This customer has several payments, each with its own method. Edit them individually in the payment history on their page.'
                          : canEditPayment
                            ? 'How the recorded payment was taken. Changing this corrects that payment — the amount is untouched.'
                            : 'How the recorded payment was taken. Only a Manager or Super Admin can correct it.'}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Validity</label>
                  <input placeholder="e.g. 5 Years" value={form.validity} onChange={(e) => setForm({ ...form, validity: e.target.value })} />
                </div>
                {/*
                  Distinct from the Membership *record* on the customer detail
                  page. This is only a reference label; it carries no plan,
                  dates or entitlement. The two sharing a name is a wart
                  inherited from the spec's own schema (§6.2).
                */}
                <div className="form-group">
                  <label>Membership ID / card no.</label>
                  <input placeholder="e.g. CI-2026-001" value={form.membershipId} onChange={(e) => setForm({ ...form, membershipId: e.target.value })} />
                  <small className="field-note">
                    Just a reference number for looking this customer up. The
                    actual plan is added separately, on the customer's page.
                  </small>
                </div>
                <div className="form-group">
                  <label>Total Days</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 4"
                    value={form.totalDays}
                    onChange={(e) => setForm({ ...form, totalDays: e.target.value })}
                    readOnly={!!form.packageId}
                  />
                </div>
                <div className="form-group">
                  <label>Total Nights</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 3"
                    value={form.totalNights}
                    onChange={(e) => setForm({ ...form, totalNights: e.target.value })}
                    readOnly={!!form.packageId}
                  />
                  {form.packageId && (
                    <small className="field-note">
                      Nights come from the plan and are what the customer
                      actually spends on stays, so they are not editable here.
                      Days are the span of those nights.
                    </small>
                  )}
                </div>

                {/* Ownership decides who can see this customer at all. */}
                <div className="form-group form-group-wide">
                  <label>Assigned To (Executive)</label>
                  {isExecutive ? (
                    <div className="assigned-self">
                      <UserCircle2 size={16} />
                      <span>{user?.name} — customers you add are assigned to you</span>
                    </div>
                  ) : (
                    <select
                      value={form.assignedExecId}
                      onChange={(e) => setForm({ ...form, assignedExecId: e.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role === 'MANAGER' ? 'Manager' : 'Executive'})
                          {u.manager ? ` · ${u.manager.name}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {!isExecutive && !form.assignedExecId && (
                    <small className="field-warning">
                      An unassigned customer is only visible to Super Admins.
                    </small>
                  )}
                </div>
              </div>

              {!editingId && (
                <>
                  <div className="form-section-heading">
                    This purchase
                    <small>
                      Recorded against the membership, not the customer — so
                      they stay right even when a second plan is bought later.
                    </small>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Sale date</label>
                      <input
                        type="date"
                        value={form.saleDate}
                        onChange={(e) =>
                          setForm({ ...form, saleDate: e.target.value })
                        }
                      />
                      <small className="field-note">
                        Leave blank for today. Set it when entering an older
                        sale — the plan year, and when nights lapse, both count
                        from here.
                      </small>
                    </div>
                    <div className="form-group">
                      <label>ADA — annual divided cost</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 8000"
                        value={form.adaAmount}
                        onChange={(e) =>
                          setForm({ ...form, adaAmount: e.target.value })
                        }
                      />
                      <small className="field-note">
                        Charged every year and tracked apart from the plan price.
                        Year 1 is raised now; later years as they fall due.
                      </small>
                    </div>
                    <div className="form-group">
                      <label>Complimentary nights</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 2"
                        value={form.complimentaryNights}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            complimentaryNights: e.target.value,
                          })
                        }
                      />
                      <small className="field-note">
                        Free nights on top of the plan. Counted separately, and
                        they do not lapse with the plan year.
                      </small>
                    </div>
                    <div className="form-group">
                      <label>Offers</label>
                      <input
                        placeholder="e.g. 02N/03D Complimentary, Food Voucher ₹3000"
                        value={form.offersText}
                        onChange={(e) =>
                          setForm({ ...form, offersText: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group form-group-wide">
                      <label>Remarks / conditions</label>
                      <input
                        placeholder="e.g. only for India, 3 & 4 star properties only"
                        value={form.remarksText}
                        onChange={(e) =>
                          setForm({ ...form, remarksText: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Customer' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Delete</h3>
            <p style={{ color: '#6b7280', margin: '16px 0' }}>
              Delete <strong>{deleteTarget.name}</strong> permanently? This cannot
              be undone. Customers holding payments, refunds, bookings or
              memberships cannot be deleted — cancel the membership instead.
            </p>
            {deleteError && <div className="modal-error">{deleteError}</div>}
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
