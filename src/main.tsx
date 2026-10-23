import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { SessionProvider } from './auth/session';
import { isConfigured } from './lib/supabase';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? <SessionProvider><App /></SessionProvider> : <App />}
  </StrictMode>,
);
