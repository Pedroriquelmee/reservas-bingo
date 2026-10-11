# Seguridad y protección de datos

## Medidas de seguridad aplicadas

| Requisito | Cómo se cumple |
|---|---|
| HTTPS | Certificado automático de Vercel, redirección de http a https y cabecera HSTS. |
| Validación en frontend y backend | Mismas reglas en `src/lib/validacion.ts` y en las funciones SQL (`_validar_nombre`, longitudes, fechas…). La del servidor es la que cuenta. |
| Permisos de administración en el servidor | Cada función `admin_*` llama a `_exigir_admin()`, que consulta el rol en la base de datos. Ocultar botones es solo comodidad. |
| Políticas de acceso a la base de datos | RLS en todas las tablas; sin permisos de escritura directa para nadie; funciones concedidas una a una. |
| Impedir modificar reservas ajenas / suplantación | Solo existe `cancelar_mi_reserva`, que comprueba que la reserva es tuya. La identidad la da Supabase Auth (código de un solo uso enviado al correo), no un nombre escrito a mano. |
| Sin claves privadas en el frontend | Solo se usa la clave **publicable**, diseñada para ser pública. La *secret key* no aparece en ningún sitio. |
| Variables sensibles en el entorno | `.env.local` (ignorado por Git) y variables de Vercel. `.env.example` sin secretos reales. |
| Duplicados y concurrencia | Bloqueo de fila + índices únicos; botones deshabilitados mientras se guarda; probado con 10 solicitudes simultáneas. |
| No mostrar datos innecesarios | Públicamente solo «Nombre + inicial». El correo solo lo ven la propia persona y el admin. |
| Registrar errores sin datos sensibles | La web traduce los errores a mensajes genéricos y en consola solo registra el código y un extracto corto, nunca datos personales. Supabase guarda sus propios registros (*Logs*). |
| Cabeceras de seguridad | CSP estricta (sin scripts en línea, conexiones solo a Supabase, sin iframes), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Probadas sin violaciones. |
| Funciones privilegiadas | `SECURITY DEFINER` con `search_path` vacío y nombres cualificados (evita secuestro de esquema). |
| Abuso del inicio de sesión | Supabase limita un código por minuto y por correo, y un máximo de correos por hora en todo el proyecto. |
| Redirecciones abiertas | Tras iniciar sesión solo se permiten destinos internos (`destinoSeguro`). |
| Exportación CSV | Neutraliza fórmulas (inyección CSV en Excel). |
| Buscadores | `robots.txt`, `noindex` y `X-Robots-Tag`: la web no aparece en Google. |

**Mejora opcional**: activar un CAPTCHA (Cloudflare Turnstile o hCaptcha) en *Authentication → Attack Protection* si algún día alguien abusa del envío de códigos. Requeriría añadir el widget en `PanelAcceso.tsx`.

## Protección de datos (RGPD / LOPDGDD) — lo básico

> Orientación general, no asesoramiento jurídico. Si la actividad la organiza una asociación o entidad, conviene que lo revise quien lleve sus temas legales.

1. **Responsable e información.** La página `/privacidad` explica quién trata los datos, para qué, qué se publica, la base legal, la conservación, los servicios externos y los derechos. Rellena `VITE_RESPONSABLE_TRATAMIENTO` y `VITE_CONTACTO_PRIVACIDAD` con datos reales.
2. **Base legal: consentimiento.** Quien se registra lo hace voluntariamente para apuntarse; puede retirarlo eliminando su cuenta.
3. **Minimización.** Solo nombre, apellidos y correo. En público, nombre + inicial. Nada de teléfonos, DNI ni direcciones.
4. **Conservación limitada.** El bloque 3 de `supabase/mantenimiento.sql` quita los nombres del historial con más de 12 meses. Revísalo una vez al año.
5. **Derechos.** Acceso y rectificación en «Mis reservas»; supresión con «Eliminar mi cuenta» (cancela plazas futuras, anonimiza y borra la cuenta de acceso). El resto, por correo al contacto indicado.
6. **Encargados del tratamiento.** Supabase (datos y acceso), Vercel (alojamiento) y Resend (correos) ofrecen acuerdos de encargado (DPA) en sus webs. Elegir la **región UE** en Supabase evita transferencias innecesarias.
7. **Menores.** En España, menores de 14 años necesitan el consentimiento de sus padres o tutores. Si pudieran apuntarse menores, que lo haga un adulto o el administrador (persona sin cuenta).
8. **Brechas.** Si hubiera un acceso indebido (por ejemplo, se filtra la *secret key*), rota las claves en Supabase, revisa el historial y, si hay riesgo para las personas, notifícalo a la AEPD en 72 horas.
9. **Cookies.** No hay cookies de analítica ni publicidad; solo el almacenamiento técnico de la sesión, que no requiere banner de consentimiento.
