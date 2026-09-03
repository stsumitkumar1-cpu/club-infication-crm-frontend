import { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { fetchApi } from '../api/fetchApi';
import './ImportButton.css';

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api'
).replace(/\/+$/, '');
const TOKEN_KEY = 'crm_token';

interface Report {
  batchId: string;
  fileName: string;
  sheetsRead: number;
  sheetsSkipped: string[];
  totalRows: number;
  validRows: number;
  blockedRows: number;
  plans: { name: string; sales: number; minPrice: number | null; maxPrice: number | null }[];
  consultants: { key: string; spellings: string[]; sales: number }[];
  stays: { total: number; readable: number; keptAsNotes: number };
  warnings: { field: string; message: string; count: number }[];
  blocked: { sheet: string; rowNumber: number; name: string | null; reasons: string[] }[];
  duplicates: {
    phones: number;
    mafNumbers: { mafNo: string | null; rows: { name: string | null; sheet: string; rowNumber: number }[] }[];
  };
}

interface CommitResult {
  attempted: number;
  imported: number;
  failed: number;
  failures: { rowNumber: number; name: string | null; reason: string }[];
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/**
 * Excel import, in two steps.
 *
 * Upload parses and reports; a second, explicit press writes. That separation
 * is the point — the client's workbook is 29 tabs of 822 rows filled in by hand
 * over two years, and an import creates customers, memberships, payments,
 * entitlement history and user accounts in one action. Whoever presses the
 * second button should have read what it is about to do.
 */
export default function ImportButton({ onImported }: { onImported?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const reset = () => {
    setOpen(false);
    setReport(null);
    setResult(null);
    setError('');
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    setReport(null);
    setResult(null);
    setOpen(true);

    /*
     * Sent with fetch rather than fetchApi: this is multipart, and fetchApi sets
     * a JSON content type on every request. The browser has to set the
     * boundary itself, so no Content-Type is given here at all.
     */
    const body = new FormData();
    body.append('file', file);

    try {
      const res = await fetch(`${BASE_URL}/imports/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
        body,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.message ?? `Upload failed (${res.status}).`);
        return;
      }
      setReport(payload as Report);
    } catch {
      setError('Cannot reach the server.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commit = async () => {
    if (!report) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetchApi(`/imports/${report.batchId}/commit`, {
        method: 'POST',
      });
      setResult(res as CommitResult);
      onImported?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!report) return;
    try {
      await fetchApi(`/imports/${report.batchId}`, { method: 'DELETE' });
    } catch {
      // A batch that cannot be discarded is harmless — it wrote nothing.
    }
    reset();
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <button
        className="btn-outline"
        onClick={() => fileRef.current?.click()}
        title="Read a member sheet and review it before importing"
      >
        <Upload size={16} /> Import from Excel
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => !busy && reset()}>
          <div
            className="modal-content import-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                <FileSpreadsheet size={18} />{' '}
                {result ? 'Import finished' : 'Review before importing'}
              </h3>
              <button className="modal-close" onClick={reset} disabled={busy}>
                <X size={20} />
              </button>
            </div>

            <div className="import-body">
              {busy && !report && (
                <p className="import-status">
                  <Loader2 size={16} className="import-spinner" /> Reading the
                  workbook…
                </p>
              )}

              {error && <div className="modal-error">{error}</div>}

              {/* ---------------------------- the outcome ------------------ */}
              {result && (
                <>
                  <p className="import-success">
                    <CheckCircle2 size={16} /> {result.imported} of{' '}
                    {result.attempted} rows imported
                    {result.failed > 0 && `, ${result.failed} failed`}.
                  </p>
                  {result.failures.length > 0 && (
                    <div className="import-block">
                      <h4>Rows that failed</h4>
                      <ul className="import-list">
                        {result.failures.map((f) => (
                          <li key={f.rowNumber}>
                            <strong>{f.name ?? `Row ${f.rowNumber}`}</strong> —{' '}
                            {f.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* ---------------------------- the report ------------------- */}
              {report && !result && (
                <>
                  <p className="import-file">{report.fileName}</p>

                  <div className="import-tiles">
                    <div className="import-tile">
                      <span className="import-tile-value">{report.totalRows}</span>
                      <span className="import-tile-label">rows found</span>
                    </div>
                    <div className="import-tile is-good">
                      <span className="import-tile-value">{report.validRows}</span>
                      <span className="import-tile-label">will import</span>
                    </div>
                    <div className={`import-tile${report.blockedRows ? ' is-bad' : ''}`}>
                      <span className="import-tile-value">{report.blockedRows}</span>
                      <span className="import-tile-label">blocked</span>
                    </div>
                    <div className="import-tile">
                      <span className="import-tile-value">{report.plans.length}</span>
                      <span className="import-tile-label">plans to create</span>
                    </div>
                  </div>

                  <p className="import-note">
                    Read from {report.sheetsRead} tab
                    {report.sheetsRead === 1 ? '' : 's'}. Nothing has been
                    written yet — the file has only been read and checked.
                  </p>

                  {/* plans */}
                  <details className="import-block" open>
                    <summary>Plans to create ({report.plans.length})</summary>
                    <table className="import-table">
                      <thead>
                        <tr><th>Plan</th><th>Sales</th><th>Price range</th></tr>
                      </thead>
                      <tbody>
                        {report.plans.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td>{p.sales}</td>
                            <td>
                              {p.minPrice === null
                                ? '—'
                                : p.minPrice === p.maxPrice
                                  ? money(p.minPrice)
                                  : `${money(p.minPrice)} – ${money(p.maxPrice!)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="import-note">
                      The sheet records a validity and an annual entitlement
                      rather than plan names, so each combination becomes a plan.
                      The price shown is the range it actually sold for — each
                      member keeps their own.
                    </p>
                  </details>

                  {/* consultants */}
                  <details className="import-block">
                    <summary>
                      Consultants to match ({report.consultants.length})
                    </summary>
                    <table className="import-table">
                      <thead>
                        <tr><th>Written in the sheet as</th><th>Sales</th></tr>
                      </thead>
                      <tbody>
                        {report.consultants.map((c) => (
                          <tr key={c.key}>
                            <td>{c.spellings.join('  ·  ')}</td>
                            <td>{c.sales}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="import-note">
                      Spellings that differ only in case or spacing are treated
                      as one person. Anyone with no CRM account is created as an
                      inactive user, so their past sales stay theirs without
                      giving them a way in.
                    </p>
                  </details>

                  {/* stays */}
                  <details className="import-block">
                    <summary>Stays ({report.stays.total})</summary>
                    <p className="import-note">
                      <strong>{report.stays.readable}</strong> can be read as
                      bookings. <strong>{report.stays.keptAsNotes}</strong> are
                      kept as notes on the membership for your team to enter —
                      those rows pack several stays into one cell and the dates
                      do not line up reliably, so importing them would put wrong
                      numbers into the night balance.
                    </p>
                  </details>

                  {/* warnings */}
                  {report.warnings.length > 0 && (
                    <details className="import-block">
                      <summary>
                        <AlertTriangle size={14} /> Imported with a note (
                        {report.warnings.reduce((s, w) => s + w.count, 0)})
                      </summary>
                      <ul className="import-list">
                        {report.warnings.map((w) => (
                          <li key={w.field + w.message}>
                            <strong>{w.count}×</strong> {w.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* duplicates */}
                  {(report.duplicates.phones > 0 ||
                    report.duplicates.mafNumbers.length > 0) && (
                    <details className="import-block">
                      <summary>
                        Duplicates ({report.duplicates.phones} phone,{' '}
                        {report.duplicates.mafNumbers.length} MAF)
                      </summary>
                      <ul className="import-list">
                        {report.duplicates.mafNumbers.map((d) => (
                          <li key={d.mafNo ?? Math.random()}>
                            <strong>MAF {d.mafNo}</strong> —{' '}
                            {d.rows
                              .map((r) => `${r.name} (${r.sheet} r${r.rowNumber})`)
                              .join('  |  ')}
                          </li>
                        ))}
                      </ul>
                      <p className="import-note">
                        Imported as the sheet has them, as agreed. Correct them
                        in the CRM afterwards.
                      </p>
                    </details>
                  )}

                  {/* blocked */}
                  {report.blocked.length > 0 && (
                    <details className="import-block">
                      <summary>
                        <AlertCircle size={14} /> Blocked rows (
                        {report.blockedRows})
                      </summary>
                      <ul className="import-list">
                        {report.blocked.map((b) => (
                          <li key={`${b.sheet}-${b.rowNumber}`}>
                            <strong>{b.name ?? '(no name)'}</strong>{' '}
                            <em>
                              {b.sheet} r{b.rowNumber}
                            </em>{' '}
                            — {b.reasons.join('; ')}
                          </li>
                        ))}
                      </ul>
                      <p className="import-note">
                        These are skipped. Fix them in the sheet and import
                        again, or enter them by hand.
                      </p>
                    </details>
                  )}
                </>
              )}
            </div>

            <div className="modal-actions">
              {result ? (
                <button className="btn-primary" onClick={reset}>
                  Done
                </button>
              ) : (
                <>
                  <button
                    className="btn-outline"
                    onClick={() => void discard()}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => void commit()}
                    disabled={busy || !report || report.validRows === 0}
                  >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="import-spinner" />{' '}
                        Importing…
                      </>
                    ) : (
                      `Import ${report?.validRows ?? 0} rows`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
