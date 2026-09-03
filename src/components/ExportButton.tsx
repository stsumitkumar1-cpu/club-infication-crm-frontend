import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api'
).replace(/\/+$/, '');

const TOKEN_KEY = 'crm_token';

interface Props {
  /** API path, relative to the base — e.g. "/exports/customers". */
  path: string;
  label?: string;
}

/**
 * Downloads an xlsx from the API.
 *
 * Not routed through fetchApi: that helper parses every response as JSON, which
 * would corrupt a binary body. This calls fetch directly and keeps the two
 * things fetchApi is actually needed for — the bearer token, and reporting an
 * unreachable server as such rather than as a failed download.
 *
 * The filename comes from the server's Content-Disposition header rather than
 * being guessed here, so the date stamp in it is the server's.
 */
export default function ExportButton({ path, label = 'Export to Excel' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
    } catch {
      setError('Cannot reach the server.');
      setBusy(false);
      return;
    }

    if (!res.ok) {
      /*
       * An error body IS json even though the success body is not, so read it
       * for the API's own message — "Forbidden resource" is more use than
       * "download failed".
       */
      const payload = await res.json().catch(() => null);
      setError(
        payload?.message ??
          (res.status === 403
            ? 'You do not have permission to export.'
            : `Export failed (${res.status}).`),
      );
      setBusy(false);
      return;
    }

    const rows = res.headers.get('X-Export-Rows');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const named = disposition.match(/filename="([^"]+)"/)?.[1];

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = named ?? 'export.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Released immediately: the browser has already taken the blob.
    URL.revokeObjectURL(url);

    setBusy(false);
    if (rows === '0') {
      setError('There was nothing to export.');
    }
  };

  return (
    <span className="export-button-wrap">
      <button
        className="btn-outline"
        onClick={() => void download()}
        disabled={busy}
        title="Downloads an Excel file laid out like your member sheet"
      >
        {busy ? (
          <Loader2 size={16} className="export-spinner" />
        ) : (
          <Download size={16} />
        )}
        {busy ? 'Preparing…' : label}
      </button>
      {error && <span className="export-error">{error}</span>}
    </span>
  );
}
