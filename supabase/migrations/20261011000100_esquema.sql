-- =====================================================================
-- Reservas de Bingo · 1/3 · Esquema (tipos, tablas, índices, triggers)
-- Ejecutar en orden: 100_esquema → 200_funciones → 300_seguridad
-- =====================================================================

-- ---------- Tipos ----------
create type public.estado_fecha as enum ('abierta', 'completa', 'cancelada');
create type public.estado_reserva as enum ('activa', 'cancelada');
create type public.rol_participante as enum ('participante', 'admin');

-- ---------- Participantes ----------
-- Un participante puede tener cuenta (user_id) o haber sido creado por
-- un administrador sin cuenta (p. ej. alguien que no usa el correo).
create table public.participantes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete set null,
  nombre          text not null check (char_length(nombre) between 1 and 50),
  apellidos       text not null check (char_length(apellidos) between 1 and 80),
  email           text,
  rol             public.rol_participante not null default 'participante',
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.participantes is 'Personas que ayudan en el bingo. user_id enlaza con Supabase Auth (una identidad por cuenta).';

-- ---------- Fechas de bingo ----------
create table public.fechas_bingo (
  id                  uuid primary key default gen_random_uuid(),
  fecha               date not null,
  estado              public.estado_fecha not null default 'abierta',
  notas               text check (notas is null or char_length(notas) <= 200),
  motivo_cancelacion  text check (motivo_cancelacion is null or char_length(motivo_cancelacion) <= 200),
  cancelada_en        timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  -- Una sola fila por día: impide fechas duplicadas
  constraint fechas_bingo_fecha_unica unique (fecha),
  constraint fechas_bingo_cancelacion_coherente
    check ((estado = 'cancelada') = (cancelada_en is not null))
);

comment on column public.fechas_bingo.estado is 'abierta/completa se recalculan automáticamente a partir de las reservas activas; cancelada la fija un administrador.';

-- ---------- Reservas ----------
create table public.reservas (
  id                  uuid primary key default gen_random_uuid(),
  participante_id     uuid not null references public.participantes (id) on delete restrict,
  fecha_id            uuid not null references public.fechas_bingo (id) on delete restrict,
  -- Número de plaza (1, 2 o 3). Junto con el índice único parcial de abajo,
  -- hace IMPOSIBLE a nivel de base de datos que haya más de 3 reservas activas.
  plaza               smallint not null check (plaza between 1 and 3),
  estado              public.estado_reserva not null default 'activa',
  creada_en           timestamptz not null default now(),
  creada_por          uuid references public.participantes (id) on delete set null,
  cancelada_en        timestamptz,
  cancelada_por       uuid references public.participantes (id) on delete set null,
  motivo_cancelacion  text check (motivo_cancelacion is null or char_length(motivo_cancelacion) <= 200),
  constraint reservas_cancelacion_coherente
    check ((estado = 'cancelada') = (cancelada_en is not null))
);

-- Una persona no puede tener dos reservas activas el mismo domingo
create unique index reservas_una_por_persona_y_fecha
  on public.reservas (participante_id, fecha_id) where estado = 'activa';

-- Cada plaza (1..3) solo puede estar ocupada una vez por fecha → máximo 3
create unique index reservas_plaza_unica
  on public.reservas (fecha_id, plaza) where estado = 'activa';

create index reservas_fecha_idx on public.reservas (fecha_id);
create index reservas_participante_idx on public.reservas (participante_id);

-- ---------- Historial (auditoría) ----------
create table public.historial (
  id               bigint generated always as identity primary key,
  ocurrido_en      timestamptz not null default now(),
  accion           text not null,
  actor_id         uuid references public.participantes (id) on delete set null,
  participante_id  uuid references public.participantes (id) on delete set null,
  fecha_id         uuid references public.fechas_bingo (id) on delete set null,
  reserva_id       uuid references public.reservas (id) on delete set null,
  detalles         jsonb not null default '{}'::jsonb
);

create index historial_ocurrido_idx on public.historial (ocurrido_en desc);
create index historial_fecha_idx on public.historial (fecha_id);

-- ---------- Configuración (fila única) ----------
create table public.configuracion (
  id                       boolean primary key default true check (id),
  generacion_automatica    boolean not null default false,
  intervalo_dias           integer not null default 14 check (intervalo_dias between 1 and 60),
  fecha_referencia         date,
  fechas_futuras_minimas   integer not null default 6 check (fechas_futuras_minimas between 1 and 26),
  actualizado_en           timestamptz not null default now()
);

insert into public.configuracion default values;

-- ---------- Utilidades ----------
create or replace function public.hoy_madrid()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

create or replace function public._nombre_publico(p_nombre text, p_apellidos text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Lo que ve cualquier visitante: nombre + inicial del primer apellido ("Pedro R.")
  select p_nombre || coalesce(' ' || upper(left(nullif(btrim(p_apellidos), ''), 1)) || '.', '');
$$;

-- ---------- Triggers ----------
create or replace function public._tg_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger participantes_actualizado_en
  before update on public.participantes
  for each row execute function public._tg_actualizado_en();

create trigger fechas_bingo_actualizado_en
  before update on public.fechas_bingo
  for each row execute function public._tg_actualizado_en();

create trigger configuracion_actualizado_en
  before update on public.configuracion
  for each row execute function public._tg_actualizado_en();

-- Recalcula abierta/completa a partir de las reservas activas.
-- Siempre toca la fila de la fecha → genera un evento de tiempo real.
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
                    when v_ocupadas >= 3 then 'completa'::public.estado_fecha
                    else 'abierta'::public.estado_fecha
                  end
   where id = p_fecha_id;
end;
$$;

create or replace function public._tg_reservas_sincronizar_fecha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public._recalcular_estado_fecha(new.fecha_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.fecha_id is distinct from new.fecha_id) then
    perform public._recalcular_estado_fecha(old.fecha_id);
  end if;
  return null;
end;
$$;

create trigger reservas_sincronizar_fecha
  after insert or update or delete on public.reservas
  for each row execute function public._tg_reservas_sincronizar_fecha();
