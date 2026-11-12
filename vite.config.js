import { defineConfig, loadEnv } from 'vite';
import { nodeMiddleware } from './server/ai.js';

// Strict CSP is injected for production builds only (dev server needs inline styles for HMR).
// connect-src 'self' is required so the browser can call the same-origin /api/analyze proxy.
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

// Exposes the AI proxy under `npm run dev` and `npm run preview`. Server-only env vars are copied into process.env here
// (non-VITE_ variables are never bundled into frontend code).
const aiProxy = (mode) => ({
  name: 'costlens-ai-proxy',
  config() { const env = loadEnv(mode, process.cwd(), ''); for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k]; },
  configureServer(server) { server.middlewares.use(nodeMiddleware()); },
  configurePreviewServer(server) { server.middlewares.use(nodeMiddleware()); },
});

export default defineConfig(({ command, mode }) => ({
  plugins: [aiProxy(mode), { name: 'strict-csp', transformIndexHtml: (html) => (command === 'build' ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="${csp}" />`) : html) }],
}));
