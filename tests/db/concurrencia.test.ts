// Prueba obligatoria #9: solicitudes simultáneas nunca superan 3 plazas.
//
// Cada intento abre su propia conexión (como navegadores distintos),
// prepara su transacción y TODOS lanzan "reservar" a la vez. Se repite
// muchas rondas para que la prueba no dependa de la suerte.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { Bd, llamar } from './ayudas';
import { crearPool } from './entorno';

const pool = crearPool(60);
const bd = new Bd(pool);

beforeEach(() => bd.limpiar());
afterAll(() => pool.end());

type Resultado = { ok: true; plaza: number } | { ok: false; error: string };

/** Lanza en paralelo una llamada por usuario, todas a la vez. */
async function enParalelo(uids: string[], funcion: string, args: (i: number) => Record<string, unknown>): Promise<Resultado[]> {
  // 1) Preparar todas las conexiones con su identidad (sin ejecutar nada aún)
  const clientes: pg.PoolClient[] = await Promise.all(uids.map(() => pool.connect()));
  try {
    await Promise.all(
      clientes.map(async (c, i) => {
        await c.query('begin');
        await bd.fijarIdentidad(c, uids[i]);
      }),
    );

    // 2) Disparar todas las solicitudes en el mismo instante.
    //    Cada una confirma (commit) en cuanto termina, como haría PostgREST.
    return await Promise.all(
      clientes.map(async (c, i): Promise<Resultado> => {
        try {
          const r = await llamar(c, funcion, args(i));
          await c.query('commit');
          return { ok: true, plaza: r?.plaza };
        } catch (e: any) {
          await c.query('rollback');
          return { ok: false, error: e.message };
        }
      }),
    );
  } finally {
    clientes.forEach((c) => c.release());
  }
}

describe('Concurrencia', () => {
  it('#9 diez personas reservando a la vez el mismo domingo: exactamente 3 lo consiguen (25 rondas)', async () => {
    const personas = [];
    for (let i = 0; i < 10; i++) personas.push(await bd.crearParticipante(`Persona${String.fromCharCode(65 + i)}`));
    const uids = personas.map((p) => p.uid);

    for (let ronda = 0; ronda < 25; ronda++) {
      const f = await bd.crearFecha(7 + ronda);
      const resultados = await enParalelo(uids, 'reservar', () => ({ p_fecha_id: f.id }));

      const exitos = resultados.filter((r) => r.ok) as { ok: true; plaza: number }[];
      const fallos = resultados.filter((r) => !r.ok) as { ok: false; error: string }[];

      expect(exitos).toHaveLength(3);
      expect(exitos.map((r) => r.plaza).sort()).toEqual([1, 2, 3]);
      expect(fallos).toHaveLength(7);
      expect(new Set(fallos.map((r) => r.error))).toEqual(new Set(['FECHA_COMPLETA']));
      expect(await bd.reservasActivas(f.id)).toBe(3);
      expect(await bd.estadoFecha(f.id)).toBe('completa');
    }
  });

  it('la misma persona pulsando 5 veces a la vez (doble clic, varias pestañas) solo reserva una vez', async () => {
    const pedro = await bd.crearParticipante('Pedro');
    const f = await bd.crearFecha(7);

    const resultados = await enParalelo(Array(5).fill(pedro.uid), 'reservar', () => ({ p_fecha_id: f.id }));

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok).every((r) => !r.ok && r.error === 'YA_RESERVADO')).toBe(true);
    expect(await bd.reservasActivas(f.id)).toBe(1);
  });

  it('reservas y cancelaciones mezcladas a la vez nunca superan 3 plazas activas', async () => {
    const f = await bd.crearFecha(7);
    const titulares: { uid: string; id: string; reserva: { id: string } }[] = [];
    for (const n of ['Ana', 'Bea', 'Carla']) {
      const p = await bd.crearParticipante(n);
      titulares.push({ ...p, reserva: await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id }) });
    }
    const aspirantes = [];
    for (let i = 0; i < 8; i++) aspirantes.push(await bd.crearParticipante(`Aspirante${String.fromCharCode(65 + i)}`));

    // 2 titulares cancelan mientras 8 personas intentan entrar
    const uids = [titulares[0].uid, titulares[1].uid, ...aspirantes.map((a) => a.uid)];
    const clientes = await Promise.all(uids.map(() => pool.connect()));
    try {
      await Promise.all(clientes.map(async (c, i) => { await c.query('begin'); await bd.fijarIdentidad(c, uids[i]); }));
      const resultados = await Promise.all(
        clientes.map(async (c, i) => {
          try {
            if (i < 2) await llamar(c, 'cancelar_mi_reserva', { p_reserva_id: titulares[i].reserva.id });
            else await llamar(c, 'reservar', { p_fecha_id: f.id });
            await c.query('commit');
            return { i, ok: true };
          } catch (e: any) {
            await c.query('rollback');
            return { i, ok: false, error: e.message };
          }
        }),
      );
      // Las cancelaciones siempre funcionan
      expect(resultados.filter((r) => r.i < 2).every((r) => r.ok)).toBe(true);
      // Entran como mucho 2 aspirantes (las plazas liberadas)
      const entran = resultados.filter((r) => r.i >= 2 && r.ok).length;
      expect(entran).toBeLessThanOrEqual(2);
    } finally {
      clientes.forEach((c) => c.release());
    }

    const activas = await bd.reservasActivas(f.id);
    expect(activas).toBeLessThanOrEqual(3);
    const [plazas] = await bd.sql<{ n: number }>(
      `select count(distinct plaza)::int as n from public.reservas where fecha_id = $1 and estado = 'activa'`,
      [f.id],
    );
    expect(plazas.n).toBe(activas);
  });

  it('la propia base de datos impide una 4.ª plaza aunque alguien salte las funciones', async () => {
    const f = await bd.crearFecha(7);
    const ps = [];
    for (const n of ['Ana', 'Bea', 'Carla', 'Diana']) ps.push(await bd.crearParticipante(n));
    for (const p of ps.slice(0, 3)) await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id });

    // Como superusuario, insertando a mano en la tabla:
    await expect(
      bd.sql(`insert into public.reservas (participante_id, fecha_id, plaza) values ($1, $2, 1)`, [ps[3].id, f.id]),
    ).rejects.toThrow(/reservas_plaza_unica/);
    await expect(
      bd.sql(`insert into public.reservas (participante_id, fecha_id, plaza) values ($1, $2, 4)`, [ps[3].id, f.id]),
    ).rejects.toThrow(/plaza_check/);
    // Y tampoco una reserva duplicada de la misma persona
    await expect(
      bd.sql(`insert into public.reservas (participante_id, fecha_id, plaza) values ($1, $2, 3)`, [ps[0].id, f.id]),
    ).rejects.toThrow(/reservas_(una_por_persona_y_fecha|plaza_unica)/);

    expect(await bd.reservasActivas(f.id)).toBe(3);
  });
});
