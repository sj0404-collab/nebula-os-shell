import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [react(), tailwindcss()];
  try {
    // @ts-expect-error optional dev-only helper without type declarations
    const m = await import('./.vite-source-tags.js');
    plugins.push(m.sourceTags());
  } catch { /* optional */ }

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    // /api/opencode → Bun bridge (opencode/bridge.ts) → real `opencode serve`
    server: { host: true, allowedHosts: true as const, proxy: { '/api/opencode': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
    preview: { host: true, allowedHosts: true as const, proxy: { '/api/opencode': { target: 'http://127.0.0.1:8787', changeOrigin: true } } },
  };
})
