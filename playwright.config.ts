// Pruebas de extremo a extremo en Chromium contra el simulador local.
// Requiere DATABASE_URL_ADMIN (PostgreSQL desechable). Uso: npm run test:e2e
import { defineConfig, devices } from '@playwright/test';
import { CLAVE_ANON } from './herramientas/simulador/jwt.mjs';

const SIMULADOR = 'http://localhost:54321';
const WEB = 'http://localhost:4173';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/informe' }]],
  outputDir: 'tests/e2e/resultados',
  use: {
    baseURL: WEB,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, grepInvert: /@movil/ },
    { name: 'movil', use: { ...devices['Pixel 7'] }, grep: /@movil/ },
  ],
  webServer: [
    {
      command: 'node tests/e2e/simulador.mjs',
      url: `${SIMULADOR}/__pruebas/olvidar-limites`,
      reuseExistingServer: false,
      env: { URL_SITIO: WEB, DATABASE_URL_ADMIN: process.env.DATABASE_URL_ADMIN ?? '' },
      stdout: 'pipe',
    },
    {
      command: 'vite build --outDir dist-e2e --emptyOutDir && vite preview --outDir dist-e2e --port 4173 --strictPort',
      url: WEB,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_SUPABASE_URL: SIMULADOR,
        VITE_SUPABASE_PUBLISHABLE_KEY: CLAVE_ANON,
        VITE_RESPONSABLE_TRATAMIENTO: 'Organización de pruebas',
        VITE_CONTACTO_PRIVACIDAD: 'privacidad@ejemplo.test',
        CSP_SUPABASE_LOCAL: SIMULADOR,
      },
    },
  ],
});
