-- =====================================================================
-- Reservas de Bingo · 3/3 · Seguridad: RLS, permisos y tiempo real
--
-- Modelo:
--  * Nadie (anon/authenticated) puede escribir directamente en las tablas.
--    Toda escritura pasa por funciones que validan permisos en el servidor.
--  * Lectura directa mínima y protegida por Row Level Security:
--      fechas_bingo  → pública (necesaria para el tiempo real)
--      participantes → cada persona solo su fila; admin todas
--      reservas      → cada persona solo las suyas; admin todas
--      historial / configuracion → solo administradores
-- =====================================================================

-- ---------- Row Level Security en todas las tablas ----------
alter table public.participantes  enable row level security;
alter table public.fechas_bingo   enable row level security;
alter table public.reservas       enable row level security;
alter table public.historial      enable row level security;
alter table public.configuracion  enable row level security;

create policy "fechas visibles para todos"
  on public.fechas_bingo for select
  to anon, authenticated
  using (true);

create policy "cada persona ve su ficha; admin ve todas"
  on public.participantes for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.es_admin()));

create policy "cada persona ve sus reservas; admin ve todas"
  on public.reservas for select
  to authenticated
  using (participante_id = (select public.mi_participante_id()) or (select public.es_admin()));

create policy "historial solo admin"
  on public.historial for select
  to authenticated
  using ((select public.es_admin()));

create policy "configuracion solo admin"
  on public.configuracion for select
  to authenticated
  using ((select public.es_admin()));

-- ---------- Privilegios de tabla ----------
-- Supabase concede por defecto todos los privilegios a anon/authenticated
-- sobre las tablas nuevas de "public". Los retiramos y damos solo lectura.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.fechas_bingo to anon, authenticated;
grant select on public.participantes, public.reservas, public.historial, public.configuracion to authenticated;

-- ---------- Privilegios de funciones ----------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas dentro de las políticas RLS
grant execute on function public.es_admin() to authenticated;
grant execute on function public.mi_participante_id() to authenticated;

-- Visitantes (y también usuarios con sesión)
grant execute on function public.calendario_publico() to anon, authenticated;

-- Participantes con sesión
grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.guardar_mi_perfil(text, text) to authenticated;
grant execute on function public.reservar(uuid) to authenticated;
grant execute on function public.cancelar_mi_reserva(uuid) to authenticated;
grant execute on function public.mis_reservas() to authenticated;
grant execute on function public.eliminar_mi_cuenta() to authenticated;

-- Administración (la función comprueba el rol en el servidor; el grant
-- solo permite llamarla, no saltarse esa comprobación)
grant execute on function public.admin_calendario(date, date) to authenticated;
grant execute on function public.admin_crear_fecha(date, text) to authenticated;
grant execute on function public.admin_editar_fecha(uuid, date, text) to authenticated;
grant execute on function public.admin_cancelar_fecha(uuid, text, boolean) to authenticated;
grant execute on function public.admin_reabrir_fecha(uuid) to authenticated;
grant execute on function public.admin_eliminar_fecha(uuid) to authenticated;
grant execute on function public.admin_generar_fechas(date, integer, integer, boolean) to authenticated;
grant execute on function public.admin_asegurar_fechas_futuras() to authenticated;
grant execute on function public.admin_obtener_configuracion() to authenticated;
grant execute on function public.admin_guardar_configuracion(boolean, integer, date, integer) to authenticated;
grant execute on function public.admin_reservar_para(uuid, uuid) to authenticated;
grant execute on function public.admin_cancelar_reserva(uuid, text) to authenticated;
grant execute on function public.admin_mover_reserva(uuid, uuid) to authenticated;
grant execute on function public.admin_listar_reservas(text, date, date) to authenticated;
grant execute on function public.admin_listar_participantes() to authenticated;
grant execute on function public.admin_crear_participante(text, text) to authenticated;
grant execute on function public.admin_editar_participante(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_cambiar_rol(uuid, public.rol_participante) to authenticated;
grant execute on function public.admin_historial(integer, bigint) to authenticated;
grant execute on function public.admin_estadisticas() to authenticated;

-- Las funciones internas (_crear_reserva, _cancelar_reserva,
-- _asegurar_fechas_futuras, _recalcular_estado_fecha, ...) quedan sin
-- grant: solo pueden ejecutarse desde otras funciones o como postgres.

-- Seguro por defecto: lo que se cree en el futuro en "public" no quedará
-- expuesto automáticamente a anon/authenticated (habrá que concederlo a mano).
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- ---------- Tiempo real ----------
-- Cada cambio de reservas actualiza la fila de su fecha (trigger), así que
-- basta con publicar fechas_bingo para que todos los navegadores se enteren.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fechas_bingo'
     ) then
    alter publication supabase_realtime add table public.fechas_bingo;
  end if;
end;
$$;
