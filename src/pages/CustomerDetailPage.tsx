import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  CalendarClock,
  BadgeCheck,
  UserCircle2,
  Wallet,
  Moon,
  Sun,
  Plus,
  X,
  Trash2,
  Undo2,
  CalendarPlus,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './CustomerDetailPage.css';

interface PlanRef {
  package: { id: string; name: string } | null;
}

interface Payment {
  id: string;
  amount: number;
  method: string | null;
  date: string;
  notes: string | null;
  membership: PlanRef | null;
}

interface Booking {
  id: string;
  checkIn: string;
  checkOut: string;
  daysUsed: number;
  nightsUsed: number;
  status: string;
  notes: string | null;
}

interface Refund {
  id: string;
  amount: number;
  date: string;
  reason: string | null;
  membership: PlanRef | null;
  approvedBy: { id: string; name: string } | null;
}

interface LedgerEntry {
  id: string;
  type: string;
  nights: number;
  description: string | null;
  date: string;
  booking: { id: string; checkIn: string; checkOut: string } | null;
}

/**
 * Authoritative balance: SUM over the ledger, never a stored counter.
 *
 * Nights are the only quantity the ledger moves. `remaining.days` is derived
 * from them by the API (nights + 1) and describes one continuous stay, so it is
 * a label, not a second budget — credits and debits therefore carry no days.
 */
interface Balance {
  remaining: { nights: number; days: number };
  credited: { nights: number };
  debited: { nights: number };
  breakdown: { type: string; entries: number; nights: number }[];
}

const LEDGER_BADGE: Record<string, string> = {
  ALLOCATION: 'badge-green',
  BOOKING_USAGE: 'badge-red',
  CANCELLATION: 'badge-green',
  ADJUSTMENT: 'badge-blue',
  EXPIRY: 'badge-yellow',
};

/**
 * CLIENT_CLARIFICATION_REQUIRED (Spec 22 #5): the confirmed list of payment
 * methods has not been supplied. These are placeholders for Indian operations.
 */
const PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Cheque',
  'Card',
  'Razorpay',
];

interface Membership {
  id: string;
  startDate: string;
  endDate: string | null;
  status: string;
  package: {
    id: string;
    name: string;
    price: number;
    days: number;
    nights: number;
    validityMonths: number;
  } | null;
}

/** Active plans available to sell, from the catalog. */
interface Plan {
  id: string;
  name: string;
  price: number;
  days: number;
  nights: number;
  validityMonths: number;
}

interface CustomerDetail {
  id: string;
  membershipId: string | null;
  name: string;
  phone: string;
  email: string | null;
  plan: string;
  amount: number;
  amountPaid: number;
  pendingAmount: number;
  validity: string | null;
  totalDays: number;
  totalNights: number;
  status: string;
  createdAt: string;
  assignedExec: {
    id: string;
    name: string;
    email: string;
    manager: { id: string; name: string; email: string } | null;
  } | null;
  payments: Payment[];
  bookings: Booking[];
  refunds: Refund[];
  memberships: Membership[];
  _count: {
    payments: number;
    bookings: number;
    refunds: number;
    memberships: number;
  };
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green',
  PENDING: 'badge-yellow',
  CANCELLED: 'badge-red',
  EXPIRED: 'badge-red',
  CONFIRMED: 'badge-green',
  COMPLETED: 'badge-green',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Membership actions
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showSell, setShowSell] = useState(false);
  const [sellForm, setSellForm] = useState({ packageId: '', startDate: '' });
  const [sellError, setSellError] = useState('');
  const [selling, setSelling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Payments
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: '',
    method: '',
    date: '',
    membershipId: '',
    notes: '',
  });
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  // Refunds
  const [showRefund, setShowRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({
    amount: '',
    date: '',
    membershipId: '',
    reason: '',
  });
  const [refundError, setRefundError] = useState('');
  const [refunding, setRefunding] = useState(false);

  // Entitlement balance + ledger
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  // Bookings
  const [showBooking, setShowBooking] = useState(false);
  const [bookForm, setBookForm] = useState({
    membershipId: '',
    checkIn: '',
    checkOut: '',
    notes: '',
  });
  const [bookError, setBookError] = useState('');
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      setCustomer(await fetchApi(`/customers/${id}`));
    } catch (err: any) {
      setError(err.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** Only active plans can be sold, so only those are offered. */
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetchApi('/packages?isActive=true&limit=200');
      setPlans(res.data);
    } catch {
      setPlans([]);
    }
  }, []);

  /** Balance and ledger come from the API, not from adding up bookings. */
  const loadEntitlement = useCallback(async () => {
    if (!id) return;
    try {
      const [b, l] = await Promise.all([
        fetchApi(`/entitlements/balance?customerId=${id}`),
        fetchApi(`/entitlements?customerId=${id}&limit=50`),
      ]);
      setBalance(b);
      setLedger(l.data);
    } catch {
      setBalance(null);
      setLedger([]);
    }
  }, [id]);

  useEffect(() => {
    void load();
    void loadPlans();
    void loadEntitlement();
  }, [load, loadPlans, loadEntitlement]);

  /** Anything that moves entitlement must refresh both the record and the ledger. */
  const reloadAll = async () => {
    await Promise.all([load(), loadEntitlement()]);
  };

  const openSell = () => {
    setSellError('');
    setSellForm({ packageId: '', startDate: '' });
    setShowSell(true);
  };

  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSelling(true);
    setSellError('');
    try {
      const body: Record<string, unknown> = {
        customerId: id,
        packageId: sellForm.packageId,
      };
      // Omitted means "today"; the API derives the end date from the plan.
      if (sellForm.startDate) {
        body.startDate = new Date(sellForm.startDate).toISOString();
      }
      await fetchApi('/memberships', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setShowSell(false);
      await reloadAll();
    } catch (err: any) {
      setSellError(err.message || 'Failed to add membership');
    } finally {
      setSelling(false);
    }
  };

  // Needed inside the handlers, which sit above the loading/error guards.
  const activeMembershipId =
    customer?.memberships.find((m) => m.status === 'ACTIVE')?.id ?? null;

  const openPayment = () => {
    setPayError('');
    setPayForm({
      amount: '',
      method: '',
      date: '',
      // Default to the active membership so the money lands on the right plan.
      membershipId: activeMembershipId ?? '',
      notes: '',
    });
    setShowPayment(true);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setPaying(true);
    setPayError('');
    try {
      const body: Record<string, unknown> = {
        customerId: id,
        amount: Number(payForm.amount),
      };
      if (payForm.method) body.method = payForm.method;
      if (payForm.notes) body.notes = payForm.notes;
      if (payForm.membershipId) body.membershipId = payForm.membershipId;
      if (payForm.date) body.date = new Date(payForm.date).toISOString();

      await fetchApi('/payments', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setShowPayment(false);
      await load();
    } catch (err: any) {
      setPayError(err.message || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const openRefund = () => {
    setRefundError('');
    setRefundForm({
      amount: '',
      date: '',
      membershipId: activeMembershipId ?? '',
      reason: '',
    });
    setShowRefund(true);
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setRefunding(true);
    setRefundError('');
    try {
      const body: Record<string, unknown> = {
        customerId: id,
        amount: Number(refundForm.amount),
        reason: refundForm.reason,
      };
      if (refundForm.membershipId) body.membershipId = refundForm.membershipId;
      if (refundForm.date) body.date = new Date(refundForm.date).toISOString();

      await fetchApi('/refunds', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setShowRefund(false);
      await load();
    } catch (err: any) {
      setRefundError(err.message || 'Failed to record refund');
    } finally {
      setRefunding(false);
    }
  };

  const openBooking = () => {
    setBookError('');
    setBookForm({
      membershipId: activeMembershipId ?? '',
      checkIn: '',
      checkOut: '',
      notes: '',
    });
    setShowBooking(true);
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setBooking(true);
    setBookError('');
    try {
      await fetchApi('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          customerId: id,
          membershipId: bookForm.membershipId,
          checkIn: new Date(bookForm.checkIn).toISOString(),
          checkOut: new Date(bookForm.checkOut).toISOString(),
          ...(bookForm.notes ? { notes: bookForm.notes } : {}),
        }),
      });
      setShowBooking(false);
      await reloadAll();
    } catch (err: any) {
      setBookError(err.message || 'Failed to create booking');
    } finally {
      setBooking(false);
    }
  };

  /** Cancelling returns entitlement; completing does not move the ledger. */
  const bookingAction = async (
    bookingId: string,
    action: 'cancel' | 'complete',
  ) => {
    setBusyId(bookingId);
    setActionError('');
    try {
      await fetchApi(`/bookings/${bookingId}/${action}`, { method: 'PATCH' });
      await reloadAll();
    } catch (err: any) {
      setActionError(err.message || `Failed to ${action} booking`);
    } finally {
      setBusyId(null);
    }
  };

  /** Deleting a payment reverses the customer's running totals server-side. */
  const removeEntry = async (kind: 'payments' | 'refunds', entryId: string) => {
    setBusyId(entryId);
    setActionError('');
    try {
      await fetchApi(`/${kind}/${entryId}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setActionError(err.message || `Failed to delete ${kind.slice(0, -1)}`);
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (
    membershipId: string,
    action: 'cancel' | 'expire',
  ) => {
    setBusyId(membershipId);
    setActionError('');
    try {
      await fetchApi(`/memberships/${membershipId}/${action}`, {
        method: 'PATCH',
      });
      await reloadAll();
    } catch (err: any) {
      setActionError(err.message || `Failed to ${action} membership`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="detail-loading">Loading customer...</div>;
  }

  if (error || !customer) {
    return (
      <div className="customer-detail">
        <button className="btn-outline" onClick={() => navigate('/customers')}>
          <ArrowLeft size={14} /> Back to customers
        </button>
        <div className="modal-error" style={{ marginTop: 16 }}>
          {error || 'Customer not found'}
        </div>
        <p className="detail-hint">
          If this record belongs to another Executive or team, it is out of your
          scope and will not be visible.
        </p>
      </div>
    );
  }

  const paidPercent =
    customer.amount > 0
      ? Math.min(Math.round((customer.amountPaid / customer.amount) * 100), 100)
      : 0;

  // The bar clamps at 100%, so on its own it reports "100% collected" for an
  // overpayment just as happily as for an exact settlement. Surface the excess
  // instead of hiding it behind a full bar.
  const overpaid = Math.max(customer.amountPaid - customer.amount, 0);

  // Usage is no longer summed from bookings: the ledger is authoritative, and
  // adding up booking rows would miss adjustments and expiry closures.

  // One active membership at a time, so its presence decides whether a new
  // plan can be recorded (see CLIENT_CLARIFICATION_REQUIRED #11).
  const activeMembership =
    customer.memberships.find((m) => m.status === 'ACTIVE') ?? null;

  const paymentsSum = customer.payments.reduce((s, p) => s + p.amount, 0);
  const refundsSum = customer.refunds.reduce((s, r) => s + r.amount, 0);
  // Mirrors the API rule: nothing beyond what was received, less what has
  // already gone back.
  const refundable = Math.max(customer.amountPaid - refundsSum, 0);

  // Money leaving the business is Manager/Super Admin only (Spec 22 #3
  // unconfirmed); deleting a financial row is Super Admin only.
  /** Mirrors the API: nights = date gap, days = nights + 1. */
  const bookingCost = (() => {
    if (!bookForm.checkIn || !bookForm.checkOut) return null;
    const inD = new Date(bookForm.checkIn);
    const outD = new Date(bookForm.checkOut);
    const nights = Math.round((outD.getTime() - inD.getTime()) / 86400000);
    if (!Number.isFinite(nights) || nights <= 0) return null;
    return { nights, days: nights + 1 };
  })();

  const canRefund = hasRole('SUPER_ADMIN', 'MANAGER');
  const canDelete = hasRole('SUPER_ADMIN');

  return (
    <div className="customer-detail">
      <Link to="/customers" className="back-link">
        <ArrowLeft size={16} /> Back to customers
      </Link>

      {/* Identity header */}
      <div className="detail-header">
        <div className="detail-identity">
          <div className="detail-avatar">{customer.name.charAt(0)}</div>
          <div>
            <h1>
              {customer.name}
              <span
                className={`status-badge ${STATUS_BADGE[customer.status] || ''}`}
              >
                {customer.status}
              </span>
            </h1>
            <div className="detail-contact">
              <span><Phone size={13} /> {customer.phone}</span>
              {customer.email && <span><Mail size={13} /> {customer.email}</span>}
              {customer.membershipId && (
                <span title="Membership ID — a reference label, not the plan">
                  <BadgeCheck size={13} /> ID {customer.membershipId}
                </span>
              )}
              <span><CalendarClock size={13} /> Added {date(customer.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        {/* Plan & financials */}
        <section className="detail-card">
          <h2><Wallet size={16} /> Plan & Payment</h2>
          <dl className="detail-list">
            <div><dt>Plan</dt><dd>{customer.plan}</dd></div>
            <div><dt>Validity</dt><dd>{customer.validity || '—'}</dd></div>
            <div><dt>Total amount</dt><dd>{money(customer.amount)}</dd></div>
            <div><dt>Amount paid</dt><dd className="pos">{money(customer.amountPaid)}</dd></div>
            <div><dt>Pending</dt><dd className="neg">{money(customer.pendingAmount)}</dd></div>
          </dl>
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${paidPercent}%` }} />
            </div>
            <small>
              {paidPercent}% collected
              {overpaid > 0 && (
                <span className="overpaid-note">
                  {' '}· overpaid by {money(overpaid)}
                </span>
              )}
            </small>
          </div>
        </section>

        {/* Ownership */}
        <section className="detail-card">
          <h2><UserCircle2 size={16} /> Ownership</h2>
          {customer.assignedExec ? (
            <dl className="detail-list">
              <div><dt>Executive</dt><dd>{customer.assignedExec.name}</dd></div>
              <div><dt>Email</dt><dd>{customer.assignedExec.email}</dd></div>
              <div>
                <dt>Manager</dt>
                <dd>{customer.assignedExec.manager?.name ?? 'Unassigned'}</dd>
              </div>
            </dl>
          ) : (
            <p className="detail-hint">
              No Executive assigned. This customer is visible to Super Admins
              only — assign an owner so their team can work on it.
            </p>
          )}
        </section>

        {/* Entitlement — figures come from the ledger, not a stored counter */}
        <section className="detail-card">
          <h2><Sun size={16} /> Entitlement</h2>
          {balance ? (
            <>
              <div className="balance-row">
                <div className="balance-tile balance-tile-primary">
                  <span className="balance-value">{balance.remaining.nights}</span>
                  <span className="balance-label">
                    <Moon size={12} /> nights left
                  </span>
                </div>
                {/*
                  Deliberately secondary. Days are what the nights are worth as
                  one continuous stay — the client's "3 Nights / 4 Days" wording
                  — not a separate allowance being spent alongside them.
                */}
                <div className="balance-tile balance-tile-derived">
                  <span className="balance-value">{balance.remaining.days}</span>
                  <span className="balance-label">
                    <Sun size={12} /> days in one stay
                  </span>
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Credited (allocations, returns)</dt>
                  <dd className="pos">+{balance.credited.nights} nights</dd>
                </div>
                <div>
                  <dt>Debited (stays, expiry)</dt>
                  <dd className="neg">−{balance.debited.nights} nights</dd>
                </div>
              </dl>
              <p className="detail-hint">
                Nights are the balance, and it is the sum of every ledger
                movement below — there is no stored "remaining" figure to drift
                out of step. Days are only how those nights read as a single
                stay, so splitting a holiday never costs extra.
              </p>
            </>
          ) : (
            <p className="detail-hint">
              No entitlement yet. Recording a membership allocates the plan's
              days and nights into the ledger.
            </p>
          )}
        </section>
      </div>

      {/* Memberships — the customer's purchase history */}
      <section className="detail-card">
        <div className="card-head">
          {/* Named "plan purchases" on screen to keep it distinct from the
              customer's Membership ID, which is only a reference label. */}
          <h2>Memberships — plan purchases ({customer._count.memberships})</h2>
          {activeMembership ? (
            <span className="head-note">
              Active until{' '}
              {activeMembership.endDate ? date(activeMembership.endDate) : '—'}
            </span>
          ) : (
            <button className="btn-primary btn-sm" onClick={openSell}>
              <Plus size={15} /> Add Membership
            </button>
          )}
        </div>

        {actionError && <div className="modal-error">{actionError}</div>}

        {customer.memberships.length === 0 ? (
          <p className="detail-hint warn">
            <strong>Start here.</strong> No membership recorded yet. Adding one
            sets the plan, its real start and end dates, and allocates the
            days/nights this customer can spend — nothing else on this page
            works until it exists.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days / Nights</th>
                  <th>Status</th>
                  <th className="col-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customer.memberships.map((m) => {
                  const expired =
                    m.status === 'ACTIVE' &&
                    m.endDate != null &&
                    new Date(m.endDate) < new Date();
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.package?.name ?? '—'}</strong>
                      </td>
                      <td>{date(m.startDate)}</td>
                      <td>
                        {m.endDate ? date(m.endDate) : '—'}
                        {expired && (
                          <span className="status-badge badge-yellow inline-tag">
                            past end date
                          </span>
                        )}
                      </td>
                      <td>
                        {m.package
                          ? `${m.package.days} / ${m.package.nights}`
                          : '—'}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${STATUS_BADGE[m.status] || ''}`}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="col-right">
                        {m.status === 'ACTIVE' ? (
                          <div className="row-actions">
                            <button
                              className="btn-outline btn-sm"
                              disabled={busyId === m.id}
                              onClick={() => changeStatus(m.id, 'expire')}
                              title="Close this membership as completed, freeing the customer to buy again"
                            >
                              Expire
                            </button>
                            <button
                              className="btn-outline btn-sm"
                              disabled={busyId === m.id}
                              onClick={() => changeStatus(m.id, 'cancel')}
                              title="End this membership early"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="muted-dash">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeMembership && (
          <p className="detail-hint">
            A customer holds one active membership at a time. Expire or cancel
            this one to record a new plan.
          </p>
        )}
      </section>

      {/* Sell a membership */}
      {showSell && (
        <div className="modal-overlay" onClick={() => setShowSell(false)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Add Membership</h3>
              <button className="modal-close" onClick={() => setShowSell(false)}>
                <X size={20} />
              </button>
            </div>

            {sellError && <div className="modal-error">{sellError}</div>}

            <form onSubmit={handleSell} className="modal-form">
              <p className="confirm-text">
                Recording a plan purchase for <strong>{customer.name}</strong>.
              </p>

              <div className="form-group">
                <label>Plan *</label>
                <select
                  required
                  value={sellForm.packageId}
                  onChange={(e) =>
                    setSellForm({ ...sellForm, packageId: e.target.value })
                  }
                >
                  <option value="">
                    {plans.length === 0 ? 'No active plans defined' : 'Select a plan'}
                  </option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {money(p.price)} · {p.days}d/{p.nights}n ·{' '}
                      {p.validityMonths} months
                    </option>
                  ))}
                </select>
                {plans.length === 0 && (
                  <small className="field-warning">
                    Add an active plan under Plans first.
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>Start date</label>
                <input
                  type="date"
                  value={sellForm.startDate}
                  onChange={(e) =>
                    setSellForm({ ...sellForm, startDate: e.target.value })
                  }
                />
                <small className="field-note">
                  Leave blank for today. The end date is calculated from the
                  plan's validity.
                </small>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowSell(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={selling || !sellForm.packageId}
                >
                  {selling ? 'Saving...' : 'Add Membership'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payments */}
      <section className="detail-card">
        <div className="card-head">
          <h2>Payment history ({customer._count.payments})</h2>
          <button className="btn-primary btn-sm" onClick={openPayment}>
            <Plus size={15} /> Record Payment
          </button>
        </div>

        {customer.payments.length === 0 ? (
          <p className="detail-hint">
            No individual payments recorded yet. The paid total above came from
            the customer record — recording payments here builds the history and
            keeps that total in step automatically.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>For plan</th>
                  <th>Notes</th>
                  {canDelete && <th className="col-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {customer.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.date)}</td>
                    <td className="amount-in">{money(p.amount)}</td>
                    <td>{p.method ?? '—'}</td>
                    <td>{p.membership?.package?.name ?? '—'}</td>
                    <td>{p.notes ?? '—'}</td>
                    {canDelete && (
                      <td className="col-right">
                        <button
                          className="icon-action danger"
                          title="Delete this payment (reverses the running total)"
                          disabled={busyId === p.id}
                          onClick={() => removeEntry('payments', p.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paymentsSum !== customer.amountPaid && (
          <p className="detail-hint warn">
            Recorded payments total {money(paymentsSum)} but the customer record
            shows {money(customer.amountPaid)} paid. New records cannot drift
            like this — every rupee entered as “Amount paid” now creates a row
            here. A gap means this customer predates that rule, so treat the
            rows below as the reliable figure.
          </p>
        )}
      </section>

      {/* Bookings */}
      <section className="detail-card">
        <div className="card-head">
          <h2>Bookings ({customer._count.bookings})</h2>
          <button
            className="btn-primary btn-sm"
            onClick={openBooking}
            disabled={!activeMembership}
            title={
              activeMembership
                ? 'Record a holiday stay against the active membership'
                : 'An active membership is required before booking'
            }
          >
            <CalendarPlus size={15} /> New Booking
          </button>
        </div>

        {/*
          A disabled button with only a tooltip leaves the user guessing. State
          the prerequisite on screen: a customer has nothing to book until a
          membership has allocated days and nights to them.
        */}
        {customer.bookings.length === 0 ? (
          !activeMembership ? (
            <p className="detail-hint warn">
              <strong>Add a membership first.</strong> Booking spends days and
              nights, and this customer has none yet — a membership is what
              allocates them. Use <strong>Add Membership</strong> above, then
              this button turns on.
            </p>
          ) : (
            <p className="detail-hint">
              No stays recorded. Booking deducts days and nights from the
              balance above through the ledger.
            </p>
          )
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Days</th>
                  <th>Nights</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th className="col-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customer.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{date(b.checkIn)}</td>
                    <td>{date(b.checkOut)}</td>
                    <td>{b.daysUsed}</td>
                    <td>{b.nightsUsed}</td>
                    <td>
                      <span className={`status-badge ${STATUS_BADGE[b.status] || ''}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>{b.notes ?? '—'}</td>
                    <td className="col-right">
                      {b.status === 'CONFIRMED' ? (
                        <div className="row-actions">
                          <button
                            className="btn-outline btn-sm"
                            disabled={busyId === b.id}
                            onClick={() => bookingAction(b.id, 'complete')}
                            title="Mark the stay as taken (no entitlement change)"
                          >
                            Complete
                          </button>
                          <button
                            className="btn-outline btn-sm"
                            disabled={busyId === b.id}
                            onClick={() => bookingAction(b.id, 'cancel')}
                            title="Cancel and return the days/nights"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="muted-dash">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Entitlement ledger — the auditable history Spec 7 requires */}
      <section className="detail-card">
        <div className="card-head">
          <h2>Entitlement ledger ({ledger.length})</h2>
          <span className="head-note">Append-only · never edited or deleted</span>
        </div>

        {ledger.length === 0 ? (
          <p className="detail-hint">
            No movements yet. Nothing is entered here by hand — rows appear
            automatically when a membership allocates nights, a booking spends
            them, a cancellation returns them, an admin adjusts them, or a
            membership expires.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Movement</th>
                  <th>Nights</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id}>
                    <td>{date(l.date)}</td>
                    <td>
                      <span className={`status-badge ${LEDGER_BADGE[l.type] || ''}`}>
                        {l.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={l.nights >= 0 ? 'amount-in' : 'amount-out'}>
                      {l.nights > 0 ? '+' : ''}{l.nights}
                    </td>
                    <td>{l.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* New booking */}
      {showBooking && (
        <div className="modal-overlay" onClick={() => setShowBooking(false)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>New Booking</h3>
              <button
                className="modal-close"
                onClick={() => setShowBooking(false)}
              >
                <X size={20} />
              </button>
            </div>

            {bookError && <div className="modal-error">{bookError}</div>}

            <form onSubmit={handleBooking} className="modal-form">
              <p className="confirm-text">
                <strong>{balance?.remaining.nights ?? 0} nights</strong>{' '}
                available.
              </p>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Check in *</label>
                  <input
                    type="date"
                    required
                    value={bookForm.checkIn}
                    onChange={(e) =>
                      setBookForm({ ...bookForm, checkIn: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Check out *</label>
                  <input
                    type="date"
                    required
                    value={bookForm.checkOut}
                    onChange={(e) =>
                      setBookForm({ ...bookForm, checkOut: e.target.value })
                    }
                  />
                </div>
              </div>

              {bookingCost && (
                <p
                  className={`detail-hint ${
                    balance && bookingCost.nights > balance.remaining.nights
                      ? 'warn'
                      : ''
                  }`}
                >
                  This stay costs <strong>{bookingCost.nights} nights</strong>{' '}
                  and spans {bookingCost.days} calendar days. Only the nights
                  come off the balance.
                </p>
              )}

              <div className="form-group">
                <label>Notes</label>
                <input
                  placeholder="e.g. Goa resort, family of 4"
                  value={bookForm.notes}
                  onChange={(e) =>
                    setBookForm({ ...bookForm, notes: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowBooking(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={booking || !bookForm.checkIn || !bookForm.checkOut}
                >
                  {booking ? 'Saving...' : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refunds */}
      <section className="detail-card">
        <div className="card-head">
          <h2>Refunds ({customer._count.refunds})</h2>
          {canRefund && (
            <button
              className="btn-outline btn-sm"
              onClick={openRefund}
              disabled={refundable <= 0}
              title={
                refundable > 0
                  ? `Up to ${money(refundable)} can be refunded`
                  : 'Nothing left to refund — no payment received, or it has all been returned'
              }
            >
              <Undo2 size={15} /> Record Refund
            </button>
          )}
        </div>

        {customer.refunds.length === 0 ? (
          <p className="detail-hint">
            No refunds recorded.
            {canRefund
              ? ` Up to ${money(refundable)} could be refunded against what this customer has paid.`
              : ' Refunds are recorded by a Manager or Super Admin.'}
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>For plan</th>
                  <th>Approved by</th>
                  {canDelete && <th className="col-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {customer.refunds.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.date)}</td>
                    <td className="amount-out">−{money(r.amount)}</td>
                    <td>{r.reason ?? '—'}</td>
                    <td>{r.membership?.package?.name ?? '—'}</td>
                    <td>{r.approvedBy?.name ?? '—'}</td>
                    {canDelete && (
                      <td className="col-right">
                        <button
                          className="icon-action danger"
                          title="Delete this refund record"
                          disabled={busyId === r.id}
                          onClick={() => removeEntry('refunds', r.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {refundsSum > 0 && (
          <p className="detail-hint">
            Total refunded: <strong>{money(refundsSum)}</strong> of{' '}
            {money(customer.amountPaid)} received. Refunds are reported
            separately and do not reduce the paid or pending figures above —
            whether they should is awaiting client confirmation.
          </p>
        )}
      </section>

      {/* Record a payment */}
      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Record Payment</h3>
              <button
                className="modal-close"
                onClick={() => setShowPayment(false)}
              >
                <X size={20} />
              </button>
            </div>

            {payError && <div className="modal-error">{payError}</div>}

            <form onSubmit={handlePayment} className="modal-form">
              <p className="confirm-text">
                <strong>{customer.name}</strong> — {money(customer.pendingAmount)}{' '}
                currently pending of {money(customer.amount)}.
              </p>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="0.01"
                    placeholder="e.g. 30000"
                    value={payForm.amount}
                    onChange={(e) =>
                      setPayForm({ ...payForm, amount: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Method</label>
                  <select
                    value={payForm.method}
                    onChange={(e) =>
                      setPayForm({ ...payForm, method: e.target.value })
                    }
                  >
                    <option value="">Not specified</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={payForm.date}
                    onChange={(e) =>
                      setPayForm({ ...payForm, date: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Against plan</label>
                  <select
                    value={payForm.membershipId}
                    onChange={(e) =>
                      setPayForm({ ...payForm, membershipId: e.target.value })
                    }
                  >
                    <option value="">Not linked</option>
                    {customer.memberships.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.package?.name ?? 'Plan'} ({m.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <input
                  placeholder="e.g. cheque no. 004321"
                  value={payForm.notes}
                  onChange={(e) =>
                    setPayForm({ ...payForm, notes: e.target.value })
                  }
                />
              </div>

              <p className="detail-hint">
                The amount cannot be edited afterwards — payment history is
                never overwritten. A wrong entry is deleted and re-recorded.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowPayment(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={paying || !payForm.amount}
                >
                  {paying ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record a refund */}
      {showRefund && (
        <div className="modal-overlay" onClick={() => setShowRefund(false)}>
          <div
            className="modal-content modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Record Refund</h3>
              <button
                className="modal-close"
                onClick={() => setShowRefund(false)}
              >
                <X size={20} />
              </button>
            </div>

            {refundError && <div className="modal-error">{refundError}</div>}

            <form onSubmit={handleRefund} className="modal-form">
              <p className="confirm-text">
                Returning money to <strong>{customer.name}</strong>. Up to{' '}
                <strong>{money(refundable)}</strong> can be refunded.
              </p>

              <div className="form-grid-2">
                <div className="form-group">
                  <label>Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="0.01"
                    max={refundable}
                    placeholder="e.g. 10000"
                    value={refundForm.amount}
                    onChange={(e) =>
                      setRefundForm({ ...refundForm, amount: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={refundForm.date}
                    onChange={(e) =>
                      setRefundForm({ ...refundForm, date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Against plan</label>
                <select
                  value={refundForm.membershipId}
                  onChange={(e) =>
                    setRefundForm({
                      ...refundForm,
                      membershipId: e.target.value,
                    })
                  }
                >
                  <option value="">Not linked</option>
                  {customer.memberships.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.package?.name ?? 'Plan'} ({m.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Reason *</label>
                <input
                  required
                  placeholder="e.g. plan downgrade, cancellation"
                  value={refundForm.reason}
                  onChange={(e) =>
                    setRefundForm({ ...refundForm, reason: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowRefund(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={refunding || !refundForm.amount || !refundForm.reason}
                >
                  {refunding ? 'Saving...' : 'Record Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
