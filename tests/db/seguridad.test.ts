// Pruebas obligatorias #10 y #11 + políticas RLS y permisos.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Bd, fallaCon } from './ayudas';
import { crearPool } from './entorno';

const pool = crearPool();
const bd = new Bd(pool);

beforeEach(() => bd.limpiar());
afterAll(() => pool.end());

describe('Seguridad y permisos', () => {
  it('#10 nadie puede cancelar ni modificar la reserva de otra persona', async () => {
    const f = await bd.crearFecha(7);
    const victima = await bd.crearParticipante('María');
    const atacante = await bd.crearParticipante('Mallory');
    const r = await bd.rpc(victima.uid, 'reservar', { p_fecha_id: f.id });

    // Vía la función de cancelación: responde como si no existiera
    await fallaCon(bd.rpc(atacante.uid, 'cancelar_mi_reserva', { p_reserva_id: r.id }), 'RESERVA_NO_ENCONTRADA');

    // Vía acceso directo a la tabla: sin privilegios de escritura
    await expect(
      bd.como(atacante.uid, (c) => c.query(`update public.reservas set estado = 'cancelada', cancelada_en = now() where id = $1`, [r.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      bd.como(atacante.uid, (c) => c.query(`delete from public.reservas where id = $1`, [r.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      bd.como(atacante.uid, (c) =>
        c.query(`insert into public.reservas (participante_id, fecha_id, plaza) values ($1, $2, 2)`, [victima.id, f.id]),
      ),
    ).rejects.toThrow(/permission denied/);

    // Tampoco puede usar funciones internas
    await expect(
      bd.rpc(atacante.uid, '_cancelar_reserva', { p_reserva_id: r.id, p_actor_id: atacante.id, p_motivo: null, p_es_admin: true }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      bd.rpc(atacante.uid, '_crear_reserva', { p_participante_id: victima.id, p_fecha_id: f.id, p_actor_id: atacante.id, p_es_admin: true }),
    ).rejects.toThrow(/permission denied/);

    expect(await bd.reservasActivas(f.id)).toBe(1);
  });

  it('RLS: cada persona solo ve sus propias reservas y su propia ficha', async () => {
    const f = await bd.crearFecha(7);
    const ana = await bd.crearParticipante('Ana', 'López');
    const bea = await bd.crearParticipante('Bea', 'Martín');
    await bd.rpc(ana.uid, 'reservar', { p_fecha_id: f.id });
    await bd.rpc(bea.uid, 'reservar', { p_fecha_id: f.id });

    const reservasAna = await bd.como(ana.uid, (c) => c.query('select participante_id from public.reservas'));
    expect(reservasAna.rows).toEqual([{ participante_id: ana.id }]);

    const fichasAna = await bd.como(ana.uid, (c) => c.query('select id, email from public.participantes'));
    expect(fichasAna.rows).toEqual([{ id: ana.id, email: ana.email }]);

    const historial = await bd.como(ana.uid, (c) => c.query('select * from public.historial'));
    expect(historial.rows).toHaveLength(0);
  });

  it('un participante no puede hacerse administrador', async () => {
    const p = await bd.crearParticipante('Pedro');
    await expect(
      bd.como(p.uid, (c) => c.query(`update public.participantes set rol = 'admin' where id = $1`, [p.id])),
    ).rejects.toThrow(/permission denied/);
    await fallaCon(bd.rpc(p.uid, 'admin_cambiar_rol', { p_id: p.id, p_rol: 'admin' }), 'NO_AUTORIZADO');
    expect(await bd.rpc(p.uid, 'es_admin')).toBe(false);
  });

  it('#11 un usuario sin permisos no puede usar ninguna función de administración', async () => {
    const f = await bd.crearFecha(7);
    const f2 = await bd.crearFecha(21);
    const p = await bd.crearParticipante('Pedro');
    const reserva = await bd.rpc(p.uid, 'reservar', { p_fecha_id: f.id });
    const llamadas: [string, Record<string, unknown>][] = [
      ['admin_calendario', {}],
      ['admin_crear_fecha', { p_fecha: await bd.dia(30) }],
      ['admin_editar_fecha', { p_id: f.id, p_fecha: await bd.dia(31) }],
      ['admin_cancelar_fecha', { p_id: f.id, p_confirmar: true }],
      ['admin_reabrir_fecha', { p_id: f.id }],
      ['admin_eliminar_fecha', { p_id: f.id }],
      ['admin_generar_fechas', { p_inicio: await bd.dia(1), p_intervalo: 14, p_cantidad: 3 }],
      ['admin_asegurar_fechas_futuras', {}],
      ['admin_obtener_configuracion', {}],
      ['admin_guardar_configuracion', { p_generacion_automatica: true, p_intervalo_dias: 14, p_fecha_referencia: null, p_fechas_futuras_minimas: 6 }],
      ['admin_reservar_para', { p_participante_id: p.id, p_fecha_id: f.id }],
      ['admin_listar_reservas', {}],
      ['admin_listar_participantes', {}],
      ['admin_crear_participante', { p_nombre: 'Falso', p_apellidos: 'Falso' }],
      ['admin_editar_participante', { p_id: p.id, p_nombre: 'Pedro', p_apellidos: 'Prueba', p_activo: true }],
      ['admin_historial', {}],
      ['admin_estadisticas', {}],
      ['admin_cancelar_reserva', { p_reserva_id: reserva.id, p_motivo: null }],
      ['admin_mover_reserva', { p_reserva_id: reserva.id, p_nueva_fecha_id: f2.id }],
      ['admin_cambiar_rol', { p_id: p.id, p_rol: 'admin' }],
    ];

    // Están todas las funciones admin_* que existen
    const existentes = await bd.sql<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and proname like 'admin\\_%' order by 1`,
    );
    expect(llamadas.map(([fn]) => fn).sort()).toEqual(existentes.map((e) => e.proname));

    for (const [fn, args] of llamadas) {
      // Con sesión pero sin rol admin → NO_AUTORIZADO (comprobado en el servidor)
      await fallaCon(bd.rpc(p.uid, fn, args), 'NO_AUTORIZADO');
      // Sin sesión → ni siquiera puede ejecutar la función
      await expect(bd.rpc(null, fn, args), fn).rejects.toThrow(/permission denied/);
    }

    // Nada ha cambiado
    const [n] = await bd.sql<{ n: number }>('select count(*)::int as n from public.fechas_bingo');
    expect(n.n).toBe(2);
    expect(await bd.estadoFecha(f.id)).toBe('abierta');
    expect(await bd.reservasActivas(f.id)).toBe(1);
    expect(await bd.rpc(p.uid, 'es_admin')).toBe(false);
  });

  it('un administrador bloqueado deja de tener permisos', async () => {
    const admin = await bd.crearAdmin();
    expect(await bd.rpc(admin.uid, 'es_admin')).toBe(true);
    await bd.sql('update public.participantes set activo = false where id = $1', [admin.id]);
    await fallaCon(bd.rpc(admin.uid, 'admin_estadisticas'), 'NO_AUTORIZADO');
  });

  it('un visitante sin sesión solo puede leer el calendario público y las fechas', async () => {
    await bd.crearFecha(7);
    expect(await bd.rpc(null, 'calendario_publico')).toHaveLength(1);
    const fechas = await bd.como(null, (c) => c.query('select fecha, estado from public.fechas_bingo'));
    expect(fechas.rows).toHaveLength(1);

    for (const tabla of ['participantes', 'reservas', 'historial', 'configuracion']) {
      await expect(bd.como(null, (c) => c.query(`select * from public.${tabla}`)), tabla).rejects.toThrow(/permission denied/);
    }
    for (const fn of ['reservar', 'cancelar_mi_reserva', 'mis_reservas', 'guardar_mi_perfil', 'eliminar_mi_cuenta']) {
      const args: Record<string, Record<string, unknown>> = {
        reservar: { p_fecha_id: '00000000-0000-0000-0000-000000000000' },
        cancelar_mi_reserva: { p_reserva_id: '00000000-0000-0000-0000-000000000000' },
        guardar_mi_perfil: { p_nombre: 'Hacker', p_apellidos: 'Anónimo' },
      };
      await expect(bd.rpc(null, fn, args[fn] ?? {}), fn).rejects.toThrow(/permission denied/);
    }
    await expect(
      bd.como(null, (c) => c.query(`update public.fechas_bingo set estado = 'cancelada', cancelada_en = now()`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('las funciones expuestas a anon/authenticated son exactamente las previstas', async () => {
    const filas = await bd.sql<{ rol: string; funcion: string }>(`
      select r.rolname as rol, p.proname as funcion
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
        cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
       where has_function_privilege(r.rolname, p.oid, 'execute')
       order by 1, 2`);
    const anon = filas.filter((f) => f.rol === 'anon').map((f) => f.funcion);
    const auth = filas.filter((f) => f.rol === 'authenticated').map((f) => f.funcion);

    expect(anon).toEqual(['calendario_publico']);
    expect(auth.filter((f) => f.startsWith('_'))).toEqual([]);
    expect(auth.filter((f) => !f.startsWith('admin_')).sort()).toEqual(
      ['calendario_publico', 'cancelar_mi_reserva', 'eliminar_mi_cuenta', 'es_admin', 'guardar_mi_perfil',
       'mi_participante_id', 'mi_perfil', 'mis_reservas', 'reservar'].sort(),
    );
  });

  it('todas las funciones SECURITY DEFINER fijan search_path (contra secuestro de esquema)', async () => {
    const sinRuta = await bd.sql<{ proname: string }>(`
      select p.proname from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
       where p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(sinRuta).toEqual([]);
  });

  it('todas las tablas tienen RLS activado', async () => {
    const sinRls = await bd.sql<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(sinRls).toEqual([]);
  });
});
