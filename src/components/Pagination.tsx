import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

/**
 * Page sizes offered. Display choices, not data: every row, count and page
 * total still comes from the API, which reports in `meta` what it actually
 * returned.
 */
export const PAGE_SIZES = [10, 20, 30, 40, 50];

/** Matches the API's own default, so a first load agrees with the selector. */
export const DEFAULT_PAGE_SIZE = 20;

/** The `meta` block every paginated endpoint in this API returns. */
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Page numbers to show: always the first and last, the current one and its
 * neighbours, and `null` where a run was skipped. Keeps the control a fixed
 * width whether there are 3 pages or 300.
 *
 * Exported so it can be exercised directly — it is the only piece of this
 * component that is logic rather than markup.
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set([1, total, current, current - 1, current + 1]);
  // Keep the run next to whichever end the cursor is at, so the control does
  // not collapse to "1 … 2 3 4 … 20" when the user is near the start.
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) {
    [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));
  }

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}

interface Props {
  /** Straight from the API response. */
  meta: PageMeta;
  /** The size the caller last requested, which may not have landed yet. */
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Disables every control while a request is in flight. */
  loading?: boolean;
  /** Plural noun for the range, e.g. "customers". */
  label?: string;
}

/**
 * The pagination bar shared by every list page.
 *
 * One component rather than a copy per page: the two lists that had their own
 * had already drifted to different markup, and a size selector duplicated per
 * page is a size selector that will eventually behave differently per page.
 */
export default function Pagination({
  meta,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
  label,
}: Props) {
  /*
   * Rendered whenever the API returned anything, not only when there are several
   * pages: at 50 per page a 12-row list is a single page, and hiding the bar
   * would take the size selector away with it — leaving no way back to 10.
   */
  if (meta.total <= 0) {
    return null;
  }

  // Counted from the API's own page and limit, never from the array length —
  // the last page is short and would otherwise be mislabelled.
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="pagination">
      <div className="pagination-size">
        <label htmlFor="page-size">Rows per page</label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={loading}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <span className="pagination-range">
        {first}–{last} of {meta.total}
        {label ? ` ${label}` : ''}
      </span>

      <div className="pagination-pages">
        <button
          disabled={meta.page <= 1 || loading}
          onClick={() => onPageChange(1)}
          title="First page"
          aria-label="First page"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          disabled={meta.page <= 1 || loading}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft size={16} /> Prev
        </button>

        {pageWindow(meta.page, meta.totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="pagination-gap">
              …
            </span>
          ) : (
            <button
              key={p}
              className={p === meta.page ? 'is-current' : ''}
              disabled={loading}
              onClick={() => onPageChange(p)}
              aria-current={p === meta.page ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}

        <button
          disabled={meta.page >= meta.totalPages || loading}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Next <ChevronRight size={16} />
        </button>
        <button
          disabled={meta.page >= meta.totalPages || loading}
          onClick={() => onPageChange(meta.totalPages)}
          title="Last page"
          aria-label="Last page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
