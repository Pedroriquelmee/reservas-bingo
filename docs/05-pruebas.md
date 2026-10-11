# Fase 7 · Pruebas y resultados

## Qué hay y cómo se ejecuta

| Batería | Comando | Contra qué | Nº |
|---|---|---|---|
| Unitarias | `npm test` | Lógica de la web (fechas, validación, errores, redirecciones) | 15 |
| Base de datos | `npm run test:db` | **PostgreSQL real** con las 3 migraciones de producción | 35 |
| Navegador (E2E) | `npm run test:e2e` | **Chromium** con la web compilada + simulador local de la API (ver abajo) | 15 |
| Producción | `npm run comprobar` | Tu despliegue real en `reservas.pedroriquelme.tech` | — |

Las baterías de base de datos y navegador necesitan un PostgreSQL **desechable** (crean y borran sus propias bases `bingo_test` y `bingo_e2e`):

```bash
# En tu Mac, por ejemplo con Homebrew:
brew install postgresql@17 && brew services start postgresql@17
export DATABASE_URL_ADMIN=postgres://$(whoami)@localhost:5432/postgres
npx playwright install chromium     # solo la primera vez
npm run test:todo                   # tipos + unitarias + base de datos
npm run test:e2e                    # navegador
```

En GitHub se ejecutan solas en cada `push` (`.github/workflows/pruebas.yml`) sobre **PostgreSQL 17**, la versión de los proyectos nuevos de Supabase.

### Sobre el simulador de las pruebas en navegador

Desde el entorno donde se desarrolló no era posible descargar los servidores oficiales de Supabase (PostgREST y Auth), así que `herramientas/simulador/` imita **solo el protocolo** que usa la web: ejecuta las funciones RPC en PostgreSQL con el mismo rol y claims que pondría Supabase y emite códigos de acceso usando la plantilla de correo real. **Toda la lógica, la seguridad y las reglas de plazas son las de las migraciones reales.** No simula el tiempo real (la web cae a refresco periódico, y eso también queda probado). La integración con los servicios reales se verifica en producción con la lista del final.

## Resultados

Ejecución del 12/10/2026 en Linux, Node 22, PostgreSQL 16.15 y Chromium 141. **Todo superado:**

| Batería | Resultado |
|---|---|
| Tipos (TypeScript, web y pruebas) | sin errores |
| Compilación de producción | correcta |
| Unitarias | **15/15** |
| Base de datos | **35/35** |
| Navegador (escritorio + móvil Pixel 7) | **15/15** |

### Comprobación de que la prueba de concurrencia detecta fallos

Para asegurar que la prueba #9 no pasa «por suerte», se quitó a propósito el bloqueo `FOR UPDATE` de la función de reserva y se volvió a ejecutar: **la prueba falló** («expected … to have a length of 3 but got 2»; en una ronda una persona fue rechazada habiendo plaza libre). Aun sin el bloqueo, el índice único de plazas impidió pasar de 3. Con el código real, 25 rondas de 10 solicitudes simultáneas dan siempre exactamente 3 reservas y 7 rechazos «completo».

## Pruebas obligatorias

| # | Caso | Dónde se prueba | Estado |
|---|---|---|---|
| 1 | Una persona reserva una plaza disponible | BD `reservas.test.ts` · Navegador (flujo completo con código, nombre, resumen y confirmación) | ✅ |
| 2 | Tres personas reservan el mismo domingo → COMPLETO | BD | ✅ |
| 3 | Una cuarta persona no puede | BD · Navegador (la última plaza se ocupa mientras confirma: aviso y sin falsa confirmación) | ✅ |
| 4 | Todos ven quién está apuntado | BD (visitante sin sesión) · Navegador (sin correos ni apellidos completos en pantalla) | ✅ |
| 5 | Las reservas siguen tras actualizar | BD (conexión nueva) · Navegador (recarga) | ✅ |
| 6 | Visibles desde otro dispositivo | BD (otra conexión) · Navegador (segundo navegador sin sesión) | ✅ |
| 7 | Cancelar libera la plaza | BD (la plaza se reutiliza y queda en el historial) · Navegador | ✅ |
| 8 | Sin reservas duplicadas persona/fecha | BD (incluido volver a apuntarse tras cancelar) | ✅ |
| 9 | Solicitudes simultáneas no superan 3 | BD `concurrencia.test.ts`: 25 rondas × 10 a la vez; 5 clics simultáneos de la misma persona; reservas y cancelaciones mezcladas; inserción directa de una 4.ª plaza rechazada por la propia BD | ✅ |
| 10 | No se modifican reservas ajenas | BD: cancelar ajena, `UPDATE`/`DELETE`/`INSERT` directos y funciones internas → rechazados | ✅ |
| 11 | Sin permisos no hay panel | BD: las 20 funciones de administración (todas las que existen) rechazan a participantes (NO_AUTORIZADO) y a visitantes (sin permiso de ejecución) · Navegador: «Acceso restringido» | ✅ |
| 12 | Funciona en el subdominio con HTTPS | Cabeceras de producción y CSP probadas en navegador sin violaciones · **En el subdominio real: `npm run comprobar`** | ⏳ tras desplegar |
| 13 | Rutas y redirecciones en producción | Navegador: entrada directa a todas las rutas y 404 · **En Vercel: `npm run comprobar`** | ⏳ tras desplegar |
| 14 | Mensajes si falla la conexión | Navegador: corte de red al reservar (aviso, sin confirmación, reintento correcto) y al cargar (aviso + «Reintentar») | ✅ |
| 15 | Excepciones sin fechas duplicadas | BD (generación cada 14 días con una fecha manual en medio; repetir no crea nada; automática no recrea eliminadas) · Navegador (vista previa «2 nuevas, 1 ya existe») | ✅ |

Además: validación de nombres, cuentas desactivadas, mover reservas sin superar el cupo, nunca quedarse sin administradores, estadísticas, eliminación de cuenta con anonimización, exactamente las funciones previstas expuestas, `search_path` fijado en todas las funciones privilegiadas y RLS en todas las tablas.

## Lo que tienes que comprobar tú en producción

Estas comprobaciones dependen de tus cuentas y no se pueden hacer sin ellas. Diez minutos, con el móvil y el ordenador:

1. `npm run comprobar` → «Todo correcto» (cubre #12 y #13).
2. **Correo real**: en el móvil, «Reservar plaza» → tu correo → llega el correo de *Reservas de Bingo* (mira Spam la primera vez) → el código funciona.
3. **Enlace del correo**: pide otro código, pulsa el botón del correo → «Entrar» → sesión iniciada.
4. **Tiempo real**: abre la web en el ordenador (sin sesión) y en el móvil reserva una plaza. En el ordenador debe aparecer tu nombre en uno o dos segundos sin recargar, y arriba debe poner «Se actualiza en tiempo real».
5. **Cancelación**: cancela desde el móvil y comprueba que el ordenador vuelve a mostrar la plaza libre.
6. **Panel**: con tu cuenta de administrador, `/admin` → Resumen, Fechas, Historial (debe aparecer lo que acabas de hacer).
7. **Otra persona** (sin permisos) entra en `/admin` → «Acceso restringido».
