import { defineConfig } from 'vitest/config';

// Pruebas de base de datos: requieren DATABASE_URL_ADMIN (PostgreSQL desechable).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/preparar-bd.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
