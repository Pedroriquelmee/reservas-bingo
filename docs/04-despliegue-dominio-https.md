# Fase 6 · Despliegue, subdominio y HTTPS

Resultado final: la web en **https://reservas.pedroriquelme.tech**, con certificado válido, y desplegándose sola cada vez que subes cambios a GitHub.

## 1. 🔑 Subir el código a GitHub

En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Reservas de Bingo: primera versión"
git branch -M main
# Crea antes un repositorio PRIVADO vacío llamado reservas-bingo en github.com
git remote add origin https://github.com/Pedroriquelmee/reservas-bingo.git
git push -u origin main
```

Comprueba que `.env.local` **no** aparece en GitHub (está en `.gitignore`).

La primera subida lanza el flujo **Pruebas** (`.github/workflows/pruebas.yml`): tipos, unitarias, base de datos con concurrencia y navegador, sobre PostgreSQL 17. Míralo en la pestaña *Actions*.

## 2. 🔑 Desplegar en Vercel

1. Vercel → **Add New → Project** → importa `reservas-bingo` desde GitHub.
2. *Framework Preset*: **Vite** (lo detecta solo; `vercel.json` ya fija build y salida).
3. **Environment Variables** (marca *Production* y *Preview*):

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | la Project URL de Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la clave `sb_publishable_…` |
| `VITE_RESPONSABLE_TRATAMIENTO` | `Grupo Scout Alba 601` |
| `VITE_CONTACTO_PRIVACIDAD` | el correo de contacto del grupo para temas de privacidad |

4. **Deploy**. Al terminar tendrás una dirección temporal `https://reservas-bingo-xxxx.vercel.app`. Sirve para una primera prueba (entrar con el **código**, reservar, abrir el panel), pero la dirección definitiva será el subdominio.

> Cambiar una variable de entorno no afecta a lo ya publicado: hay que volver a desplegar (*Deployments → ⋯ → Redeploy*), porque Vite las incrusta al construir.

## 3. 🔑 Añadir el subdominio en Vercel

Proyecto → **Settings → Domains → Add Domain** → `reservas.pedroriquelme.tech` → asígnalo a **Production**.

Vercel mostrará *Invalid Configuration* y el registro que necesita. Para un subdominio es un **CNAME** con un valor **propio de tu proyecto**, con este aspecto:

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `reservas` | `xxxxxxxxxxxxxxxx.vercel-dns-0xx.com` ← **copia el que te muestre Vercel** |

No uses un registro A: para subdominios Vercel indica CNAME. (Solo pediría además un TXT de verificación si el dominio estuviera vinculado a otra cuenta de Vercel; si aparece, créalo igual que el CNAME.)

## 4. 🔑 Crear el registro en Dondominio

Requisito: el dominio debe usar los **servidores DNS de DonDominio** (Gestionar dominio → DNS). Si tienes servidores personalizados (por ejemplo Cloudflare), el registro se crea allí, y en Cloudflare debe quedar en modo *DNS only* (nube gris).

1. Área de cliente → **Dominios** → `pedroriquelme.tech` → **Gestionar dominio**.
2. Menú lateral → **Zona DNS** → **NUEVA**.
3. Rellena:
   - **Tipo**: `CNAME` (comprueba que es CNAME y no CAA: los nombres de la lista se parecen).
   - **Host**: `reservas` (solo eso; el panel añade `.pedroriquelme.tech`).
   - **Host destino**: el valor que te dio Vercel.
   - TTL: el que venga por defecto.
4. **Guardar** y comprueba que aparece en la lista de la zona.

Precauciones:

- No puede haber otro registro (A, AAAA, TXT…) con el mismo host `reservas`. Si existe uno antiguo, bórralo.
- Si en la zona hay registros **CAA** en `pedroriquelme.tech`, deben permitir `letsencrypt.org` (Vercel emite el certificado con Let's Encrypt). Si no hay CAA, no hagas nada.
- No toques los registros del dominio raíz ni los del correo.

## 5. Esperar la propagación y comprobar el DNS

Suele tardar de minutos a unas horas. En la Terminal de tu Mac:

```bash
dig +short reservas.pedroriquelme.tech CNAME
# debe devolver el valor de Vercel
```

También puedes mirarlo en <https://dnschecker.org> (tipo CNAME). Cuando el DNS es correcto, Vercel cambia a **Valid Configuration**.

## 6. HTTPS

No hay que hacer nada: en cuanto el CNAME es válido, Vercel **emite y renueva automáticamente** el certificado TLS y redirige `http://` a `https://`. Comprobación:

```bash
curl -I https://reservas.pedroriquelme.tech      # HTTP/2 200 y cabecera strict-transport-security
curl -I http://reservas.pedroriquelme.tech       # 308 → https://reservas.pedroriquelme.tech/
```

En el navegador: candado sin avisos. Para un análisis completo: <https://www.ssllabs.com/ssltest/>.

## 7. 🔑 URLs definitivas en Supabase

Revisa que **Authentication → URL Configuration** tiene *Site URL* = `https://reservas.pedroriquelme.tech` (paso 4 de la guía anterior). Es la dirección que aparece en el botón de los correos.

No hace falta configurar CORS: la API de Supabase acepta peticiones desde cualquier origen y la protección real son RLS y las funciones. La web, a su vez, solo permite conectarse a `*.supabase.co` (cabecera CSP de `vercel.json`).

Opcional: en Vercel → Domains, edita el dominio `*.vercel.app` y configúralo para **redirigir** a `reservas.pedroriquelme.tech`, para que nadie use la dirección temporal.

## 8. Comprobación final automática

Con `.env.local` relleno, desde la carpeta del proyecto:

```bash
npm run comprobar
```

Verifica DNS, certificado, redirección a HTTPS, que todas las rutas (`/`, `/mis-reservas`, `/admin/fechas`…) cargan al entrar directamente, que un archivo inexistente da 404, las cabeceras de seguridad, que Supabase responde y acepta peticiones desde el subdominio, y que un visitante **no** puede leer la tabla de reservas ni usar funciones de administración. Debe terminar con «Todo correcto».

Después, la comprobación manual de [05-pruebas.md](05-pruebas.md#lo-que-tienes-que-comprobar-tú-en-producción) (10 minutos con dos móviles).
