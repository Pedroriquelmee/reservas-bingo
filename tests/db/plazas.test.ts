// Plazas por domingo configurables (migración 20261103000100).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Bd, fallaCon, llamar } from './ayudas';
import { crearPool, urlAdmin } from './entorno';

const pool = crearPool(60);
const bd = new Bd(pool);

beforeEach(() => bd.limpiar());
afterAll(() => pool.end());

const plazasActuales = async () =>
  (await bd.sql<{ n: number }>('select plazas_por_fecha as n from public.configuracion'))[0].n;

async function llenar(fechaId: string, n: number, prefijo = 'P') {
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = await bd.crearParticipante(`${prefijo}${String.fromCharCode(65 + i)}`);
    ps.push({ ...p, reserva: await bd.rpc(p.uid, 'reservar', { p_fecha_id: fechaId }) });
  }
  return ps;
}

describe('Plazas por domingo configurables', () => {
  it('el límite es 4 y la web pública puede consultarlo sin sesión', async () => {
    expect(await bd.rpc(null, 'ajustes_publicos')).toEqual({ plazas_por_fecha: 4 });
    const f = await bd.crearFecha(7);
    expect((await bd.rpc(null, 'calendario_publico'))[0].plazas_totales).toBe(4);
    const admin = await bd.crearAdmin();
    expect((await bd.rpc(admin.uid, 'admin_calendario', {}))[0].plazas_totales).toBe(4);
    expect((await bd.rpc(admin.uid, 'admin_obtener_configuracion')).plazas_por_fecha).toBe(4);
    expect(f.id).toBeTruthy();
  });

  it('subir el número reabre al momento los domingos completos', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    await llenar(f.id, 4);
    expect(await bd.estadoFecha(f.id)).toBe('completa');

    const cfg = await bd.rpc(admin.uid, 'admin_cambiar_plazas', { p_plazas: 5 });
    expect(cfg.plazas_por_fecha).toBe(5);
    expect(await bd.estadoFecha(f.id)).toBe('abierta');

    const quinta = await bd.crearParticipante('Quinta');
    expect((await bd.rpc(quinta.uid, 'reservar', { p_fecha_id: f.id })).plaza).toBe(5);
    expect(await bd.estadoFecha(f.id)).toBe('completa');

    const h = await bd.rpc(admin.uid, 'admin_historial', {});
    expect(h.find((e: any) => e.accion === 'plazas_cambiadas').detalles).toEqual({ antes: 4, despues: 5 });
  });

  it('no deja bajar el número si un domingo futuro ya tiene más personas apuntadas', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    await llenar(f.id, 4);

    const e = await fallaCon(bd.rpc(admin.uid, 'admin_cambiar_plazas', { p_plazas: 3 }), 'PLAZAS_INSUFICIENTES');
    expect(e.detail).toBe(`${f.fecha}|4`);
    expect(await plazasActuales()).toBe(4);
    expect(await bd.reservasActivas(f.id)).toBe(4);
  });

  it('los domingos pasados no impiden bajar el número', async () => {
    const admin = await bd.crearAdmin();
    const pasada = await bd.crearFecha(-7);
    for (const n of ['A', 'B', 'C', 'D']) {
      const p = await bd.crearParticipante(`Pasado${n}`);
      await bd.rpc(admin.uid, 'admin_reservar_para', { p_participante_id: p.id, p_fecha_id: pasada.id });
    }
    await bd.rpc(admin.uid, 'admin_cambiar_plazas', { p_plazas: 3 });
    expect(await plazasActuales()).toBe(3);
    expect(await bd.reservasActivas(pasada.id)).toBe(4); // el historial no se toca
  });

  it('al bajar, renumera las plazas para que nadie quede por encima del límite', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    const ps = await llenar(f.id, 4);
    // Se va la persona de la plaza 2: quedan las plazas 1, 3 y 4
    await bd.rpc(ps[1].uid, 'cancelar_mi_reserva', { p_reserva_id: ps[1].reserva.id });

    await bd.rpc(admin.uid, 'admin_cambiar_plazas', { p_plazas: 3 });

    const plazas = await bd.sql<{ plaza: number }>(
      `select plaza from public.reservas where fecha_id = $1 and estado = 'activa' order by plaza`,
      [f.id],
    );
    expect(plazas.map((p) => p.plaza)).toEqual([1, 2, 3]);
    expect(await bd.estadoFecha(f.id)).toBe('completa');
    const otra = await bd.crearParticipante('Otra');
    await fallaCon(bd.rpc(otra.uid, 'reservar', { p_fecha_id: f.id }), 'FECHA_COMPLETA');
  });

  it('valida el número y solo lo puede cambiar un administrador', async () => {
    const admin = await bd.crearAdmin();
    for (const malo of [0, 21, -1, null]) {
      const e = await fallaCon(bd.rpc(admin.uid, 'admin_cambiar_plazas', { p_plazas: malo }), 'DATOS_INVALIDOS');
      expect(e.detail).toBe('plazas');
    }
    const p = await bd.crearParticipante('Pedro');
    await fallaCon(bd.rpc(p.uid, 'admin_cambiar_plazas', { p_plazas: 10 }), 'NO_AUTORIZADO');
    await expect(bd.rpc(null, 'admin_cambiar_plazas', { p_plazas: 10 })).rejects.toThrow(/permission denied/);
    expect(await plazasActuales()).toBe(4);
  });

  it('reservas simultáneas mientras el admin baja de 4 a 3: nunca se supera el límite final ni hay bloqueos (15 rondas)', async () => {
    const admin = await bd.crearAdmin();
    const personas = [];
    for (let i = 0; i < 8; i++) personas.push(await bd.crearParticipante(`Simul${String.fromCharCode(65 + i)}`));

    for (let ronda = 0; ronda < 15; ronda++) {
      await bd.sql('update public.configuracion set plazas_por_fecha = 4');
      const f = await bd.crearFecha(7 + ronda);
      // Ya hay 2 apuntadas; 8 más lo intentan a la vez que el admin baja a 3
      await llenar(f.id, 2, `Ronda${String.fromCharCode(65 + ronda)}`);

      const uids = [admin.uid, ...personas.map((p) => p.uid)];
      const clientes = await Promise.all(uids.map(() => pool.connect()));
      let resultados: { i: number; ok: boolean; error?: string }[];
      try {
        await Promise.all(clientes.map(async (c, i) => { await c.query('begin'); await bd.fijarIdentidad(c, uids[i]); }));
        resultados = await Promise.all(
          clientes.map(async (c, i) => {
            try {
              if (i === 0) await llamar(c, 'admin_cambiar_plazas', { p_plazas: 3 });
              else await llamar(c, 'reservar', { p_fecha_id: f.id });
              await c.query('commit');
              return { i, ok: true };
            } catch (e: any) {
              await c.query('rollback');
              return { i, ok: false, error: e.message };
            }
          }),
        );
      } finally {
        clientes.forEach((c) => c.release());
      }

      // Nadie falla por interbloqueo: solo por plazas
      const errores = new Set(resultados.filter((r) => !r.ok).map((r) => r.error));
      for (const err of errores) expect(['FECHA_COMPLETA', 'PLAZAS_INSUFICIENTES']).toContain(err);

      const limite = await plazasActuales();
      const activas = await bd.reservasActivas(f.id);
      expect(activas).toBeLessThanOrEqual(limite);
      const fueraDeLimite = await bd.sql(
        `select 1 from public.reservas where fecha_id = $1 and estado = 'activa' and plaza > $2`,
        [f.id, limite],
      );
      expect(fueraDeLimite).toHaveLength(0);
      // Si el admin pudo bajar a 3, la fecha tiene como mucho 3; si no, es porque ya había 4
      const admin_ok = resultados[0].ok;
      expect(limite).toBe(admin_ok ? 3 : 4);
      if (!admin_ok) expect(activas).toBe(4);
    }
  });
});

describe('Bloqueo entre reservar y cambiar el número de plazas', () => {
  it('si el admin baja el número mientras una reserva está a medias, espera y cuenta también esa reserva', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    await llenar(f.id, 2);
    const tercera = await bd.crearParticipante('Tercera');

    // 1) Alguien está reservando (la transacción sigue abierta)
    const cr = await pool.connect();
    const ca = await pool.connect();
    try {
      await cr.query('begin');
      await bd.fijarIdentidad(cr, tercera.uid);
      await llamar(cr, 'reservar', { p_fecha_id: f.id });

      // 2) En ese momento el admin intenta bajar a 2
      await ca.query('begin');
      await bd.fijarIdentidad(ca, admin.uid);
      const cambio = llamar(ca, 'admin_cambiar_plazas', { p_plazas: 2 }).then(
        () => 'ok',
        (e: Error) => e.message,
      );
      await new Promise((r) => setTimeout(r, 300));

      // 3) La reserva termina; el admin debe ver 3 personas y no bajar
      await cr.query('commit');
      const resultado = await cambio;
      await ca.query(resultado === 'ok' ? 'commit' : 'rollback');

      expect(resultado).toBe('PLAZAS_INSUFICIENTES');
      expect(await plazasActuales()).toBe(4);
      expect(await bd.reservasActivas(f.id)).toBe(3);
    } finally {
      await cr.query('rollback').catch(() => {});
      await ca.query('rollback').catch(() => {});
      cr.release();
      ca.release();
    }
  });
});

describe('Actualización de una base de datos existente (como en producción)', () => {
  it('aplicar la migración sobre datos reales: pasa a 4 y los domingos con 3 dejan de estar completos', async () => {
    const raiz = join(import.meta.dirname, '..', '..');
    const carpeta = join(raiz, 'supabase', 'migrations');
    const migraciones = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
    const nueva = '20261103000100_plazas_configurables.sql';
    expect(migraciones).toContain(nueva);
    const anteriores = migraciones.filter((m) => m < nueva);

    const admin = new pg.Client({ connectionString: urlAdmin() });
    await admin.connect();
    await admin.query('drop database if exists bingo_migracion with (force)');
    await admin.query('create database bingo_migracion');
    const u = new URL(urlAdmin());
    u.pathname = '/bingo_migracion';
    const c = new pg.Client({ connectionString: u.toString() });
    await c.connect();
    c.on('notice', () => {});
    try {
      await c.query(readFileSync(join(raiz, 'tests', 'db', 'shim-supabase.sql'), 'utf8'));
      for (const m of anteriores) await c.query(readFileSync(join(carpeta, m), 'utf8'));

      // Datos con el esquema antiguo: un domingo completo con 3 personas
      await c.query(`
        insert into auth.users (id, email) select gen_random_uuid(), 'p' || g || '@x.es' from generate_series(1, 3) g;
        insert into public.participantes (user_id, nombre, apellidos, email)
          select id, 'Persona', 'Prueba', email from auth.users;
        insert into public.fechas_bingo (fecha) values (public.hoy_madrid() + 7);
        insert into public.reservas (participante_id, fecha_id, plaza)
          select id, (select id from public.fechas_bingo), row_number() over () from public.participantes;
      `);
      expect((await c.query('select estado from public.fechas_bingo')).rows[0].estado).toBe('completa');

      await c.query(readFileSync(join(carpeta, nueva), 'utf8'));

      expect((await c.query('select estado from public.fechas_bingo')).rows[0].estado).toBe('abierta');
      expect((await c.query('select plazas_por_fecha from public.configuracion')).rows[0].plazas_por_fecha).toBe(4);
      expect((await c.query(`select count(*)::int as n from public.reservas where estado = 'activa'`)).rows[0].n).toBe(3);
      const cal = (await c.query('select public.calendario_publico() as r')).rows[0].r;
      expect(cal[0]).toMatchObject({ plazas_totales: 4, ocupadas: 3, estado: 'abierta' });
    } finally {
      await c.end();
      await admin.query('drop database if exists bingo_migracion with (force)');
      await admin.end();
    }
  });
});
