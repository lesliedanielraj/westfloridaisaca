import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { FiltersProvider } from './filters.jsx';
import { TipProvider } from './tooltip.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <FiltersProvider>
        <TipProvider>
          <App />
        </TipProvider>
      </FiltersProvider>
    </AuthProvider>
  </StrictMode>,
);
