// Pruebas funcionales del sistema de reservas contra PostgreSQL real.
// Los números (#1, #2...) corresponden a la lista de pruebas obligatorias.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Bd, fallaCon } from './ayudas';
import { crearPool } from './entorno';

const pool = crearPool();
const bd = new Bd(pool);

beforeEach(() => bd.limpiar());
afterAll(() => pool.end());

describe('Sistema de reservas', () => {
  it('#1 una persona puede reservar una plaza disponible', async () => {
    const pedro = await bd.crearParticipante('Pedro', 'Riquelme');
    const f = await bd.crearFecha(7);

    const r = await bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id });

    expect(r.fecha).toBe(f.fecha);
    expect(r.plaza).toBe(1);
    expect(await bd.reservasActivas(f.id)).toBe(1);
    expect(await bd.estadoFecha(f.id)).toBe('abierta');
  });

  it('#2 tres personas pueden reservar el mismo domingo y la fecha pasa a COMPLETA', async () => {
    const f = await bd.crearFecha(7);
    const personas = [
      await bd.crearParticipante('Pedro'),
      await bd.crearParticipante('María'),
      await bd.crearParticipante('Lucía'),
    ];

    const plazas: number[] = [];
    for (const p of personas) {
      plazas.push((await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id })).plaza);
    }

    expect(plazas).toEqual([1, 2, 3]);
    expect(await bd.reservasActivas(f.id)).toBe(3);
    expect(await bd.estadoFecha(f.id)).toBe('completa');
  });

  it('#3 una cuarta persona no puede reservar esa fecha', async () => {
    const f = await bd.crearFecha(7);
    for (const n of ['Ana', 'Bea', 'Carla']) {
      const p = await bd.crearParticipante(n);
      await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id });
    }
    const cuarta = await bd.crearParticipante('Diana');

    await fallaCon(bd.rpc(cuarta.uid, 'reservar', { p_fecha_id: f.id }), 'FECHA_COMPLETA');
    expect(await bd.reservasActivas(f.id)).toBe(3);
  });

  it('#4 cualquiera (incluso sin sesión) ve quién está apuntado, solo con nombre e inicial', async () => {
    const f = await bd.crearFecha(7);
    const pedro = await bd.crearParticipante('Pedro', 'Riquelme');
    const maria = await bd.crearParticipante('María', 'García López');
    await bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id });
    await bd.rpc(maria.uid, 'reservar', { p_fecha_id: f.id });

    const cal = await bd.rpc(null, 'calendario_publico');
    const dia = cal.find((d: any) => d.id === f.id);

    expect(dia.ocupadas).toBe(2);
    expect(dia.plazas_totales).toBe(3);
    expect(dia.estado).toBe('abierta');
    expect(dia.participantes.map((p: any) => p.nombre)).toEqual(['Pedro R.', 'María G.']);
    // Nada de correos ni apellidos completos en la parte pública
    const json = JSON.stringify(cal);
    expect(json).not.toContain('@');
    expect(json).not.toContain('Riquelme');
    expect(dia.mi_reserva_id).toBeNull();
  });

  it('#5 #6 las reservas persisten y se ven desde otra sesión/dispositivo', async () => {
    const f = await bd.crearFecha(7);
    const pedro = await bd.crearParticipante('Pedro');
    const reserva = await bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id });

    // Conexión totalmente nueva, distinta de la que hizo la reserva
    const { crearPool: nuevoPool } = await import('./entorno');
    const otroDispositivo = new Bd(nuevoPool(2));
    try {
      const visitante = await otroDispositivo.rpc(null, 'calendario_publico');
      expect(visitante.find((d: any) => d.id === f.id).ocupadas).toBe(1);

      const elMismo = await otroDispositivo.rpc(pedro.uid, 'calendario_publico');
      expect(elMismo.find((d: any) => d.id === f.id).mi_reserva_id).toBe(reserva.id);

      const mias = await otroDispositivo.rpc(pedro.uid, 'mis_reservas');
      expect(mias).toHaveLength(1);
      expect(mias[0].estado).toBe('activa');
    } finally {
      await otroDispositivo.pool.end();
    }
  });

  it('#7 una cancelación autorizada libera la plaza inmediatamente y queda en el historial', async () => {
    const f = await bd.crearFecha(7);
    const ps = [];
    for (const n of ['Ana', 'Bea', 'Carla']) {
      const p = await bd.crearParticipante(n);
      ps.push({ ...p, reserva: await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id }) });
    }
    expect(await bd.estadoFecha(f.id)).toBe('completa');

    await bd.rpc(ps[1].uid, 'cancelar_mi_reserva', { p_reserva_id: ps[1].reserva.id });

    expect(await bd.reservasActivas(f.id)).toBe(2);
    expect(await bd.estadoFecha(f.id)).toBe('abierta');

    const diana = await bd.crearParticipante('Diana');
    const r = await bd.rpc(diana.uid, 'reservar', { p_fecha_id: f.id });
    expect(r.plaza).toBe(2); // reutiliza la plaza liberada

    const [h] = await bd.sql<{ n: number }>(
      `select count(*)::int as n from public.historial where accion = 'reserva_cancelada' and reserva_id = $1`,
      [ps[1].reserva.id],
    );
    expect(h.n).toBe(1);
    const [cancelada] = await bd.sql<any>('select estado, cancelada_en from public.reservas where id = $1', [ps[1].reserva.id]);
    expect(cancelada.estado).toBe('cancelada');
    expect(cancelada.cancelada_en).not.toBeNull();
  });

  it('#8 no se puede reservar dos veces la misma fecha (pero sí volver tras cancelar)', async () => {
    const f = await bd.crearFecha(7);
    const pedro = await bd.crearParticipante('Pedro');
    const r1 = await bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id });

    await fallaCon(bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id }), 'YA_RESERVADO');
    expect(await bd.reservasActivas(f.id)).toBe(1);

    await bd.rpc(pedro.uid, 'cancelar_mi_reserva', { p_reserva_id: r1.id });
    await fallaCon(bd.rpc(pedro.uid, 'cancelar_mi_reserva', { p_reserva_id: r1.id }), 'RESERVA_YA_CANCELADA');
    const r2 = await bd.rpc(pedro.uid, 'reservar', { p_fecha_id: f.id });
    expect(r2.id).not.toBe(r1.id);
    expect(await bd.reservasActivas(f.id)).toBe(1);
  });

  it('no permite reservar fechas canceladas ni pasadas', async () => {
    const pedro = await bd.crearParticipante('Pedro');
    const pasada = await bd.crearFecha(-7);
    const cancelada = await bd.crearFecha(14);
    await bd.sql(
      `update public.fechas_bingo set estado = 'cancelada', cancelada_en = now() where id = $1`,
      [cancelada.id],
    );

    await fallaCon(bd.rpc(pedro.uid, 'reservar', { p_fecha_id: pasada.id }), 'FECHA_PASADA');
    await fallaCon(bd.rpc(pedro.uid, 'reservar', { p_fecha_id: cancelada.id }), 'FECHA_CANCELADA');
  });

  it('exige sesión y perfil completo para reservar', async () => {
    const f = await bd.crearFecha(7);
    const sinPerfil = await bd.crearUsuario();
    await fallaCon(bd.rpc(sinPerfil.uid, 'reservar', { p_fecha_id: f.id }), 'PERFIL_INCOMPLETO');
  });

  it('una persona bloqueada por el admin no puede reservar', async () => {
    const f = await bd.crearFecha(7);
    const p = await bd.crearParticipante('Pedro');
    await bd.sql('update public.participantes set activo = false where id = $1', [p.id]);
    await fallaCon(bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id }), 'PARTICIPANTE_BLOQUEADO');
  });

  it('valida y normaliza nombre y apellidos', async () => {
    const u = await bd.crearUsuario();
    const perfil = await bd.rpc(u.uid, 'guardar_mi_perfil', {
      p_nombre: "  José   Mª d'Ors ",
      p_apellidos: 'Núñez-Çelik  Peña',
    });
    expect(perfil.nombre).toBe("José Mª d'Ors");
    expect(perfil.apellidos).toBe('Núñez-Çelik Peña');

    for (const malo of ['', 'A', '<script>', 'Pedro123', 'x'.repeat(51)]) {
      const e = await fallaCon(
        bd.rpc(u.uid, 'guardar_mi_perfil', { p_nombre: malo, p_apellidos: 'Pérez' }),
        'DATOS_INVALIDOS',
      );
      expect(e.detail).toBe('nombre');
    }
  });
});
