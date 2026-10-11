// globalSetup de Vitest: crea una base de datos limpia y aplica
// shim de Supabase + migraciones en orden, exactamente como en producción.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { NOMBRE_BD, urlAdmin, urlPruebas } from './entorno';

const raiz = join(import.meta.dirname, '..', '..');

export default async function preparar() {
  const admin = new pg.Client({ connectionString: urlAdmin() });
  await admin.connect();
  await admin.query(`drop database if exists ${NOMBRE_BD} with (force)`);
  await admin.query(`create database ${NOMBRE_BD}`);
  await admin.end();

  const bd = new pg.Client({ connectionString: urlPruebas() });
  await bd.connect();
  bd.on('notice', () => {});

  const migraciones = readdirSync(join(raiz, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(raiz, 'supabase', 'migrations', f));

  for (const archivo of [join(raiz, 'tests', 'db', 'shim-supabase.sql'), ...migraciones]) {
    await bd.query(readFileSync(archivo, 'utf8'));
  }
  await bd.end();

  return async () => {
    const limpieza = new pg.Client({ connectionString: urlAdmin() });
    await limpieza.connect();
    await limpieza.query(`drop database if exists ${NOMBRE_BD} with (force)`);
    await limpieza.end();
  };
}
