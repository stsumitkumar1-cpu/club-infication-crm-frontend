import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Package as PackageIcon, Search, UserCircle2, Users, X } from 'lucide-react';
import { fetchApi, ApiError } from '../api/fetchApi';
import './GlobalSearch.css';

type HitType = 'customer' | 'user' | 'plan';

interface SearchHit {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
}

interface SearchGroup {
  type: HitType;
  label: string;
  total: number;
  items: SearchHit[];
}

interface SearchResponse {
  query: string;
  total: number;
  groups: SearchGroup[];
}

/**
 * Where each kind of hit lives. The API deliberately does not return URLs — the
 * route table is the frontend's business — so the mapping is here, in one place.
 */
const ROUTE: Record<HitType, (id: string) => string> = {
  customer: (id) => `/customers/${id}`,
  user: () => '/users',
  plan: () => '/plans',
};

const ICON: Record<HitType, typeof Search> = {
  customer: Users,
  user: UserCircle2,
  plan: PackageIcon,
};

/** Long enough that a word is not searched on every keystroke of it. */
const DEBOUNCE_MS = 300;
const MIN_TERM_LENGTH = 2;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Flattened for keyboard navigation, which does not care about groupings. */
  const flat = useMemo(
    () =>
      (results?.groups ?? []).flatMap((g) =>
        g.items.map((item) => ({ ...item, type: g.type })),
      ),
    [results],
  );

  /*
   * Debounced fetch. The AbortController is what keeps the list honest while
   * someone types: without it a slow request for "jo" can land after the quick
   * one for "john" and overwrite the newer results with staler ones.
   */
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      setResults(null);
      setError('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(() => {
      fetchApi(
        `/search?q=${encodeURIComponent(trimmed)}&limit=5`,
        { signal: controller.signal },
      )
        .then((data: SearchResponse) => {
          setResults(data);
          setError('');
          setActive(0);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setResults(null);
          setError(
            err instanceof ApiError && err.isUnreachable
              ? 'Search is unavailable — the server is not responding.'
              : 'Search failed. Try again.',
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  /* Click outside closes the panel but keeps the term, so a mis-click is cheap. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  /* Ctrl/Cmd+K from anywhere, the shortcut people already expect. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: { type: HitType; id: string }) => {
    setOpen(false);
    setTerm('');
    setResults(null);
    navigate(ROUTE[hit.type](hit.id));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!flat.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = flat[active];
      if (hit) go(hit);
    }
  };

  const clear = () => {
    setTerm('');
    setResults(null);
    setError('');
    inputRef.current?.focus();
  };

  const trimmed = term.trim();
  const showPanel = open && trimmed.length >= MIN_TERM_LENGTH;
  // A running index across groups, so the highlighted row matches `active`.
  let cursor = -1;

  return (
    <div className="global-search" ref={wrapRef}>
      <div className="search-bar">
        <Search size={18} className="search-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search customers, people, plans..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
autoComplete="off"
        />
        {loading && <Loader2 size={15} className="search-spinner" />}
        {!loading && term && (
          <button className="search-clear" onClick={clear} aria-label="Clear search">
            <X size={14} />
          </button>
        )}
        {!term && <kbd className="search-kbd">Ctrl K</kbd>}
      </div>

      {showPanel && (
        <div className="search-panel" id="global-search-results" role="listbox">
          {error ? (
            <p className="search-msg search-msg-error">{error}</p>
          ) : loading && !results ? (
            <p className="search-msg">Searching…</p>
          ) : !flat.length ? (
            <p className="search-msg">
              Nothing matches “{trimmed}”. Names, phone numbers, email,
              membership IDs and plan names are all searchable.
            </p>
          ) : (
            <>
              {results?.groups.map((group) => {
                const Icon = ICON[group.type];
                return (
                  <div className="search-group" key={group.type}>
                    <div className="search-group-head">
                      <span>{group.label}</span>
                      {group.total > group.items.length && (
                        <span className="search-group-more">
                          {group.items.length} of {group.total}
                        </span>
                      )}
                    </div>
                    {group.items.map((item) => {
                      cursor += 1;
                      const index = cursor;
                      return (
                        <button
                          key={`${group.type}-${item.id}`}
                          className={`search-hit${index === active ? ' is-active' : ''}`}
                          // Hover moves the selection so mouse and keyboard
                          // never disagree about what Enter would open.
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go({ type: group.type, id: item.id })}
                          role="option"
                          aria-selected={index === active}
                        >
                          <Icon size={15} className="search-hit-icon" />
                          <span className="search-hit-text">
                            <span className="search-hit-title">{item.title}</span>
                            {item.subtitle && (
                              <span className="search-hit-sub">{item.subtitle}</span>
                            )}
                          </span>
                          {item.badge && (
                            <span className="search-hit-badge">{item.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <p className="search-foot">
                ↑↓ to move · Enter to open · Esc to close
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
