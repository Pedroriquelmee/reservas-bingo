import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * En las pruebas E2E, `vite preview` sirve la web con las MISMAS cabeceras de
 * seguridad que vercel.json (cambiando solo el dominio de Supabase por el del
 * simulador), para detectar cualquier violación de la CSP antes de desplegar.
 */
function cabecerasDeProduccion(): Record<string, string> | undefined {
  const simulador = process.env.CSP_SUPABASE_LOCAL;
  if (!simulador) return undefined;
  const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  const globales = config.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[];
  return Object.fromEntries(
    globales
      .filter((h) => h.key !== 'Strict-Transport-Security')
      .map((h) => [
        h.key,
        h.key === 'Content-Security-Policy'
          ? h.value
              .replace('https://*.supabase.co wss://*.supabase.co', `${simulador} ${simulador.replace('http', 'ws')}`)
              .replace('; upgrade-insecure-requests', '')
          : h.value,
      ]),
  );
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  preview: { headers: cabecerasDeProduccion() },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
