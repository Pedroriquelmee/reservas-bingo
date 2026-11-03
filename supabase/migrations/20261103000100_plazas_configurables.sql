-- =====================================================================
-- Reservas de Bingo · 4 · Plazas por domingo configurables (de 3 a 4)
--
-- Ejecutar UNA vez en Supabase → SQL Editor, después de las tres
-- migraciones anteriores. Se puede aplicar con la web en marcha.
--
-- Qué cambia:
--  * El número de plazas deja de estar fijo (3) y se guarda en
--    configuracion.plazas_por_fecha. Queda en 4.
--  * Se cambia desde el panel: Administración → Ajustes → Plazas por domingo.
--  * Las garantías no cambian: nunca más plazas activas que el límite, ni
--    siquiera con varias personas reservando a la vez.
--     - índice único (fecha, plaza) entre reservas activas (ya existía)
--     - plaza entre 1 y 20 (CHECK)
--     - trigger que rechaza cualquier plaza por encima del límite actual
--     - bloqueo de la configuración + bloqueo de la fecha al reservar
--  * Los domingos que estaban COMPLETOS con 3 personas pasan a «Disponible».
-- =====================================================================

-- ---------- Configuración: número de plazas ----------
alter table public.configuracion
  add column plazas_por_fecha integer not null default 4
  check (plazas_por_fecha between 1 and 20);

update public.configuracion set plazas_por_fecha = 4 where id;

-- ---------- Reservas: límite fijo 1..3 → 1..20 + límite dinámico ----------
alter table public.reservas drop constraint reservas_plaza_check;
alter table public.reservas
  add constraint reservas_plaza_rango check (plaza between 1 and 20);

create or replace function public._plazas_por_fecha()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select plazas_por_fecha from public.configuracion where id), 4);
$$;

-- Última barrera en la propia tabla: ninguna reserva activa puede ocupar
-- una plaza por encima del límite vigente, venga de donde venga.
create or replace function public._tg_reservas_limite_plazas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = 'activa'
     and (tg_op = 'INSERT'
          or new.plaza is distinct from old.plaza
          or new.fecha_id is distinct from old.fecha_id
          or old.estado <> 'activa')
     and new.plaza > public._plazas_por_fecha() then
    raise exception 'FECHA_COMPLETA' using detail = 'limite_plazas';
  end if;
  return new;
end;
$$;

create trigger reservas_limite_plazas
  before insert or update of plaza, fecha_id, estado on public.reservas
  for each row execute function public._tg_reservas_limite_plazas();

-- ---------- Funciones que antes tenían el 3 escrito ----------

create or replace function public._recalcular_estado_fecha(p_fecha_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ocupadas integer;
begin
  select count(*) into v_ocupadas
    from public.reservas
   where fecha_id = p_fecha_id and estado = 'activa';

  update public.fechas_bingo
     set estado = case
                    when estado = 'cancelada' then 'cancelada'::public.estado_fecha
                    when v_ocupadas >= public._plazas_por_fecha() then 'completa'::public.estado_fecha
                    else 'abierta'::public.estado_fecha
                  end
   where id = p_fecha_id;
end;
$$;

create or replace function public._crear_reserva(
  p_participante_id uuid,
  p_fecha_id uuid,
  p_actor_id uuid,
  p_es_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha       public.fechas_bingo%rowtype;
  v_part        public.participantes%rowtype;
  v_plaza       smallint;
  v_reserva_id  uuid;
  v_restriccion text;
  v_capacidad   integer;
begin
  -- 0) Lectura compartida del número de plazas. Si un administrador lo está
  --    cambiando en este momento, esperamos a que termine (y al revés).
  --    Siempre se bloquea la configuración ANTES que la fecha: así nunca
  --    hay interbloqueos con admin_cambiar_plazas.
  select plazas_por_fecha into v_capacidad
    from public.configuracion where id
     for share;

  -- 1) Bloqueo exclusivo de la fila de la fecha. Todas las reservas y
  --    cancelaciones del mismo domingo esperan aquí su turno, de modo que
  --    dos solicitudes simultáneas nunca leen el mismo número de plazas.
  select * into v_fecha
    from public.fechas_bingo
   where id = p_fecha_id
     for update;

  if not found then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;
  if v_fecha.estado = 'cancelada' then
    raise exception 'FECHA_CANCELADA';
  end if;
  if v_fecha.fecha < public.hoy_madrid() and not p_es_admin then
    raise exception 'FECHA_PASADA';
  end if;

  select * into v_part from public.participantes where id = p_participante_id;
  if not found then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if not v_part.activo then
    raise exception 'PARTICIPANTE_BLOQUEADO';
  end if;

  if exists (
    select 1 from public.reservas
     where fecha_id = p_fecha_id
       and participante_id = p_participante_id
       and estado = 'activa'
  ) then
    raise exception 'YA_RESERVADO';
  end if;

  -- 2) Primera plaza libre (1..N). Si no hay, la fecha está completa.
  select p::smallint into v_plaza
    from generate_series(1, v_capacidad) as p
   where not exists (
     select 1 from public.reservas r
      where r.fecha_id = p_fecha_id and r.estado = 'activa' and r.plaza = p
   )
   order by p
   limit 1;

  if v_plaza is null then
    raise exception 'FECHA_COMPLETA';
  end if;

  -- 3) Inserción. Los índices únicos parciales son la última barrera:
  --    aunque algo fallase arriba, la base de datos rechazaría una plaza de más
  --    o una reserva duplicada.
  begin
    insert into public.reservas (participante_id, fecha_id, plaza, creada_por)
    values (p_participante_id, p_fecha_id, v_plaza, p_actor_id)
    returning id into v_reserva_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'reservas_una_por_persona_y_fecha' then
      raise exception 'YA_RESERVADO';
    end if;
    raise exception 'FECHA_COMPLETA';
  end;

  insert into public.historial (accion, actor_id, participante_id, fecha_id, reserva_id, detalles)
  values (
    'reserva_creada', p_actor_id, p_participante_id, p_fecha_id, v_reserva_id,
    jsonb_build_object(
      'fecha', v_fecha.fecha,
      'participante', v_part.nombre || ' ' || v_part.apellidos,
      'plaza', v_plaza,
      'por_admin', p_es_admin and p_actor_id is distinct from p_participante_id
    )
  );

  return jsonb_build_object(
    'id', v_reserva_id,
    'fecha_id', v_fecha.id,
    'fecha', v_fecha.fecha,
    'plaza', v_plaza
  );
end;
$$;

create or replace function public.admin_mover_reserva(p_reserva_id uuid, p_nueva_fecha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin      uuid := public._exigir_admin();
  v_res        public.reservas%rowtype;
  v_origen     public.fechas_bingo%rowtype;
  v_destino    public.fechas_bingo%rowtype;
  v_plaza      smallint;
  v_part       public.participantes%rowtype;
  v_capacidad  integer;
begin
  -- Igual que al reservar: primero la configuración, después las fechas
  select plazas_por_fecha into v_capacidad
    from public.configuracion where id
     for share;

  select * into v_res from public.reservas where id = p_reserva_id;
  if not found then
    raise exception 'RESERVA_NO_ENCONTRADA';
  end if;
  if v_res.fecha_id = p_nueva_fecha_id then
    raise exception 'DATOS_INVALIDOS' using detail = 'misma_fecha';
  end if;

  -- Bloqueo de ambas fechas siempre en el mismo orden → sin interbloqueos
  perform 1 from public.fechas_bingo
   where id in (v_res.fecha_id, p_nueva_fecha_id)
   order by id
     for update;

  select * into v_origen from public.fechas_bingo where id = v_res.fecha_id;
  select * into v_destino from public.fechas_bingo where id = p_nueva_fecha_id;
  if v_destino.id is null then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;
  if v_destino.estado = 'cancelada' then
    raise exception 'FECHA_CANCELADA';
  end if;

  select * into v_res from public.reservas where id = p_reserva_id for update;
  if v_res.estado <> 'activa' then
    raise exception 'RESERVA_YA_CANCELADA';
  end if;
  if v_res.fecha_id <> v_origen.id then
    raise exception 'REINTENTAR';
  end if;

  if exists (
    select 1 from public.reservas
     where fecha_id = p_nueva_fecha_id and participante_id = v_res.participante_id and estado = 'activa'
  ) then
    raise exception 'YA_RESERVADO';
  end if;

  select p::smallint into v_plaza
    from generate_series(1, v_capacidad) as p
   where not exists (
     select 1 from public.reservas r
      where r.fecha_id = p_nueva_fecha_id and r.estado = 'activa' and r.plaza = p
   )
   order by p
   limit 1;
  if v_plaza is null then
    raise exception 'FECHA_COMPLETA';
  end if;

  update public.reservas set fecha_id = p_nueva_fecha_id, plaza = v_plaza where id = p_reserva_id;

  select * into v_part from public.participantes where id = v_res.participante_id;
  insert into public.historial (accion, actor_id, participante_id, fecha_id, reserva_id, detalles)
  values ('reserva_movida', v_admin, v_res.participante_id, p_nueva_fecha_id, p_reserva_id,
          jsonb_build_object('desde', v_origen.fecha, 'hasta', v_destino.fecha,
                             'participante', v_part.nombre || ' ' || v_part.apellidos));

  return jsonb_build_object('id', p_reserva_id, 'fecha_id', p_nueva_fecha_id, 'plaza', v_plaza);
end;
$$;

create or replace function public.calendario_publico()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mi as (
    select public.mi_participante_id() as pid
  ),
  datos as (
    select
      f.id, f.fecha, f.estado, f.notas, f.motivo_cancelacion,
      count(r.id) filter (where r.id is not null) as ocupadas,
      coalesce(
        jsonb_agg(
          jsonb_build_object('nombre', public._nombre_publico(p.nombre, p.apellidos), 'plaza', r.plaza)
          order by r.plaza
        ) filter (where r.id is not null),
        '[]'::jsonb
      ) as participantes,
      (array_agg(r.id) filter (where r.participante_id = (select pid from mi)))[1] as mi_reserva_id
    from public.fechas_bingo f
    left join public.reservas r on r.fecha_id = f.id and r.estado = 'activa'
    left join public.participantes p on p.id = r.participante_id
    where f.fecha >= public.hoy_madrid()
    group by f.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'fecha', fecha,
        'estado', estado,
        'notas', notas,
        'motivo_cancelacion', motivo_cancelacion,
        'plazas_totales', public._plazas_por_fecha(),
        'ocupadas', case when estado = 'cancelada' then 0 else ocupadas end,
        'participantes', case when estado = 'cancelada' then '[]'::jsonb else participantes end,
        'mi_reserva_id', mi_reserva_id
      )
      order by fecha
    ),
    '[]'::jsonb
  )
  from datos;
$$;

create or replace function public.admin_calendario(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform public._exigir_admin();

  select coalesce(jsonb_agg(x.obj order by x.fecha), '[]'::jsonb)
    into v_resultado
    from (
      select f.fecha,
             jsonb_build_object(
               'id', f.id,
               'fecha', f.fecha,
               'estado', f.estado,
               'notas', f.notas,
               'motivo_cancelacion', f.motivo_cancelacion,
               'cancelada_en', f.cancelada_en,
               'actualizado_en', f.actualizado_en,
               'plazas_totales', public._plazas_por_fecha(),
               'ocupadas', (select count(*) from public.reservas r
                             where r.fecha_id = f.id and r.estado = 'activa'),
               'total_reservas_historicas', (select count(*) from public.reservas r where r.fecha_id = f.id),
               'reservas', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', r.id,
                          'plaza', r.plaza,
                          'creada_en', r.creada_en,
                          'participante', jsonb_build_object(
                            'id', p.id, 'nombre', p.nombre, 'apellidos', p.apellidos,
                            'email', p.email, 'tiene_cuenta', p.user_id is not null
                          )
                        ) order by r.plaza)
                   from public.reservas r
                   join public.participantes p on p.id = r.participante_id
                  where r.fecha_id = f.id and r.estado = 'activa'
               ), '[]'::jsonb)
             ) as obj
        from public.fechas_bingo f
       where (p_desde is null or f.fecha >= p_desde)
         and (p_hasta is null or f.fecha <= p_hasta)
    ) x;

  return v_resultado;
end;
$$;

create or replace function public.admin_estadisticas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_madrid();
  v     jsonb;
begin
  perform public._exigir_admin();

  select jsonb_build_object(
    'fechas_programadas', (select count(*) from public.fechas_bingo
                            where fecha >= v_hoy and estado <> 'cancelada'),
    'fechas_completas', (select count(*) from public.fechas_bingo
                          where fecha >= v_hoy and estado = 'completa'),
    'fechas_canceladas_futuras', (select count(*) from public.fechas_bingo
                                   where fecha >= v_hoy and estado = 'cancelada'),
    'fechas_pasadas', (select count(*) from public.fechas_bingo
                        where fecha < v_hoy and estado <> 'cancelada'),
    'plazas_totales_futuras', public._plazas_por_fecha() * (select count(*) from public.fechas_bingo
                                                          where fecha >= v_hoy and estado <> 'cancelada'),
    'plazas_ocupadas_futuras', (select count(*) from public.reservas r
                                  join public.fechas_bingo f on f.id = r.fecha_id
                                 where r.estado = 'activa' and f.fecha >= v_hoy
                                   and f.estado <> 'cancelada'),
    'reservas_realizadas', (select count(*) from public.reservas),
    'reservas_activas', (select count(*) from public.reservas where estado = 'activa'),
    'cancelaciones', (select count(*) from public.reservas where estado = 'cancelada'),
    'participantes_activos', (select count(*) from public.participantes where activo),
    'plazas_por_fecha', public._plazas_por_fecha(),
    'administradores', (select count(*) from public.participantes where rol = 'admin' and activo),
    'proxima_fecha', (
      select jsonb_build_object(
               'id', f.id, 'fecha', f.fecha, 'estado', f.estado,
               'ocupadas', (select count(*) from public.reservas r
                             where r.fecha_id = f.id and r.estado = 'activa'))
        from public.fechas_bingo f
       where f.fecha >= v_hoy and f.estado <> 'cancelada'
       order by f.fecha
       limit 1
    )
  ) into v;

  return v;
end;
$$;

create or replace function public.admin_obtener_configuracion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  return (
    select jsonb_build_object(
      'generacion_automatica', generacion_automatica,
      'intervalo_dias', intervalo_dias,
      'fecha_referencia', fecha_referencia,
      'fechas_futuras_minimas', fechas_futuras_minimas,
      'plazas_por_fecha', plazas_por_fecha,
      'actualizado_en', actualizado_en
    )
    from public.configuracion where id
  );
end;
$$;

-- ---------- Nuevas funciones ----------

-- Público: lo que la web necesita saber sin sesión (p. ej. «Cada domingo
-- necesitamos 4 personas»).
create or replace function public.ajustes_publicos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('plazas_por_fecha', public._plazas_por_fecha());
$$;

-- Administración: cambiar el número de plazas por domingo.
--  * Subir: los domingos completos vuelven a tener hueco al momento.
--  * Bajar: solo si ningún domingo futuro tiene más personas apuntadas que
--    el nuevo número (PLAZAS_INSUFICIENTES, detail = 'AAAA-MM-DD|apuntadas').
--    Las plazas se renumeran (1..N) para que no quede nadie fuera del límite.
create or replace function public.admin_cambiar_plazas(p_plazas integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    uuid := public._exigir_admin();
  v_anterior integer;
  v_hoy      date := public.hoy_madrid();
  v_conflicto record;
  v_fecha    record;
  v_res      record;
  i          integer;
begin
  if p_plazas is null or p_plazas not between 1 and 20 then
    raise exception 'DATOS_INVALIDOS' using detail = 'plazas';
  end if;

  -- Bloqueo exclusivo: espera a que terminen las reservas en curso y
  -- frena las nuevas hasta que acabemos (ellas bloquean «for share»).
  select plazas_por_fecha into v_anterior
    from public.configuracion where id
     for update;

  if v_anterior = p_plazas then
    return public.admin_obtener_configuracion();
  end if;

  if p_plazas < v_anterior then
    select f.fecha, count(*) as apuntadas into v_conflicto
      from public.fechas_bingo f
      join public.reservas r on r.fecha_id = f.id and r.estado = 'activa'
     where f.fecha >= v_hoy and f.estado <> 'cancelada'
     group by f.id, f.fecha
    having count(*) > p_plazas
     order by f.fecha
     limit 1;
    if found then
      raise exception 'PLAZAS_INSUFICIENTES'
        using detail = v_conflicto.fecha::text || '|' || v_conflicto.apuntadas::text;
    end if;
  end if;

  update public.configuracion set plazas_por_fecha = p_plazas where id;

  -- Renumerar (de menor a mayor: nunca choca con el índice único) las
  -- plazas de los domingos futuros que se hayan quedado por encima.
  for v_fecha in
    select f.id from public.fechas_bingo f
     where f.fecha >= v_hoy
       and exists (select 1 from public.reservas r
                    where r.fecha_id = f.id and r.estado = 'activa' and r.plaza > p_plazas)
  loop
    i := 0;
    for v_res in
      select id, plaza from public.reservas
       where fecha_id = v_fecha.id and estado = 'activa'
       order by plaza
    loop
      i := i + 1;
      if v_res.plaza <> i then
        update public.reservas set plaza = i where id = v_res.id;
      end if;
    end loop;
  end loop;

  -- Estado COMPLETO / Disponible de todas las fechas con el nuevo número
  -- (también avisa en tiempo real a los navegadores abiertos)
  perform public._recalcular_estado_fecha(id) from public.fechas_bingo;

  insert into public.historial (accion, actor_id, detalles)
  values ('plazas_cambiadas', v_admin,
          jsonb_build_object('antes', v_anterior, 'despues', p_plazas));

  return public.admin_obtener_configuracion();
end;
$$;

-- ---------- Permisos ----------
revoke execute on function public._plazas_por_fecha() from public, anon, authenticated;
revoke execute on function public._tg_reservas_limite_plazas() from public, anon, authenticated;
revoke execute on function public.ajustes_publicos() from public;
revoke execute on function public.admin_cambiar_plazas(integer) from public;
grant execute on function public.ajustes_publicos() to anon, authenticated;
grant execute on function public.admin_cambiar_plazas(integer) to authenticated;

-- ---------- Recalcular el estado de las fechas existentes ----------
-- Con 4 plazas, los domingos que tenían 3 personas dejan de estar completos.
do $$
begin
  perform public._recalcular_estado_fecha(id) from public.fechas_bingo;
end;
$$;
