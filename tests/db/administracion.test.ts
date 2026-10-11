// Gestión de fechas (incl. prueba obligatoria #15), reservas y participantes.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Bd, fallaCon } from './ayudas';
import { crearPool } from './entorno';

const pool = crearPool();
const bd = new Bd(pool);

beforeEach(() => bd.limpiar());
afterAll(() => pool.end());

describe('Administración de fechas', () => {
  it('#15 la generación cada 14 días respeta las excepciones y nunca duplica fechas', async () => {
    const admin = await bd.crearAdmin();
    const inicio = await bd.dia(3);

    // Excepción creada a mano antes de generar (coincide con la 2.ª fecha de la serie)
    const excepcion = await bd.dia(3 + 14);
    await bd.rpc(admin.uid, 'admin_crear_fecha', { p_fecha: excepcion, p_notas: 'Creada a mano' });

    const vista = await bd.rpc(admin.uid, 'admin_generar_fechas', {
      p_inicio: inicio, p_intervalo: 14, p_cantidad: 4, p_simular: true,
    });
    expect(vista.creadas).toHaveLength(3);
    expect(vista.omitidas).toEqual([excepcion]);
    const [antes] = await bd.sql<{ n: number }>('select count(*)::int as n from public.fechas_bingo');
    expect(antes.n).toBe(1); // la simulación no escribe nada

    const real = await bd.rpc(admin.uid, 'admin_generar_fechas', { p_inicio: inicio, p_intervalo: 14, p_cantidad: 4 });
    expect(real.creadas).toEqual([inicio, await bd.dia(31), await bd.dia(45)]);
    expect(real.omitidas).toEqual([excepcion]);

    // Repetir la misma generación no crea nada nuevo
    const otraVez = await bd.rpc(admin.uid, 'admin_generar_fechas', { p_inicio: inicio, p_intervalo: 14, p_cantidad: 4 });
    expect(otraVez.creadas).toEqual([]);
    expect(otraVez.omitidas).toHaveLength(4);

    const [total] = await bd.sql<{ n: number }>('select count(*)::int as n from public.fechas_bingo');
    expect(total.n).toBe(4);
    const [notas] = await bd.sql<{ notas: string }>('select notas from public.fechas_bingo where fecha = $1', [excepcion]);
    expect(notas.notas).toBe('Creada a mano');
  });

  it('no permite crear ni mover una fecha sobre otra existente', async () => {
    const admin = await bd.crearAdmin();
    const a = await bd.rpc(admin.uid, 'admin_crear_fecha', { p_fecha: await bd.dia(7) });
    await bd.rpc(admin.uid, 'admin_crear_fecha', { p_fecha: await bd.dia(21) });

    await fallaCon(bd.rpc(admin.uid, 'admin_crear_fecha', { p_fecha: await bd.dia(7) }), 'FECHA_DUPLICADA');
    await fallaCon(bd.rpc(admin.uid, 'admin_editar_fecha', { p_id: a.id, p_fecha: await bd.dia(21) }), 'FECHA_DUPLICADA');

    // Mover a un día libre sí funciona (excepción: el bingo se pasa una semana)
    await bd.rpc(admin.uid, 'admin_editar_fecha', { p_id: a.id, p_fecha: await bd.dia(14), p_notas: 'Movido por fiestas' });
    const [movida] = await bd.sql<any>('select fecha::text, notas from public.fechas_bingo where id = $1', [a.id]);
    expect(movida).toEqual({ fecha: await bd.dia(14), notas: 'Movido por fiestas' });
  });

  it('cancelar una fecha con reservas exige confirmación y libera a los afectados', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    const ana = await bd.crearParticipante('Ana');
    const bea = await bd.crearParticipante('Bea');
    await bd.rpc(ana.uid, 'reservar', { p_fecha_id: f.id });
    await bd.rpc(bea.uid, 'reservar', { p_fecha_id: f.id });

    const aviso = await fallaCon(
      bd.rpc(admin.uid, 'admin_cancelar_fecha', { p_id: f.id, p_motivo: 'Obras en el local' }),
      'RESERVAS_AFECTADAS',
    );
    expect(aviso.detail).toBe('2');
    expect(await bd.estadoFecha(f.id)).toBe('abierta'); // sin confirmar no cambia nada

    const r = await bd.rpc(admin.uid, 'admin_cancelar_fecha', {
      p_id: f.id, p_motivo: 'Obras en el local', p_confirmar: true,
    });
    expect(r.reservas_canceladas).toBe(2);
    expect(await bd.estadoFecha(f.id)).toBe('cancelada');
    expect(await bd.reservasActivas(f.id)).toBe(0);

    const publico = (await bd.rpc(null, 'calendario_publico')).find((d: any) => d.id === f.id);
    expect(publico.estado).toBe('cancelada');
    expect(publico.motivo_cancelacion).toBe('Obras en el local');

    const misAna = await bd.rpc(ana.uid, 'mis_reservas');
    expect(misAna[0].estado).toBe('cancelada');
    expect(misAna[0].motivo_cancelacion).toBe('Fecha cancelada: Obras en el local');

    await fallaCon(bd.rpc(ana.uid, 'reservar', { p_fecha_id: f.id }), 'FECHA_CANCELADA');

    // Reabrir
    await bd.rpc(admin.uid, 'admin_reabrir_fecha', { p_id: f.id });
    expect(await bd.estadoFecha(f.id)).toBe('abierta');
    await bd.rpc(ana.uid, 'reservar', { p_fecha_id: f.id });
  });

  it('cancelar una fecha sin reservas no pide confirmación', async () => {
    const admin = await bd.crearAdmin();
    const f = await bd.crearFecha(7);
    const r = await bd.rpc(admin.uid, 'admin_cancelar_fecha', { p_id: f.id });
    expect(r.reservas_canceladas).toBe(0);
    expect(await bd.estadoFecha(f.id)).toBe('cancelada');
  });

  it('solo se pueden eliminar fechas que nunca tuvieron reservas', async () => {
    const admin = await bd.crearAdmin();
    const conHistoria = await bd.crearFecha(7);
    const vacia = await bd.crearFecha(14);
    const p = await bd.crearParticipante('Ana');
    const r = await bd.rpc(p.uid, 'reservar', { p_fecha_id: conHistoria.id });
    await bd.rpc(p.uid, 'cancelar_mi_reserva', { p_reserva_id: r.id });

    await fallaCon(bd.rpc(admin.uid, 'admin_eliminar_fecha', { p_id: conHistoria.id }), 'FECHA_CON_RESERVAS');
    await bd.rpc(admin.uid, 'admin_eliminar_fecha', { p_id: vacia.id });
    const filas = await bd.sql('select 1 from public.fechas_bingo where id = $1', [vacia.id]);
    expect(filas).toHaveLength(0);
  });

  it('la generación automática mantiene N fechas futuras sin recrear las eliminadas', async () => {
    const admin = await bd.crearAdmin();
    const ref = await bd.dia(5);

    const cfg = await bd.rpc(admin.uid, 'admin_guardar_configuracion', {
      p_generacion_automatica: true, p_intervalo_dias: 14, p_fecha_referencia: ref, p_fechas_futuras_minimas: 3,
    });
    expect(cfg.generadas).toEqual([ref, await bd.dia(19), await bd.dia(33)]);

    // El admin elimina la del medio (excepción): no debe reaparecer
    const [medio] = await bd.sql<{ id: string }>('select id from public.fechas_bingo where fecha = $1', [await bd.dia(19)]);
    await bd.rpc(admin.uid, 'admin_eliminar_fecha', { p_id: medio.id });

    const r = await bd.rpc(admin.uid, 'admin_asegurar_fechas_futuras');
    expect(r.creadas).toEqual([await bd.dia(47)]);
    const fechas = await bd.sql<{ f: string }>('select fecha::text as f from public.fechas_bingo order by fecha');
    expect(fechas.map((x) => x.f)).toEqual([ref, await bd.dia(33), await bd.dia(47)]);

    // Con la opción desactivada no genera nada
    await bd.rpc(admin.uid, 'admin_guardar_configuracion', {
      p_generacion_automatica: false, p_intervalo_dias: 14, p_fecha_referencia: ref, p_fechas_futuras_minimas: 10,
    });
    expect((await bd.rpc(admin.uid, 'admin_asegurar_fechas_futuras')).activa).toBe(false);
  });
});

describe('Administración de reservas y participantes', () => {
  it('el admin puede apuntar a alguien sin cuenta, moverle de fecha y cancelar su reserva', async () => {
    const admin = await bd.crearAdmin();
    const f1 = await bd.crearFecha(7);
    const f2 = await bd.crearFecha(21);
    const abuela = await bd.rpc(admin.uid, 'admin_crear_participante', { p_nombre: 'Carmen', p_apellidos: 'Sánchez' });

    const r = await bd.rpc(admin.uid, 'admin_reservar_para', { p_participante_id: abuela.id, p_fecha_id: f1.id });
    expect((await bd.rpc(null, 'calendario_publico'))[0].participantes[0].nombre).toBe('Carmen S.');

    await bd.rpc(admin.uid, 'admin_mover_reserva', { p_reserva_id: r.id, p_nueva_fecha_id: f2.id });
    expect(await bd.reservasActivas(f1.id)).toBe(0);
    expect(await bd.reservasActivas(f2.id)).toBe(1);

    await bd.rpc(admin.uid, 'admin_cancelar_reserva', { p_reserva_id: r.id, p_motivo: 'Avisó por teléfono' });
    expect(await bd.reservasActivas(f2.id)).toBe(0);

    const historial = await bd.rpc(admin.uid, 'admin_historial', {});
    expect(historial.map((h: any) => h.accion)).toEqual([
      'reserva_cancelada', 'reserva_movida', 'reserva_creada', 'participante_creado', 'perfil_creado',
    ]);
  });

  it('no se puede mover una reserva a una fecha completa', async () => {
    const admin = await bd.crearAdmin();
    const f1 = await bd.crearFecha(7);
    const f2 = await bd.crearFecha(21);
    for (const n of ['Ana', 'Bea', 'Carla']) {
      const p = await bd.crearParticipante(n);
      await bd.rpc(p.uid, 'reservar', { p_fecha_id: f2.id });
    }
    const d = await bd.crearParticipante('Diana');
    const r = await bd.rpc(d.uid, 'reservar', { p_fecha_id: f1.id });
    await fallaCon(bd.rpc(admin.uid, 'admin_mover_reserva', { p_reserva_id: r.id, p_nueva_fecha_id: f2.id }), 'FECHA_COMPLETA');
    expect(await bd.reservasActivas(f2.id)).toBe(3);
  });

  it('gestiona permisos sin dejar nunca el sistema sin administradores', async () => {
    const admin = await bd.crearAdmin('Pedro');
    const maria = await bd.crearParticipante('María');
    const sinCuenta = await bd.rpc(admin.uid, 'admin_crear_participante', { p_nombre: 'Carmen', p_apellidos: 'Sánchez' });

    await fallaCon(bd.rpc(admin.uid, 'admin_cambiar_rol', { p_id: admin.id, p_rol: 'participante' }), 'ULTIMO_ADMIN');
    await fallaCon(bd.rpc(admin.uid, 'admin_cambiar_rol', { p_id: sinCuenta.id, p_rol: 'admin' }), 'SIN_CUENTA');
    await fallaCon(
      bd.rpc(admin.uid, 'admin_editar_participante', { p_id: admin.id, p_nombre: 'Pedro', p_apellidos: 'Gestor', p_activo: false }),
      'NO_PUEDES_BLOQUEARTE',
    );

    await bd.rpc(admin.uid, 'admin_cambiar_rol', { p_id: maria.id, p_rol: 'admin' });
    expect(await bd.rpc(maria.uid, 'es_admin')).toBe(true);
    await bd.rpc(maria.uid, 'admin_cambiar_rol', { p_id: admin.id, p_rol: 'participante' });
    expect(await bd.rpc(admin.uid, 'es_admin')).toBe(false);
  });

  it('las estadísticas reflejan las reservas activas', async () => {
    const admin = await bd.crearAdmin();
    const f1 = await bd.crearFecha(7);
    await bd.crearFecha(21);
    const p = await bd.crearParticipante('Ana');
    const r = await bd.rpc(p.uid, 'reservar', { p_fecha_id: f1.id });
    await bd.rpc(p.uid, 'cancelar_mi_reserva', { p_reserva_id: r.id });
    await bd.rpc(p.uid, 'reservar', { p_fecha_id: f1.id });

    const e = await bd.rpc(admin.uid, 'admin_estadisticas');
    expect(e).toMatchObject({
      fechas_programadas: 2,
      plazas_totales_futuras: 6,
      plazas_ocupadas_futuras: 1,
      reservas_realizadas: 2,
      reservas_activas: 1,
      cancelaciones: 1,
    });
    expect(e.proxima_fecha.ocupadas).toBe(1);
  });

  it('eliminar mi cuenta anonimiza los datos y libera mis plazas futuras', async () => {
    const f = await bd.crearFecha(7);
    const p = await bd.crearParticipante('Lucía', 'Fernández');
    await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id });

    const r = await bd.rpc(p.uid, 'eliminar_mi_cuenta');
    expect(r).toEqual({ reservas_canceladas: 1, cuenta_borrada: true });
    expect(await bd.reservasActivas(f.id)).toBe(0);

    const [ficha] = await bd.sql<any>('select nombre, apellidos, email, user_id from public.participantes where id = $1', [p.id]);
    expect(ficha).toEqual({ nombre: 'Cuenta', apellidos: 'eliminada', email: null, user_id: null });
    const usuarios = await bd.sql('select 1 from auth.users where id = $1', [p.uid]);
    expect(usuarios).toHaveLength(0);
    const rastro = await bd.sql<{ t: string }>('select detalles::text as t from public.historial');
    expect(rastro.some((h) => h.t.includes('Fernández'))).toBe(false);
  });
});
