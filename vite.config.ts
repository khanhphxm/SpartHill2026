import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app',
  plugins: [react()],
  server: {
    port: 5173,
    // The approval server holds the audit log; the browser never talks to anything else.
    proxy: { '/api': 'http://127.0.0.1:8787' },
    fs: { allow: ['..'] },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
