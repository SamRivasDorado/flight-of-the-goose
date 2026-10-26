import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SessionProvider } from './auth/session';
import { isConfigured, isDemo } from './lib/supabase';
import { DemoBadge } from './demo/DemoBadge';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? <SessionProvider><App /></SessionProvider> : <App />}
    {isDemo && <DemoBadge />}
  </StrictMode>,
);
