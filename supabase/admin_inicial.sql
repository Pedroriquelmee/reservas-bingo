-- =====================================================================
-- Nombrar al PRIMER administrador (solo una vez).
--
-- 1. Entra en la web con tu correo y completa nombre y apellidos
--    (por ejemplo desde https://reservas.pedroriquelme.tech/acceso).
-- 2. Cambia TU_CORREO por ese correo y ejecuta esto en Supabase → SQL Editor.
-- 3. Los siguientes administradores se nombran desde el propio panel
--    (Participantes → «Hacer admin»).
-- =====================================================================

update public.participantes
   set rol = 'admin'
 where email = lower('TU_CORREO@ejemplo.com')
   and user_id is not null;

-- Comprobación: debe aparecer tu nombre
select nombre, apellidos, email, rol, activo
  from public.participantes
 where rol = 'admin';
