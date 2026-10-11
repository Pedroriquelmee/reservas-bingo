# Guía de mantenimiento básico

## Rutina

| Cuándo | Qué | Cómo |
|---|---|---|
| Cada mes | Copia de las reservas | Panel → Reservas → filtro «Todas» → **Exportar CSV** (se abre en Excel). |
| Cada mes | Revisar que todo cuadra | Ejecuta los bloques 1 y 2 de `supabase/mantenimiento.sql`: deben devolver 0 filas. |
| Cada 3 meses | Copia completa de la base de datos | Ver «Copias de seguridad» abajo. |
| Cada 3 meses | Actualizar dependencias | `npm outdated` → `npm update` → `npm run test:todo` → `npm run test:e2e` → push. |
| Cada año | Protección de datos | Bloque 3 de `mantenimiento.sql` (anonimizar historial > 12 meses) y revisar personas sin actividad (bloque 4). |
| Siempre | Antes de cada cambio | Las pruebas de GitHub Actions deben estar en verde antes de dar algo por bueno. |

## Plan gratuito de Supabase: pausa por inactividad

Supabase pausa los proyectos gratuitos tras **una semana** sin actividad suficiente (te avisa por correo). Para evitarlo:

1. GitHub → tu repositorio → **Settings → Secrets and variables → Actions → New repository secret**: crea `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` (los mismos valores que en Vercel).
2. El flujo **Mantener Supabase activo** hará una consulta cada 3 días. Puedes lanzarlo a mano en *Actions → Mantener Supabase activo → Run workflow* para comprobarlo.

Si aun así se pausa: Supabase → el proyecto → **Resume project**. Vuelve con todos los datos (hay un plazo para restaurarlo; no lo dejes meses pausado). Mientras está pausado la web muestra «No se han podido cargar las fechas».

Si el bingo crece o los datos son importantes, el plan **Pro** (desde 25 $/mes) elimina las pausas y añade copias diarias.

## Copias de seguridad

El plan gratuito **no hace copias automáticas**. Copia completa con `pg_dump` (instalado con `brew install postgresql@17`):

1. Supabase → botón **Connect** → copia la cadena de conexión *Session pooler* (incluye tu contraseña de la base de datos).
2. En la Terminal:

```bash
pg_dump "CADENA_DE_CONEXION" --schema=public --no-owner --no-privileges -f copia-bingo-$(date +%F).sql
```

Guarda el archivo en un sitio privado: contiene datos personales. Este archivo sirve para consultar o recuperar datos concretos. Una restauración completa en otro proyecto necesita también las cuentas de acceso (esquema `auth`); para eso sigue la guía oficial de Supabase *Backup and Restore using the CLI* (`npx supabase db dump`, que copia roles, esquema y datos por separado).

## Tareas habituales

**Nombrar o quitar administradores**: Panel → Participantes → «Hacer admin» / «Quitar admin». El sistema impide quedarse sin ninguno.

**Alguien no puede entrar**: que mire Spam; que espere 1 minuto entre códigos; comprueba en Resend → *Emails* si el correo salió; en Supabase → *Authentication → Users* si existe la cuenta.

**Alguien hace mal uso**: Panel → Participantes → Editar → desmarcar «Cuenta activa» (no podrá reservar) y cancelar sus reservas desde Fechas.

**Borrar a una persona por completo** (si lo pide y no puede hacerlo ella): Supabase → *Authentication → Users* → borrar el usuario; su ficha queda sin cuenta. Para anonimizarla, edita su nombre en el panel.

**Cambiar el texto de la página o de los correos**: los textos están en `src/paginas/*.tsx`, `src/components/*.tsx` y `supabase/plantillas-email/codigo-acceso.html` (esta última se pega de nuevo en Supabase).

**Cambiar el número de plazas (3)**: está fijado a propósito en la base de datos. Habría que crear una migración nueva que cambie el `check (plaza between 1 and 3)`, el `generate_series(1, 3)` de `_crear_reserva` y `admin_mover_reserva`, el `>= 3` de `_recalcular_estado_fecha` y los `3` de `calendario_publico`, `admin_calendario` y `admin_estadisticas`; después, ajustar las pruebas.

## Hacer cambios en la base de datos

1. Nunca edites las migraciones ya aplicadas: crea un archivo nuevo en `supabase/migrations/` con fecha posterior (p. ej. `20270101000100_cambio.sql`).
2. Si creas una función nueva, por seguridad **no** se concede automáticamente: añade su `grant execute … to authenticated` (o `anon`) explícito.
3. Añade o ajusta las pruebas en `tests/db/` y ejecútalas (`npm run test:db`).
4. Aplica la migración en Supabase (SQL Editor) y comprueba con el bloque 6 de `mantenimiento.sql` que solo `calendario_publico` es accesible para visitantes.

## Claves y credenciales

- **Clave publicable** expuesta o rotada: Supabase → *API Keys* → crea otra, cámbiala en Vercel y en los secretos de GitHub, *Redeploy* y desactiva la antigua.
- **Secret key**: no la usa este proyecto. Si se filtrara, rótala inmediatamente.
- **API key de Resend**: si se filtra, revócala en Resend, crea otra y actualízala en *Supabase → SMTP Settings*.
- **Contraseña de la base de datos**: *Project Settings → Database → Reset database password*.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| «Email address not authorized» o no llega ningún correo | SMTP propio sin configurar | Paso 5 de [03-puesta-en-marcha.md](03-puesta-en-marcha.md). |
| «Has pedido varios códigos seguidos» | Límite de 1 código/minuto o del total por hora | Esperar; o subir *Authentication → Rate Limits*. |
| El botón del correo lleva a otra dirección | *Site URL* mal puesta | *Authentication → URL Configuration*. |
| «No se han podido cargar las fechas» | Proyecto de Supabase pausado o variables de Vercel mal | Reanudar el proyecto; revisar variables y *Redeploy*. |
| Vercel: *Invalid Configuration* | CNAME mal escrito, otro registro con host `reservas`, o DNS en otro proveedor | Revisar la zona en Dondominio; `dig +short reservas.pedroriquelme.tech CNAME`. |
| Aviso de certificado | DNS aún sin propagar o CAA que no permite Let's Encrypt | Esperar; revisar registros CAA. |
| No se actualiza en tiempo real | Publicación de Realtime sin la tabla | Ejecutar de nuevo el bloque final de la migración 300. La web sigue funcionando (refresca cada 30 s). |
| Error de CSP en la consola tras cambiar el dominio de Supabase | `connect-src` de `vercel.json` | Añadir el nuevo dominio a la CSP y desplegar. |
