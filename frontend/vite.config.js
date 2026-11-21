import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the site runs on :5173 and passes /api calls to the backend on :8000.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
});
