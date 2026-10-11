-- =====================================================================
-- Reservas de Bingo · 2/3 · Funciones (toda escritura pasa por aquí)
--
-- Convenciones:
--  * SECURITY DEFINER + search_path vacío + nombres totalmente cualificados.
--  * Los errores de negocio se lanzan con un código en MAYÚSCULAS como
--    mensaje (SQLSTATE P0001). El frontend lo traduce a un texto amable.
--  * Las funciones que empiezan por "_" son internas: no se conceden a
--    los roles anon/authenticated (ver 300_seguridad.sql).
-- =====================================================================

-- ---------- Identidad y permisos ----------
create or replace function public.mi_participante_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.participantes where user_id = auth.uid();
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participantes
     where user_id = auth.uid() and rol = 'admin' and activo
  );
$$;

create or replace function public._exigir_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  select id into v_id
    from public.participantes
   where user_id = auth.uid() and rol = 'admin' and activo;
  if v_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;
  return v_id;
end;
$$;

-- ---------- Validación ----------
create or replace function public._validar_nombre(p_valor text, p_campo text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(btrim(coalesce(p_valor, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 2 or char_length(v) > p_max then
    raise exception 'DATOS_INVALIDOS' using detail = p_campo;
  end if;
  -- Letras latinas (incl. tildes, ñ, ç, ü, ª, º), espacios, apóstrofos, guiones, punto y punto volado
  if v !~ '^[A-Za-zÀ-ÖØ-öø-ÿªº'' .·’-]+$' then
    raise exception 'DATOS_INVALIDOS' using detail = p_campo;
  end if;
  return v;
end;
$$;

create or replace function public._validar_texto_corto(p_valor text, p_campo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_valor, '')), '');
begin
  if v is not null and char_length(v) > 200 then
    raise exception 'DATOS_INVALIDOS' using detail = p_campo;
  end if;
  return v;
end;
$$;

-- ---------- Núcleo: crear y cancelar reservas ----------
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
begin
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

  -- 2) Primera plaza libre (1..3). Si no hay, la fecha está completa.
  select p::smallint into v_plaza
    from generate_series(1, 3) as p
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
  --    aunque algo fallase arriba, la base de datos rechazaría una 4.ª plaza
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

create or replace function public._cancelar_reserva(
  p_reserva_id uuid,
  p_actor_id uuid,
  p_motivo text,
  p_es_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_id uuid;
  v_fecha    public.fechas_bingo%rowtype;
  v_res      public.reservas%rowtype;
  v_part     public.participantes%rowtype;
  v_motivo   text := public._validar_texto_corto(p_motivo, 'motivo');
begin
  select fecha_id into v_fecha_id from public.reservas where id = p_reserva_id;
  if v_fecha_id is null then
    raise exception 'RESERVA_NO_ENCONTRADA';
  end if;

  -- Mismo bloqueo que al reservar: la plaza se libera de forma ordenada
  select * into v_fecha from public.fechas_bingo where id = v_fecha_id for update;
  select * into v_res from public.reservas where id = p_reserva_id for update;

  if v_res.fecha_id is distinct from v_fecha_id then
    -- La reserva se movió mientras esperábamos el bloqueo
    raise exception 'REINTENTAR';
  end if;
  if v_res.estado <> 'activa' then
    raise exception 'RESERVA_YA_CANCELADA';
  end if;
  if v_fecha.fecha < public.hoy_madrid() and not p_es_admin then
    raise exception 'FECHA_PASADA';
  end if;

  update public.reservas
     set estado = 'cancelada',
         cancelada_en = now(),
         cancelada_por = p_actor_id,
         motivo_cancelacion = v_motivo
   where id = p_reserva_id;

  select * into v_part from public.participantes where id = v_res.participante_id;

  insert into public.historial (accion, actor_id, participante_id, fecha_id, reserva_id, detalles)
  values (
    'reserva_cancelada', p_actor_id, v_res.participante_id, v_fecha.id, v_res.id,
    jsonb_build_object(
      'fecha', v_fecha.fecha,
      'participante', v_part.nombre || ' ' || v_part.apellidos,
      'motivo', v_motivo,
      'por_admin', p_es_admin and p_actor_id is distinct from v_res.participante_id
    )
  );

  return jsonb_build_object('id', v_res.id, 'fecha_id', v_fecha.id, 'fecha', v_fecha.fecha);
end;
$$;

-- =====================================================================
-- API PÚBLICA (visitantes sin sesión)
-- =====================================================================

-- Próximos domingos con plazas y nombres públicos ("Pedro R.").
-- Si hay sesión, indica además si la persona ya está apuntada.
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
        'plazas_totales', 3,
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

-- =====================================================================
-- API DE PARTICIPANTES (con sesión iniciada)
-- =====================================================================

create or replace function public.mi_perfil()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'nombre', p.nombre,
    'apellidos', p.apellidos,
    'email', p.email,
    'rol', p.rol,
    'activo', p.activo
  )
  from public.participantes p
  where p.user_id = auth.uid();
$$;

create or replace function public.guardar_mi_perfil(p_nombre text, p_apellidos text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_nombre    text;
  v_apellidos text;
  v_email     text;
  v_previo    public.participantes%rowtype;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  v_nombre := public._validar_nombre(p_nombre, 'nombre', 50);
  v_apellidos := public._validar_nombre(p_apellidos, 'apellidos', 80);
  select email into v_email from auth.users where id = v_uid;

  select * into v_previo from public.participantes where user_id = v_uid for update;

  if not found then
    insert into public.participantes (user_id, nombre, apellidos, email)
    values (v_uid, v_nombre, v_apellidos, v_email)
    returning id into v_id;

    insert into public.historial (accion, actor_id, participante_id, detalles)
    values ('perfil_creado', v_id, v_id,
            jsonb_build_object('participante', v_nombre || ' ' || v_apellidos));
  else
    v_id := v_previo.id;
    update public.participantes
       set nombre = v_nombre, apellidos = v_apellidos, email = coalesce(v_email, email)
     where id = v_id;

    if v_previo.nombre <> v_nombre or v_previo.apellidos <> v_apellidos then
      insert into public.historial (accion, actor_id, participante_id, detalles)
      values ('perfil_actualizado', v_id, v_id,
              jsonb_build_object('antes', v_previo.nombre || ' ' || v_previo.apellidos,
                                 'despues', v_nombre || ' ' || v_apellidos));
    end if;
  end if;

  return public.mi_perfil();
end;
$$;

create or replace function public.reservar(p_fecha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  v_pid := public.mi_participante_id();
  if v_pid is null then
    raise exception 'PERFIL_INCOMPLETO';
  end if;
  return public._crear_reserva(v_pid, p_fecha_id, v_pid, false);
end;
$$;

create or replace function public.cancelar_mi_reserva(p_reserva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  v_pid := public.mi_participante_id();
  -- Solo la persona titular: si la reserva es de otra persona respondemos
  -- igual que si no existiera (no revelamos reservas ajenas).
  if v_pid is null or not exists (
    select 1 from public.reservas where id = p_reserva_id and participante_id = v_pid
  ) then
    raise exception 'RESERVA_NO_ENCONTRADA';
  end if;
  return public._cancelar_reserva(p_reserva_id, v_pid, null, false);
end;
$$;

create or replace function public.mis_reservas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'estado', r.estado,
        'plaza', r.plaza,
        'creada_en', r.creada_en,
        'cancelada_en', r.cancelada_en,
        'motivo_cancelacion', r.motivo_cancelacion,
        'fecha', jsonb_build_object(
          'id', f.id, 'fecha', f.fecha, 'estado', f.estado,
          'notas', f.notas, 'motivo_cancelacion', f.motivo_cancelacion
        )
      )
      order by f.fecha desc, r.creada_en desc
    ),
    '[]'::jsonb
  )
  from public.reservas r
  join public.fechas_bingo f on f.id = r.fecha_id
  where r.participante_id = public.mi_participante_id();
$$;

-- Derecho de supresión (RGPD): anonimiza a la persona, libera sus plazas
-- futuras y borra su cuenta de acceso.
create or replace function public.eliminar_mi_cuenta()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_part      public.participantes%rowtype;
  v_res       record;
  v_canceladas integer := 0;
  v_auth_borrada boolean := false;
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  select * into v_part from public.participantes where user_id = v_uid;

  if found then
    if v_part.rol = 'admin' and not exists (
      select 1 from public.participantes
       where rol = 'admin' and activo and user_id is not null and id <> v_part.id
    ) then
      raise exception 'ULTIMO_ADMIN';
    end if;

    for v_res in
      select r.id
        from public.reservas r
        join public.fechas_bingo f on f.id = r.fecha_id
       where r.participante_id = v_part.id
         and r.estado = 'activa'
         and f.fecha >= public.hoy_madrid()
    loop
      perform public._cancelar_reserva(v_res.id, v_part.id, 'Cuenta eliminada', true);
      v_canceladas := v_canceladas + 1;
    end loop;

    update public.participantes
       set nombre = 'Cuenta', apellidos = 'eliminada', email = null,
           user_id = null, activo = false, rol = 'participante'
     where id = v_part.id;

    -- Anonimiza también los nombres guardados en el historial
    update public.historial
       set detalles = detalles - 'participante' - 'antes' - 'despues'
     where participante_id = v_part.id;

    insert into public.historial (accion, actor_id, participante_id, detalles)
    values ('cuenta_eliminada', v_part.id, v_part.id,
            jsonb_build_object('reservas_canceladas', v_canceladas));
  end if;

  begin
    delete from auth.users where id = v_uid;
    v_auth_borrada := true;
  exception when insufficient_privilege then
    -- Si el proyecto no permite borrar desde aquí, el administrador lo
    -- hará en Authentication → Users. Los datos personales ya están anonimizados.
    v_auth_borrada := false;
  end;

  return jsonb_build_object('reservas_canceladas', v_canceladas, 'cuenta_borrada', v_auth_borrada);
end;
$$;

-- =====================================================================
-- API DE ADMINISTRACIÓN (todas empiezan comprobando el rol en el servidor)
-- =====================================================================

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
               'plazas_totales', 3,
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

create or replace function public.admin_crear_fecha(p_fecha date, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_id    uuid;
begin
  if p_fecha is null then
    raise exception 'DATOS_INVALIDOS' using detail = 'fecha';
  end if;

  begin
    insert into public.fechas_bingo (fecha, notas)
    values (p_fecha, public._validar_texto_corto(p_notas, 'notas'))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'FECHA_DUPLICADA';
  end;

  insert into public.historial (accion, actor_id, fecha_id, detalles)
  values ('fecha_creada', v_admin, v_id, jsonb_build_object('fecha', p_fecha));

  return jsonb_build_object('id', v_id, 'fecha', p_fecha);
end;
$$;

create or replace function public.admin_editar_fecha(p_id uuid, p_fecha date, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_prev  public.fechas_bingo%rowtype;
  v_notas text := public._validar_texto_corto(p_notas, 'notas');
begin
  if p_fecha is null then
    raise exception 'DATOS_INVALIDOS' using detail = 'fecha';
  end if;

  select * into v_prev from public.fechas_bingo where id = p_id for update;
  if not found then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;

  begin
    update public.fechas_bingo set fecha = p_fecha, notas = v_notas where id = p_id;
  exception when unique_violation then
    raise exception 'FECHA_DUPLICADA';
  end;

  insert into public.historial (accion, actor_id, fecha_id, detalles)
  values ('fecha_editada', v_admin, p_id,
          jsonb_build_object('fecha_anterior', v_prev.fecha, 'fecha', p_fecha,
                             'notas_anteriores', v_prev.notas, 'notas', v_notas));

  return jsonb_build_object('id', p_id, 'fecha', p_fecha);
end;
$$;

-- Si hay reservas activas y no se confirma, se rechaza con RESERVAS_AFECTADAS
-- (detail = número de reservas) para que la interfaz pida confirmación.
create or replace function public.admin_cancelar_fecha(
  p_id uuid,
  p_motivo text default null,
  p_confirmar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := public._exigir_admin();
  v_fecha   public.fechas_bingo%rowtype;
  v_motivo  text := public._validar_texto_corto(p_motivo, 'motivo');
  v_activas integer;
  v_res     record;
begin
  select * into v_fecha from public.fechas_bingo where id = p_id for update;
  if not found then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;
  if v_fecha.estado = 'cancelada' then
    raise exception 'FECHA_YA_CANCELADA';
  end if;

  select count(*) into v_activas
    from public.reservas where fecha_id = p_id and estado = 'activa';

  if v_activas > 0 and not coalesce(p_confirmar, false) then
    raise exception 'RESERVAS_AFECTADAS' using detail = v_activas::text;
  end if;

  update public.fechas_bingo
     set estado = 'cancelada', cancelada_en = now(), motivo_cancelacion = v_motivo
   where id = p_id;

  for v_res in
    select id from public.reservas where fecha_id = p_id and estado = 'activa'
  loop
    perform public._cancelar_reserva(
      v_res.id, v_admin,
      coalesce('Fecha cancelada: ' || v_motivo, 'Fecha cancelada'),
      true
    );
  end loop;

  insert into public.historial (accion, actor_id, fecha_id, detalles)
  values ('fecha_cancelada', v_admin, p_id,
          jsonb_build_object('fecha', v_fecha.fecha, 'motivo', v_motivo,
                             'reservas_afectadas', v_activas));

  return jsonb_build_object('id', p_id, 'reservas_canceladas', v_activas);
end;
$$;

create or replace function public.admin_reabrir_fecha(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_fecha public.fechas_bingo%rowtype;
begin
  select * into v_fecha from public.fechas_bingo where id = p_id for update;
  if not found then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;
  if v_fecha.estado <> 'cancelada' then
    raise exception 'FECHA_NO_CANCELADA';
  end if;

  update public.fechas_bingo
     set estado = 'abierta', cancelada_en = null, motivo_cancelacion = null
   where id = p_id;
  perform public._recalcular_estado_fecha(p_id);

  insert into public.historial (accion, actor_id, fecha_id, detalles)
  values ('fecha_reabierta', v_admin, p_id, jsonb_build_object('fecha', v_fecha.fecha));

  return jsonb_build_object('id', p_id);
end;
$$;

-- Solo para fechas creadas por error que nunca tuvieron reservas.
create or replace function public.admin_eliminar_fecha(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_fecha public.fechas_bingo%rowtype;
begin
  select * into v_fecha from public.fechas_bingo where id = p_id for update;
  if not found then
    raise exception 'FECHA_NO_ENCONTRADA';
  end if;
  if exists (select 1 from public.reservas where fecha_id = p_id) then
    raise exception 'FECHA_CON_RESERVAS';
  end if;

  insert into public.historial (accion, actor_id, detalles)
  values ('fecha_eliminada', v_admin, jsonb_build_object('fecha', v_fecha.fecha));

  delete from public.fechas_bingo where id = p_id;
  return jsonb_build_object('id', p_id, 'fecha', v_fecha.fecha);
end;
$$;

-- Genera p_cantidad fechas cada p_intervalo días desde p_inicio.
-- Las que ya existen se omiten (nunca se duplican). p_simular = vista previa.
create or replace function public.admin_generar_fechas(
  p_inicio date,
  p_intervalo integer default 14,
  p_cantidad integer default 6,
  p_simular boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    uuid := public._exigir_admin();
  v_creadas  jsonb := '[]'::jsonb;
  v_omitidas jsonb := '[]'::jsonb;
  v_dia      date;
  v_id       uuid;
  i          integer;
begin
  if p_inicio is null
     or p_intervalo is null or p_intervalo not between 1 and 60
     or p_cantidad is null or p_cantidad not between 1 and 52 then
    raise exception 'DATOS_INVALIDOS' using detail = 'generacion';
  end if;

  for i in 0 .. p_cantidad - 1 loop
    v_dia := p_inicio + i * p_intervalo;
    if exists (select 1 from public.fechas_bingo where fecha = v_dia) then
      v_omitidas := v_omitidas || to_jsonb(v_dia);
    elsif p_simular then
      v_creadas := v_creadas || to_jsonb(v_dia);
    else
      insert into public.fechas_bingo (fecha) values (v_dia)
      on conflict (fecha) do nothing
      returning id into v_id;
      if v_id is null then
        v_omitidas := v_omitidas || to_jsonb(v_dia);
      else
        v_creadas := v_creadas || to_jsonb(v_dia);
      end if;
      v_id := null;
    end if;
  end loop;

  if not p_simular and jsonb_array_length(v_creadas) > 0 then
    insert into public.historial (accion, actor_id, detalles)
    values ('fechas_generadas', v_admin,
            jsonb_build_object('creadas', v_creadas, 'omitidas', v_omitidas,
                               'intervalo_dias', p_intervalo));
  end if;

  return jsonb_build_object('creadas', v_creadas, 'omitidas', v_omitidas, 'simulacion', p_simular);
end;
$$;

-- Generación automática: mantiene al menos N fechas futuras, siempre
-- añadiendo DESPUÉS de la última fecha existente. Así nunca recrea una
-- fecha que el administrador haya movido o eliminado a mano.
create or replace function public._asegurar_fechas_futuras(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg     public.configuracion%rowtype;
  v_hoy     date := public.hoy_madrid();
  v_futuras integer;
  v_ultima  date;
  v_sig     date;
  v_creadas jsonb := '[]'::jsonb;
  v_vueltas integer := 0;
begin
  select * into v_cfg from public.configuracion where id;
  if not v_cfg.generacion_automatica then
    return jsonb_build_object('activa', false, 'creadas', v_creadas);
  end if;

  -- Evita que dos ejecuciones simultáneas generen a la vez
  perform pg_advisory_xact_lock(hashtext('bingo_generacion_automatica'));

  loop
    v_vueltas := v_vueltas + 1;
    exit when v_vueltas > 60;

    select count(*), max(fecha) into v_futuras, v_ultima
      from public.fechas_bingo where fecha >= v_hoy;
    exit when v_futuras >= v_cfg.fechas_futuras_minimas;

    if v_ultima is null then
      select max(fecha) into v_ultima from public.fechas_bingo;
    end if;

    if v_ultima is not null then
      v_sig := v_ultima + v_cfg.intervalo_dias;
    elsif v_cfg.fecha_referencia is not null then
      v_sig := v_cfg.fecha_referencia;
    else
      -- Sin referencia: el próximo domingo
      v_sig := v_hoy + ((7 - extract(isodow from v_hoy)::integer) % 7);
    end if;

    while v_sig < v_hoy loop
      v_sig := v_sig + v_cfg.intervalo_dias;
    end loop;

    insert into public.fechas_bingo (fecha) values (v_sig) on conflict (fecha) do nothing;
    v_creadas := v_creadas || to_jsonb(v_sig);
  end loop;

  if jsonb_array_length(v_creadas) > 0 then
    insert into public.historial (accion, actor_id, detalles)
    values ('fechas_generadas', p_actor_id,
            jsonb_build_object('creadas', v_creadas, 'automatica', true));
  end if;

  return jsonb_build_object('activa', true, 'creadas', v_creadas);
end;
$$;

create or replace function public.admin_asegurar_fechas_futuras()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
begin
  return public._asegurar_fechas_futuras(v_admin);
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
      'actualizado_en', actualizado_en
    )
    from public.configuracion where id
  );
end;
$$;

create or replace function public.admin_guardar_configuracion(
  p_generacion_automatica boolean,
  p_intervalo_dias integer,
  p_fecha_referencia date,
  p_fechas_futuras_minimas integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_gen   jsonb;
begin
  if p_intervalo_dias is null or p_intervalo_dias not between 1 and 60
     or p_fechas_futuras_minimas is null or p_fechas_futuras_minimas not between 1 and 26 then
    raise exception 'DATOS_INVALIDOS' using detail = 'configuracion';
  end if;

  update public.configuracion
     set generacion_automatica = coalesce(p_generacion_automatica, false),
         intervalo_dias = p_intervalo_dias,
         fecha_referencia = p_fecha_referencia,
         fechas_futuras_minimas = p_fechas_futuras_minimas
   where id;

  insert into public.historial (accion, actor_id, detalles)
  values ('configuracion_actualizada', v_admin,
          jsonb_build_object('generacion_automatica', p_generacion_automatica,
                             'intervalo_dias', p_intervalo_dias,
                             'fecha_referencia', p_fecha_referencia,
                             'fechas_futuras_minimas', p_fechas_futuras_minimas));

  v_gen := public._asegurar_fechas_futuras(v_admin);
  return public.admin_obtener_configuracion() || jsonb_build_object('generadas', v_gen -> 'creadas');
end;
$$;

-- ---------- Reservas (administración) ----------
create or replace function public.admin_reservar_para(p_participante_id uuid, p_fecha_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
begin
  return public._crear_reserva(p_participante_id, p_fecha_id, v_admin, true);
end;
$$;

create or replace function public.admin_cancelar_reserva(p_reserva_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
begin
  return public._cancelar_reserva(p_reserva_id, v_admin, p_motivo, true);
end;
$$;

-- Mueve una reserva activa a otra fecha de forma atómica.
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
begin
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
    from generate_series(1, 3) as p
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

create or replace function public.admin_listar_reservas(
  p_estado text default null,
  p_desde date default null,
  p_hasta date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  return coalesce((
    select jsonb_agg(x.obj order by x.fecha desc, x.creada_en desc)
      from (
        select f.fecha, r.creada_en,
               jsonb_build_object(
                 'id', r.id,
                 'estado', r.estado,
                 'plaza', r.plaza,
                 'creada_en', r.creada_en,
                 'cancelada_en', r.cancelada_en,
                 'motivo_cancelacion', r.motivo_cancelacion,
                 'fecha', jsonb_build_object('id', f.id, 'fecha', f.fecha, 'estado', f.estado),
                 'participante', jsonb_build_object(
                   'id', p.id, 'nombre', p.nombre, 'apellidos', p.apellidos, 'email', p.email
                 )
               ) as obj
          from public.reservas r
          join public.fechas_bingo f on f.id = r.fecha_id
          join public.participantes p on p.id = r.participante_id
         where (p_estado is null or r.estado::text = p_estado)
           and (p_desde is null or f.fecha >= p_desde)
           and (p_hasta is null or f.fecha <= p_hasta)
         order by f.fecha desc, r.creada_en desc
         limit 2000
      ) x
  ), '[]'::jsonb);
end;
$$;

-- ---------- Participantes (administración) ----------
create or replace function public.admin_listar_participantes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'nombre', p.nombre,
               'apellidos', p.apellidos,
               'email', p.email,
               'rol', p.rol,
               'activo', p.activo,
               'tiene_cuenta', p.user_id is not null,
               'creado_en', p.creado_en,
               'reservas_futuras', (
                 select count(*) from public.reservas r
                   join public.fechas_bingo f on f.id = r.fecha_id
                  where r.participante_id = p.id and r.estado = 'activa'
                    and f.fecha >= public.hoy_madrid()
               ),
               'reservas_totales', (
                 select count(*) from public.reservas r
                  where r.participante_id = p.id and r.estado = 'activa'
               )
             )
             order by p.activo desc, p.nombre, p.apellidos
           )
      from public.participantes p
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_crear_participante(p_nombre text, p_apellidos text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin     uuid := public._exigir_admin();
  v_nombre    text := public._validar_nombre(p_nombre, 'nombre', 50);
  v_apellidos text := public._validar_nombre(p_apellidos, 'apellidos', 80);
  v_id        uuid;
begin
  insert into public.participantes (nombre, apellidos)
  values (v_nombre, v_apellidos)
  returning id into v_id;

  insert into public.historial (accion, actor_id, participante_id, detalles)
  values ('participante_creado', v_admin, v_id,
          jsonb_build_object('participante', v_nombre || ' ' || v_apellidos));

  return jsonb_build_object('id', v_id, 'nombre', v_nombre, 'apellidos', v_apellidos);
end;
$$;

create or replace function public.admin_editar_participante(
  p_id uuid,
  p_nombre text,
  p_apellidos text,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin     uuid := public._exigir_admin();
  v_nombre    text := public._validar_nombre(p_nombre, 'nombre', 50);
  v_apellidos text := public._validar_nombre(p_apellidos, 'apellidos', 80);
  v_prev      public.participantes%rowtype;
begin
  select * into v_prev from public.participantes where id = p_id for update;
  if not found then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if p_id = v_admin and not coalesce(p_activo, true) then
    raise exception 'NO_PUEDES_BLOQUEARTE';
  end if;

  update public.participantes
     set nombre = v_nombre, apellidos = v_apellidos, activo = coalesce(p_activo, activo)
   where id = p_id;

  insert into public.historial (accion, actor_id, participante_id, detalles)
  values ('participante_editado', v_admin, p_id,
          jsonb_build_object('antes', v_prev.nombre || ' ' || v_prev.apellidos,
                             'despues', v_nombre || ' ' || v_apellidos,
                             'activo_antes', v_prev.activo, 'activo', coalesce(p_activo, v_prev.activo)));

  return jsonb_build_object('id', p_id);
end;
$$;

create or replace function public.admin_cambiar_rol(p_id uuid, p_rol public.rol_participante)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public._exigir_admin();
  v_part  public.participantes%rowtype;
begin
  -- Serializa los cambios de rol para que nunca quede el sistema sin administradores
  perform pg_advisory_xact_lock(hashtext('bingo_cambio_rol'));

  select * into v_part from public.participantes where id = p_id for update;
  if not found then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if p_rol = 'admin' and (v_part.user_id is null or not v_part.activo) then
    raise exception 'SIN_CUENTA';
  end if;
  if p_rol = 'participante' and v_part.rol = 'admin' and not exists (
    select 1 from public.participantes
     where rol = 'admin' and activo and user_id is not null and id <> p_id
  ) then
    raise exception 'ULTIMO_ADMIN';
  end if;

  update public.participantes set rol = p_rol where id = p_id;

  insert into public.historial (accion, actor_id, participante_id, detalles)
  values ('rol_cambiado', v_admin, p_id,
          jsonb_build_object('participante', v_part.nombre || ' ' || v_part.apellidos,
                             'antes', v_part.rol, 'despues', p_rol));

  return jsonb_build_object('id', p_id, 'rol', p_rol);
end;
$$;

-- ---------- Historial y estadísticas ----------
create or replace function public.admin_historial(p_limite integer default 100, p_antes_de bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._exigir_admin();
  return coalesce((
    select jsonb_agg(x.obj order by x.id desc)
      from (
        select h.id,
               jsonb_build_object(
                 'id', h.id,
                 'ocurrido_en', h.ocurrido_en,
                 'accion', h.accion,
                 'actor', case when a.id is null then null
                               else a.nombre || ' ' || a.apellidos end,
                 'fecha', f.fecha,
                 'detalles', h.detalles
               ) as obj
          from public.historial h
          left join public.participantes a on a.id = h.actor_id
          left join public.fechas_bingo f on f.id = h.fecha_id
         where (p_antes_de is null or h.id < p_antes_de)
         order by h.id desc
         limit least(greatest(coalesce(p_limite, 100), 1), 500)
      ) x
  ), '[]'::jsonb);
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
    'plazas_totales_futuras', 3 * (select count(*) from public.fechas_bingo
                                    where fecha >= v_hoy and estado <> 'cancelada'),
    'plazas_ocupadas_futuras', (select count(*) from public.reservas r
                                  join public.fechas_bingo f on f.id = r.fecha_id
                                 where r.estado = 'activa' and f.fecha >= v_hoy
                                   and f.estado <> 'cancelada'),
    'reservas_realizadas', (select count(*) from public.reservas),
    'reservas_activas', (select count(*) from public.reservas where estado = 'activa'),
    'cancelaciones', (select count(*) from public.reservas where estado = 'cancelada'),
    'participantes_activos', (select count(*) from public.participantes where activo),
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
