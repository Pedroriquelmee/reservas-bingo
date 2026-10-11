// Dos formas de tener un PostgreSQL real para el simulador:
//  · bdPostgres: un servidor PostgreSQL (pruebas E2E y CI).
//  · bdPglite:   PostgreSQL empaquetado en npm, en memoria (modo demo, sin instalar nada).
// Ambas aplican el "shim" de Supabase y las migraciones reales.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..', '..');

export function archivosSql() {
  const carpeta = join(raiz, 'supabase', 'migrations');
  return [
    join(raiz, 'tests', 'db', 'shim-supabase.sql'),
    ...readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort().map((f) => join(carpeta, f)),
  ].map((ruta) => readFileSync(ruta, 'utf8'));
}

/**
 * Interfaz común:
 *   consulta(sql, params)            → { rows }
 *   transaccion(async (q) => ...)    → q(sql, params) dentro de BEGIN/COMMIT
 */
export async function bdPostgres(urlAdmin, nombre) {
  const { default: pg } = await import('pg');
  const urlBd = new URL(urlAdmin);
  urlBd.pathname = `/${nombre}`;

  const admin = new pg.Client({ connectionString: urlAdmin });
  await admin.connect();
  await admin.query(`drop database if exists ${nombre} with (force)`);
  await admin.query(`create database ${nombre}`);
  await admin.end();

  const inicial = new pg.Client({ connectionString: urlBd.toString() });
  await inicial.connect();
  inicial.on('notice', () => {});
  for (const sql of archivosSql()) await inicial.query(sql);
  await inicial.end();

  const pool = new pg.Pool({ connectionString: urlBd.toString(), max: 20 });
  return {
    consulta: (sql, params = []) => pool.query(sql, params),
    async transaccion(fn) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const r = await fn((sql, params = []) => c.query(sql, params));
        await c.query('commit');
        return r;
      } catch (e) {
        await c.query('rollback').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export async function bdPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  for (const sql of archivosSql()) await db.exec(sql);

  // PGlite tiene una sola conexión: serializamos todo para que las
  // transacciones de peticiones distintas no se mezclen.
  let cola = Promise.resolve();
  const enCola = (fn) => {
    const r = cola.then(fn, fn);
    cola = r.catch(() => {});
    return r;
  };

  return {
    consulta: (sql, params = []) => enCola(() => db.query(sql, params)),
    transaccion: (fn) =>
      enCola(async () => {
        await db.exec('begin');
        try {
          const r = await fn((sql, params = []) => db.query(sql, params));
          await db.exec('commit');
          return r;
        } catch (e) {
          await db.exec('rollback').catch(() => {});
          throw e;
        }
      }),
  };
}
