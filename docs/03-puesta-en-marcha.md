# Fases 3-5 · Crear y configurar el proyecto

> Los pasos marcados con 🔑 requieren que entres tú en una cuenta externa. No hay ninguna credencial inventada en el proyecto: todas las claves las generas tú y van en variables de entorno.
>
> Los nombres de menús son los de los paneles en octubre de 2026; pueden cambiar ligeramente.

## 0. Requisitos

- Node.js **22 LTS** (mínimo 20.19) y Git en tu Mac: `node -v`, `git -v`.
- Cuentas gratuitas: GitHub, [Supabase](https://supabase.com), [Vercel](https://vercel.com) y [Resend](https://resend.com).
- Acceso al panel de Dondominio (para los registros DNS).

> ¿Quieres verla funcionando antes de crear nada? `npm ci` y `npm run demo` (ver el README).

## 1. 🔑 Crear el proyecto de Supabase

1. Supabase → **New project**.
2. Nombre: `reservas-bingo`. **Región: una de la UE** (p. ej. *West EU (Paris)* o *Central EU (Frankfurt)*), por protección de datos.
3. Genera la contraseña de la base de datos y guárdala en tu gestor de contraseñas (solo la necesitarás para copias con `pg_dump`).
4. Deja activadas las opciones por defecto de *Data API*.

## 2. 🔑 Crear la base de datos

Supabase → **SQL Editor** → **New query**. Pega y ejecuta, **uno a uno y en orden**, el contenido de:

1. `supabase/migrations/20261011000100_esquema.sql`
2. `supabase/migrations/20261011000200_funciones.sql`
3. `supabase/migrations/20261011000300_seguridad.sql`

Cada uno debe terminar con *Success. No rows returned*. Comprobación rápida (nueva consulta):

```sql
select public.calendario_publico();            -- debe devolver []
select count(*) from public.configuracion;     -- debe devolver 1
```

> Alternativa con la CLI de Supabase (si la usas): `npx supabase link --project-ref TU_REF` y `npx supabase db push`.

## 3. 🔑 Copiar la URL y la clave publicable

- **Project Settings → Data API** → *Project URL* → será `VITE_SUPABASE_URL`.
- **Project Settings → API Keys** → *Publishable key* (`sb_publishable_…`) → será `VITE_SUPABASE_PUBLISHABLE_KEY`.

⚠️ La *secret key* (o la antigua *service_role*) **no se usa en ningún sitio** de este proyecto. No la copies en la web ni en Vercel.

## 4. 🔑 Configurar el inicio de sesión (Supabase Auth)

**Authentication → Sign In / Providers → Email**

- *Enable Email provider*: activado.
- *Allow new users to sign up*: activado (elegiste «cualquiera con el enlace»).
- *Confirm email*: activado.
- *Email OTP Expiration*: 3600 s (por defecto). *Email OTP Length*: 6 (la web acepta de 6 a 10 cifras).

**Authentication → URL Configuration**

- *Site URL*: `https://reservas.pedroriquelme.tech`
- *Redirect URLs*: añade `https://reservas.pedroriquelme.tech/**` y `http://localhost:5173/**`

**Authentication → Emails → Templates** (requiere el SMTP propio del paso 5)

En **Magic link** y en **Confirm signup** (las dos: la primera vez que alguien entra, Supabase usa la de alta):

- *Subject*: `Tu código de acceso: {{ .Token }} · Reservas de Bingo Alba 601`
- *Body*: el contenido de `supabase/plantillas-email/codigo-acceso.html`

El correo incluye el código de 6 cifras y un botón que abre `…/auth/confirmar`. El enlace pide un clic antes de usarse, porque algunos antivirus de correo «visitan» los enlaces y podrían gastarlo.

## 5. 🔑 Correo con tu dominio (Resend)

El servidor de correo de serie de Supabase **solo envía a los miembros de tu equipo** y con un límite muy bajo. Para que llegue a cualquiera:

1. Resend → **Domains → Add domain** → `pedroriquelme.tech` (región UE si te deja elegir).
2. Resend te mostrará 3 o 4 registros DNS (normalmente un TXT `resend._domainkey`, un MX y un TXT en `send`, y opcionalmente DMARC). Créalos en **Dondominio → Dominios → Gestionar dominio → Zona DNS → NUEVA** copiando *tipo*, *host* y *valor* exactamente como los muestra Resend (en *Host* va solo la parte antes del dominio, p. ej. `send` o `resend._domainkey`). No tocan el correo que ya tengas en el dominio raíz.
3. Espera a que Resend marque el dominio como **Verified**.
4. Resend → **API Keys → Create** → permiso *Sending access*, limitado a `pedroriquelme.tech`. Cópiala (solo se muestra una vez).
5. Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*:

| Campo | Valor |
|---|---|
| Sender email | `reservas@pedroriquelme.tech` |
| Sender name | `Reservas de Bingo · Alba 601` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la API key de Resend |

6. **Authentication → Rate Limits**: deja el límite de correos en 30/hora (suficiente) o súbelo si hay muchas altas el mismo día.

## 6. Probar en tu ordenador

```bash
git clone <tu repositorio>   # o descomprime el zip
cd reservas-bingo
npm ci
cp .env.example .env.local   # y rellena las dos variables de Supabase y las de privacidad
npm run dev
```

Abre <http://localhost:5173>. Para entrar en local usa el **código** del correo (el botón del correo apunta siempre al dominio de producción).

## 7. 🔑 Nombrar al primer administrador

1. Entra en la web (local o producción) con tu correo y escribe tu nombre y apellidos.
2. Edita `supabase/admin_inicial.sql`, pon tu correo y ejecútalo en el SQL Editor.
3. Entra en `/admin` (enlace «Administración» al pie de la página). Los siguientes administradores se nombran desde **Participantes → Hacer admin**.

## 8. Crear las primeras fechas

En **/admin → Fechas → Generar fechas**: primera fecha = el próximo domingo de bingo, «Cada 14 días», número de fechas = 6 → *Ver vista previa* → *Crear*.

Si prefieres que se mantengan solas: **Ajustes → Activar la generación automática** (mantiene siempre N domingos futuros, añadiendo después del último existente, sin rehacer los que hayas movido o eliminado). Para que además se ejecute a diario sin que nadie abra el panel, activa la extensión **pg_cron** en *Database → Extensions* y ejecuta `supabase/opcional/generacion_automatica_diaria.sql`.

## 9. Interfaz responsive (fase 5)

No requiere configuración: la web está diseñada primero para móvil (una columna, botones de 44 px, diálogos que caben en pantallas bajas) y se amplía a 2-3 columnas en tablet y ordenador. Está probada en Chromium de escritorio y con el perfil de móvil Pixel 7 (ver [05-pruebas.md](05-pruebas.md)).

Siguiente paso: [04-despliegue-dominio-https.md](04-despliegue-dominio-https.md).
