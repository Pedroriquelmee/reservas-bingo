# Fase 1 · Arquitectura

## Resumen

```
 Navegador (móvil / tablet / PC)
        │  HTTPS
        ▼
 reservas.pedroriquelme.tech ──CNAME──▶ Vercel (web estática React)
        │
        │  HTTPS + WebSocket (supabase-js, clave publicable)
        ▼
 Supabase (UE)
   ├─ Auth ............ inicio de sesión con código/enlace por correo
   │     └─ SMTP ─────▶ Resend (envía los correos desde tu dominio)
   ├─ API (PostgREST) . solo llama a funciones de la base de datos
   ├─ PostgreSQL ...... tablas + RLS + funciones con las reglas de negocio
   └─ Realtime ........ avisa a todos los navegadores cuando cambia algo
```

No hay servidor propio que mantener: la web es estática y **todas las reglas viven en la base de datos**, que es el único sitio donde no se pueden saltar.

## Servicios y por qué

| Pieza | Servicio | Motivo |
|---|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS 4 (Vite) | Lo que pediste. Web estática: rápida, barata y sin servidor. |
| Base de datos | PostgreSQL (Supabase) | Transacciones y bloqueos reales: imprescindible para que el límite de 3 plazas sea atómico. |
| Backend y permisos | Funciones SQL + Row Level Security | El navegador no puede escribir en ninguna tabla. Solo llama a funciones que comprueban quién eres y qué puedes hacer. |
| Identificación | Supabase Auth, código de un solo uso por correo | Tu elección. Sin contraseñas que robar o reutilizar, una identidad por correo, difícil de suplantar. |
| Correo | Resend vía SMTP | El correo de serie de Supabase solo envía a los miembros del equipo y está limitado a muy pocos mensajes por hora; no sirve en producción. |
| Tiempo real | Supabase Realtime | Los cambios aparecen sin recargar. Si falla, la web se refresca sola cada 30 s y al volver a la pestaña. |
| Alojamiento | Vercel | Despliegue automático desde GitHub, HTTPS automático y subdominio propio con un CNAME. |
| Código | GitHub (repositorio privado) | Historial, copias y pruebas automáticas en cada cambio. |

### Alternativas consideradas

- **API propia (Node/Express + PostgreSQL)**: más control, pero habría que alojar, actualizar y proteger un servidor. Supabase da lo mismo (Postgres real, transacciones, permisos en servidor) sin mantenimiento.
- **Contraseñas (opción B)**: más fricción para gente que ayuda una vez al mes y más riesgo (contraseñas débiles o repetidas). El código por correo cumple «una identidad por persona» sin gestionar contraseñas.
- **Sin cuenta + código de cancelación (opción A)**: cualquiera podría apuntarse con el nombre de otra persona. Descartada por suplantación.
- **Cloudflare Pages en vez de Vercel**: también gratis y sin restricción de uso comercial. La web es estática, así que se podría mover en minutos (habría que trasladar las cabeceras de `vercel.json` a un archivo `_headers`).

## Decisiones tomadas contigo

| Pregunta | Decisión |
|---|---|
| Identificación | Código / enlace por correo (Supabase Auth). |
| Quién puede apuntarse | Cualquiera con el enlace. El admin puede desactivar cuentas. |
| Frecuencia automática | Cada 14 días (siempre cae en domingo). Configurable; también 7, 21, 28 o 15 exactos. |
| DNS | Dondominio. |

## Costes

| Concepto | Plan | Coste | Límites relevantes |
|---|---|---|---|
| Dominio `pedroriquelme.tech` | Ya lo tienes (Dondominio) | La renovación anual que ya pagas | No hace falta comprar nada. El dominio **no incluye** alojamiento. |
| Vercel | Hobby | 0 € | Solo uso personal y **no comercial**. Si el bingo fuese un negocio con ánimo de lucro, haría falta Pro (20 $/mes) o mover la web a Cloudflare Pages. |
| Supabase | Free | 0 € | 500 MB de base de datos, 50.000 usuarios activos al mes, 2 proyectos activos. **Se pausa tras 1 semana de inactividad** y **no incluye copias automáticas**. Pro: desde 25 $/mes (sin pausas, copias diarias de 7 días). |
| Resend | Free | 0 € | 3.000 correos/mes, 100/día, 1 dominio. De sobra: un correo por inicio de sesión. |
| GitHub | Free | 0 € | Repositorio privado y Actions suficientes para este proyecto. |

**Total mensual: 0 €** con los planes gratuitos. Los dos riesgos del plan gratuito y cómo se cubren:

1. **Pausa por inactividad** → el flujo opcional `.github/workflows/mantener-activo.yml` hace una consulta cada 3 días. Si aun así se pausa, se reactiva desde el panel de Supabase sin perder datos (ver mantenimiento).
2. **Sin copias automáticas** → exportación CSV desde el panel y copia completa con `pg_dump` (ver [07-mantenimiento.md](07-mantenimiento.md)).
