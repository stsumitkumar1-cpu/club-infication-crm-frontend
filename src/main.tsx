import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
// Shared UI primitives (buttons, tables, badges, modals, forms, pagination)
// used by every feature page. Must stay imported here — without it the pages
// render completely unstyled.
import './styles/shared-ui.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
