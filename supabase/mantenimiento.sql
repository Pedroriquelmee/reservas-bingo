-- =====================================================================
-- Consultas de mantenimiento (Supabase → SQL Editor). Ejecuta cada bloque
-- por separado según lo necesites.
-- =====================================================================

-- 1) Comprobación de integridad: debe devolver 0 filas.
select f.fecha, count(*) as activas
  from public.reservas r
  join public.fechas_bingo f on f.id = r.fecha_id
 where r.estado = 'activa'
 group by f.fecha
having count(*) > 3;

-- 2) Estado coherente de las fechas: debe devolver 0 filas.
select f.fecha, f.estado, count(r.id) filter (where r.estado = 'activa') as activas
  from public.fechas_bingo f
  left join public.reservas r on r.fecha_id = f.id
 group by f.id
having (f.estado = 'completa') <> (count(r.id) filter (where r.estado = 'activa') >= 3)
   and f.estado <> 'cancelada';

-- 3) Protección de datos: quitar nombres del historial de más de 12 meses.
--    (Las reservas antiguas se conservan para las estadísticas.)
update public.historial
   set detalles = detalles - 'participante' - 'antes' - 'despues'
 where ocurrido_en < now() - interval '12 months'
   and (detalles ? 'participante' or detalles ? 'antes');

-- 4) Personas sin cuenta ni reservas en el último año (candidatas a borrar).
select p.id, p.nombre, p.apellidos, p.creado_en
  from public.participantes p
 where p.user_id is null
   and not exists (
     select 1 from public.reservas r join public.fechas_bingo f on f.id = r.fecha_id
      where r.participante_id = p.id and f.fecha > current_date - 365
   );

-- 5) Tamaño de la base de datos (el plan gratuito incluye 500 MB).
select pg_size_pretty(pg_database_size(current_database())) as tamano;

-- 6) Revisar que nadie haya expuesto funciones nuevas sin querer:
--    solo debe aparecer calendario_publico para anon.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
 where has_function_privilege('anon', p.oid, 'execute');
