/// <reference types="vite/client" />

// Supplies the ambient module declarations Vite relies on: side-effect CSS
// imports (`import './index.css'`), static asset imports, and the typing for
// `import.meta.env`. Vite scaffolds this file by default; without it TypeScript
// reports "Cannot find module or type declarations for side-effect import".

/**
 * The app's own environment variables, declared so a typo like
 * `import.meta.env.VITE_API_BSE_URL` is a compile error rather than a silent
 * `undefined` that only shows up as a broken request at runtime.
 *
 * Only VITE_-prefixed values reach the browser, and everything here is inlined
 * into the bundle in plain text — so nothing secret belongs in this interface.
 */
interface ImportMetaEnv {
  /**
   * Prefix for every API call. Same-origin path (`/api`) in development so the
   * dev proxy handles it; an absolute origin in production.
   *
   * Optional: fetchApi falls back to `/api`, which is what makes a missing
   * .env a working default rather than a blank screen.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
