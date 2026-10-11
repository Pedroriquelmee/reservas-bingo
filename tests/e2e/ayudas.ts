import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

const SIMULADOR = 'http://localhost:54321';

function urlBd(): string {
  const u = new URL(process.env.DATABASE_URL_ADMIN ?? '');
  u.pathname = '/bingo_e2e';
  return u.toString();
}

export const pool = new pg.Pool({ connectionString: urlBd(), max: 5 });

export async function sql<T = any>(texto: string, valores: unknown[] = []): Promise<T[]> {
  return (await pool.query(texto, valores)).rows as T[];
}

export async function limpiar(): Promise<void> {
  await sql(`
    truncate public.historial, public.reservas, public.fechas_bingo, public.participantes restart identity cascade;
    delete from auth.users;
    update public.configuracion set generacion_automatica = false, intervalo_dias = 14, fecha_referencia = null, fechas_futuras_minimas = 6;
  `);
  await fetch(`${SIMULADOR}/__pruebas/olvidar-limites`);
}

export async function dia(n: number): Promise<string> {
  const [r] = await sql<{ d: string }>('select (public.hoy_madrid() + $1::int)::text as d', [n]);
  return r.d;
}

/** Crea una fecha en el primer domingo a partir de hoy + n días. */
export async function crearFecha(n: number, extra: { estado?: 'cancelada'; motivo?: string; notas?: string } = {}) {
  const [{ d: fecha }] = await sql<{ d: string }>(
    `select (d + ((7 - extract(isodow from d)::int) % 7))::text as d from (select public.hoy_madrid() + $1::int as d) x`,
    [n],
  );
  const [r] = await sql<{ id: string }>(
    `insert into public.fechas_bingo (fecha, notas, estado, cancelada_en, motivo_cancelacion)
     values ($1, $2, coalesce($3::public.estado_fecha, 'abierta'), case when $3 = 'cancelada' then now() end, $4) returning id`,
    [fecha, extra.notas ?? null, extra.estado ?? null, extra.motivo ?? null],
  );
  return { id: r.id, fecha };
}

/** Usuario con cuenta y perfil, creado directamente en la base de datos. */
export async function crearPersona(nombre: string, apellidos: string, email = `${randomUUID().slice(0, 8)}@prueba.test`, rol: 'participante' | 'admin' = 'participante') {
  const uid = randomUUID();
  await sql('insert into auth.users (id, email) values ($1, $2)', [uid, email]);
  const [p] = await sql<{ id: string }>(
    'insert into public.participantes (user_id, nombre, apellidos, email, rol) values ($1, $2, $3, $4, $5) returning id',
    [uid, nombre, apellidos, email, rol],
  );
  return { uid, id: p.id, email };
}

/** Reserva como lo haría esa persona desde su navegador (misma función y permisos). */
export async function reservarComo(uid: string, fechaId: string) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    const r = await c.query('select public.reservar(p_fecha_id => $1) as r', [fechaId]);
    await c.query('commit');
    return r.rows[0].r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function reservasActivas(fechaId: string): Promise<number> {
  const [r] = await sql<{ n: number }>(`select count(*)::int as n from public.reservas where fecha_id = $1 and estado = 'activa'`, [fechaId]);
  return r.n;
}

export async function correo(email: string): Promise<{ codigo: string; token_hash: string; html: string }> {
  let ultimo: Response | null = null;
  for (let i = 0; i < 20; i++) {
    ultimo = await fetch(`${SIMULADOR}/__pruebas/correo?email=${encodeURIComponent(email)}`);
    if (ultimo.ok) return (await ultimo.json()) as { codigo: string; token_hash: string; html: string };
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No ha llegado ningún correo a ${email} (${ultimo?.status})`);
}

/** Rellena el formulario de acceso que esté visible (página o diálogo). */
export async function completarAcceso(page: Page, email: string) {
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByText('Te hemos enviado un correo')).toBeVisible();
  const { codigo } = await correo(email);
  await page.getByLabel('Código del correo').fill(codigo);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

export async function iniciarSesion(page: Page, email: string) {
  await page.goto('/acceso');
  await completarAcceso(page, email);
  await expect(page.getByRole('link', { name: 'Mis reservas' })).toBeVisible();
}

export function tarjeta(page: Page, textoFecha: string) {
  return page.getByRole('article', { name: textoFecha });
}

/** Mismo formato que la web: "Domingo, 25 de octubre de 2026" */
export function formatoLargo(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(a, m - 1, d));
  return t.charAt(0).toUpperCase() + t.slice(1);
}
