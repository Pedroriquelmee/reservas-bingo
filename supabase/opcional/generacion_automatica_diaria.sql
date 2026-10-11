-- =====================================================================
-- OPCIONAL · Generación automática diaria con pg_cron
--
-- Solo tiene efecto si en el panel (Ajustes) está activada la
-- "Generación automática". Sin este archivo, la generación automática se
-- ejecuta igualmente al guardar los ajustes y cada vez que un
-- administrador abre el panel.
--
-- Requisito previo: Database → Extensions → activar "pg_cron".
-- =====================================================================

create extension if not exists pg_cron;

-- Todos los días a las 03:00 UTC
select cron.schedule(
  'bingo-generar-fechas',
  '0 3 * * *',
  $$ select public._asegurar_fechas_futuras(null); $$
);

-- Para comprobarlo:   select * from cron.job;
-- Para desactivarlo:  select cron.unschedule('bingo-generar-fechas');
