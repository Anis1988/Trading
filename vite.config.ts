import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Env var names that are compiled into the client bundle. Everything listed here becomes PUBLIC.
const KEYS = [
  'NETLIFY_MCP_ENDPOINT',
  'NETLIFY_MCP_API_KEY',
  'EMAILJS_SERVICE_ID',
  'EMAILJS_TEMPLATE_ID',
  'EMAILJS_USER_ID',
  'NEWSAPI_KEY',
  'FORCE_MOCK',
  // Provided automatically by Netlify at build time (used for the deploy status link)
  'SITE_NAME',
  'SITE_ID',
  'CONTEXT',
  'BRANCH',
];

export default defineConfig(({ mode }) => {
  // Netlify exposes env vars via process.env; .env files cover local dev.
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const injected: Record<string, string> = {};
  for (const k of KEYS) injected[k] = process.env[k] ?? fileEnv[k] ?? '';
  return {
    plugins: [react()],
    define: { __APP_ENV__: JSON.stringify(injected) },
    build: { outDir: 'build' },
    test: { environment: 'node' },
  };
});
