// Utilidades compartidas por las pruebas de base de datos.
// Necesitan un PostgreSQL desechable (local o el servicio de CI):
//   DATABASE_URL_ADMIN=postgres://postgres:postgres@localhost:5432/postgres
// Las pruebas crean y destruyen su propia base de datos "bingo_test".
import pg from 'pg';

export const NOMBRE_BD = 'bingo_test';

export function urlAdmin(): string {
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) {
    throw new Error('Define DATABASE_URL_ADMIN (PostgreSQL desechable, NUNCA el de producción).');
  }
  return url;
}

export function urlPruebas(): string {
  const u = new URL(urlAdmin());
  u.pathname = `/${NOMBRE_BD}`;
  return u.toString();
}

export function crearPool(max = 40): pg.Pool {
  return new pg.Pool({ connectionString: urlPruebas(), max });
}
