// Pruebas funcionales en navegador (Chromium) de la web completa.
import { expect, test } from '@playwright/test';
import {
  completarAcceso,
  correo,
  crearFecha,
  crearPersona,
  formatoLargo,
  iniciarSesion,
  limpiar,
  reservarComo,
  reservasActivas,
  sql,
  tarjeta,
} from './ayudas';

test.beforeEach(async () => {
  await limpiar();
});

test('#4 un visitante ve los próximos domingos, quién va y el estado de cada fecha', async ({ page }) => {
  const f1 = await crearFecha(7, { notas: 'De 17:00 a 20:00' });
  const f2 = await crearFecha(21);
  const f3 = await crearFecha(35, { estado: 'cancelada', motivo: 'Fiestas del barrio' });
  const pedro = await crearPersona('Pedro', 'Riquelme', 'pedro@prueba.test');
  const maria = await crearPersona('María', 'García López', 'maria@prueba.test');
  await reservarComo(pedro.uid, f1.id);
  await reservarComo(maria.uid, f1.id);
  for (const n of ['Ana', 'Bea', 'Carla']) await reservarComo((await crearPersona(n, 'Prueba')).uid, f2.id);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reservas de Bingo', level: 1 })).toBeVisible();

  const t1 = tarjeta(page, formatoLargo(f1.fecha));
  await expect(t1.getByText('Disponible', { exact: true })).toBeVisible();
  await expect(t1).toContainText('Plazas ocupadas2 de 3');
  await expect(t1).toContainText('Plazas disponibles1');
  await expect(t1.getByRole('listitem')).toHaveText(['Pedro R.', 'María G.']);
  await expect(t1).toContainText('De 17:00 a 20:00');
  await expect(t1.getByRole('button', { name: 'Reservar plaza' })).toBeEnabled();

  const t2 = tarjeta(page, formatoLargo(f2.fecha));
  await expect(t2.getByText('COMPLETO', { exact: true }).first()).toBeVisible();
  await expect(t2.getByRole('button', { name: 'COMPLETO' })).toBeDisabled();
  await expect(t2.getByRole('listitem')).toHaveCount(3);

  const t3 = tarjeta(page, formatoLargo(f3.fecha));
  await expect(t3.getByText('Cancelado', { exact: true })).toBeVisible();
  await expect(t3).toContainText('Motivo: Fiestas del barrio');
  await expect(t3.getByRole('button')).toHaveCount(0);

  // Minimización de datos: ni correos ni apellidos completos en la parte pública
  const texto = await page.locator('body').innerText();
  expect(texto).not.toContain('@prueba.test');
  expect(texto).not.toContain('Riquelme');
  await page.screenshot({ path: 'tests/e2e/capturas/inicio-escritorio.png', fullPage: true });
});

test('#1 #5 #6 flujo completo: identificarse con código, indicar nombre, ver resumen y confirmar', async ({ page, browser }) => {
  const f = await crearFecha(7);
  await reservarComo((await crearPersona('Pedro', 'Riquelme')).uid, f.id);

  await page.goto('/');
  const t = tarjeta(page, formatoLargo(f.fecha));
  await t.getByRole('button', { name: 'Reservar plaza' }).click();

  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('heading', { name: 'Identifícate para reservar' })).toBeVisible();
  await expect(dialogo).toContainText(formatoLargo(f.fecha));
  await completarAcceso(page, 'lucia@prueba.test');

  await expect(dialogo.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible();
  await dialogo.getByLabel('Nombre').fill('  Lucía ');
  await dialogo.getByLabel('Apellidos').fill('Fernández Ruiz');
  await expect(dialogo).toContainText('Lucía F.');
  await dialogo.getByRole('button', { name: 'Continuar' }).click();

  // Resumen antes de confirmar
  await expect(dialogo.getByRole('heading', { name: 'Confirma tu reserva' })).toBeVisible();
  await expect(dialogo).toContainText(formatoLargo(f.fecha));
  await expect(dialogo).toContainText('Plazas libres: 2 de 3');
  await expect(dialogo).toContainText('Lucía Fernández Ruiz');
  await page.screenshot({ path: 'tests/e2e/capturas/resumen-reserva.png' });
  await dialogo.getByRole('button', { name: 'Confirmar reserva' }).click();

  await expect(dialogo.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(t.getByText('Tienes plaza este domingo')).toBeVisible();
  await expect(t.getByRole('listitem')).toHaveText(['Pedro R.', 'Lucía F.']);
  expect(await reservasActivas(f.id)).toBe(2);

  // #5 sigue ahí tras recargar
  await page.reload();
  await expect(tarjeta(page, formatoLargo(f.fecha)).getByText('Tienes plaza este domingo')).toBeVisible();

  // #6 otro dispositivo (otro navegador, sin sesión) ve lo mismo
  const otro = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const pagina2 = await otro.newPage();
  await pagina2.goto('/');
  await expect(tarjeta(pagina2, formatoLargo(f.fecha)).getByRole('listitem')).toHaveText(['Pedro R.', 'Lucía F.']);
  await expect(tarjeta(pagina2, formatoLargo(f.fecha))).toContainText('Plazas disponibles1');
  await otro.close();
});

test('#3 si la última plaza se ocupa mientras confirmas, la web lo impide y no muestra una reserva falsa', async ({ page }) => {
  const f = await crearFecha(7);
  for (const n of ['Ana', 'Bea']) await reservarComo((await crearPersona(n, 'Prueba')).uid, f.id);
  await crearPersona('Diana', 'Prueba', 'diana@prueba.test');
  const rapida = await crearPersona('Rápida', 'Prueba');

  await iniciarSesion(page, 'diana@prueba.test');
  await page.goto('/');
  await tarjeta(page, formatoLargo(f.fecha)).getByRole('button', { name: 'Reservar plaza' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('heading', { name: 'Confirma tu reserva' })).toBeVisible();

  // Otra persona ocupa la última plaza justo antes de que Diana confirme
  await reservarComo(rapida.uid, f.id);
  await dialogo.getByRole('button', { name: 'Confirmar reserva' }).click();

  await expect(dialogo.getByRole('alert')).toContainText('Este domingo ya tiene las tres plazas ocupadas. Puedes consultar otras fechas disponibles.');
  await expect(dialogo.getByRole('heading', { name: '¡Reserva confirmada!' })).toHaveCount(0);
  await expect(dialogo.getByRole('button', { name: 'Confirmar reserva' })).toBeDisabled();
  expect(await reservasActivas(f.id)).toBe(3);

  await dialogo.getByRole('button', { name: 'Volver' }).click();
  await expect(tarjeta(page, formatoLargo(f.fecha)).getByRole('button', { name: 'COMPLETO' })).toBeDisabled();
});

test('#7 cancelar mi plaza desde la tarjeta la libera al momento', async ({ page }) => {
  const f = await crearFecha(7);
  const yo = await crearPersona('Pedro', 'Riquelme', 'pedro@prueba.test');
  for (const n of ['Ana', 'Bea']) await reservarComo((await crearPersona(n, 'Prueba')).uid, f.id);
  await reservarComo(yo.uid, f.id);

  await iniciarSesion(page, 'pedro@prueba.test');
  await page.goto('/');
  const t = tarjeta(page, formatoLargo(f.fecha));
  await expect(t.getByText('COMPLETO', { exact: true })).toBeVisible();
  await t.getByRole('button', { name: 'Cancelar mi plaza' }).click();
  await expect(page.getByRole('dialog')).toContainText(formatoLargo(f.fecha));
  await page.getByRole('button', { name: 'Sí, cancelar mi plaza' }).click();

  await expect(page.getByText('Reserva cancelada. La plaza ya está libre para otra persona.')).toBeVisible();
  await expect(t.getByText('Disponible', { exact: true })).toBeVisible();
  await expect(t.getByRole('button', { name: 'Reservar plaza' })).toBeEnabled();
  expect(await reservasActivas(f.id)).toBe(2);
  const [h] = await sql(`select count(*)::int as n from public.historial where accion = 'reserva_cancelada'`);
  expect(h.n).toBe(1);
});

test('mis reservas: muestra las propias y permite cancelarlas con confirmación', async ({ page }) => {
  const f1 = await crearFecha(7);
  const f2 = await crearFecha(21);
  const yo = await crearPersona('Pedro', 'Riquelme', 'pedro@prueba.test');
  await reservarComo(yo.uid, f1.id);
  await reservarComo(yo.uid, f2.id);
  await reservarComo((await crearPersona('Otra', 'Persona')).uid, f1.id);

  await iniciarSesion(page, 'pedro@prueba.test');
  await page.getByRole('link', { name: 'Mis reservas' }).click();
  const proximas = page.getByRole('region', { name: 'Próximas' });
  await expect(proximas.getByRole('listitem')).toHaveCount(2);
  await expect(proximas).toContainText(formatoLargo(f1.fecha));
  await expect(page.getByText('Otra Persona')).toHaveCount(0);

  await proximas.getByRole('listitem').first().getByRole('button', { name: 'Cancelar reserva' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(proximas.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Historial' })).toContainText(formatoLargo(f1.fecha));
  expect(await reservasActivas(f1.id)).toBe(1);
});

test('el enlace del correo también inicia sesión (tras pulsar «Entrar»)', async ({ page }) => {
  await crearFecha(7);
  await page.goto('/acceso');
  await page.getByLabel('Correo electrónico').fill('enlace@prueba.test');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await expect(page.getByText('Te hemos enviado un correo')).toBeVisible();

  const { html, codigo } = await correo('enlace@prueba.test');
  expect(html).toContain(codigo);
  const enlace = html.match(/href="([^"]+auth\/confirmar[^"]+)"/)![1].replaceAll('&amp;', '&');

  await page.goto(enlace);
  await expect(page.getByText('Pulsa el botón para terminar de entrar')).toBeVisible();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Mis reservas' })).toBeVisible();

  // El enlace es de un solo uso
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.goto(enlace);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no es válido o ha caducado');
});

test('#11 una persona sin permisos no puede usar el panel de administración', async ({ page }) => {
  await crearPersona('Pedro', 'Riquelme', 'normal@prueba.test');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Acceso de administración' })).toBeVisible();
  await completarAcceso(page, 'normal@prueba.test');
  await expect(page.getByText('Acceso restringido')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Secciones de administración' })).toHaveCount(0);

  await page.goto('/admin/fechas');
  await expect(page.getByText('Acceso restringido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva fecha' })).toHaveCount(0);
});

test('#15 administración: crear, generar sin duplicados y cancelar una fecha con reservas pidiendo confirmación', async ({ page }) => {
  await crearPersona('Admin', 'Gestor', 'admin@prueba.test', 'admin');
  const f = await crearFecha(7);
  await reservarComo((await crearPersona('Pedro', 'Riquelme')).uid, f.id);
  await reservarComo((await crearPersona('María', 'García')).uid, f.id);

  await iniciarSesion(page, 'admin@prueba.test');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await expect(page.getByText('Domingos programados')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/capturas/admin-resumen.png', fullPage: true });

  await page.getByRole('link', { name: 'Fechas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fechas de bingo' })).toBeVisible();

  // Nueva fecha manual (excepción): dentro de 49 días
  const [{ d: manual }] = await sql(`select (public.hoy_madrid() + 49)::text as d`);
  await page.getByRole('button', { name: 'Nueva fecha' }).click();
  await page.getByRole('dialog').getByLabel('Día').fill(manual);
  await page.getByRole('dialog').getByLabel(/Notas/).fill('Bingo especial');
  await page.getByRole('dialog').getByRole('button', { name: 'Crear fecha' }).click();
  await expect(page.getByText('Fecha creada.')).toBeVisible();

  // Duplicada → error claro
  await page.getByRole('button', { name: 'Nueva fecha' }).click();
  await page.getByRole('dialog').getByLabel('Día').fill(manual);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear fecha' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ya existe un bingo en ese día.');
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();

  // Generar 3 fechas cada 14 días empezando en +21: +21, +35, +49 (esta ya existe → se omite)
  const [{ d: inicio }] = await sql(`select (public.hoy_madrid() + 21)::text as d`);
  await page.getByRole('button', { name: 'Generar fechas' }).click();
  const gen = page.getByRole('dialog');
  await gen.getByLabel('Primera fecha').fill(inicio);
  await gen.getByLabel('Número de fechas').fill('3');
  await gen.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(gen).toContainText('Vista previa: 2 nuevas, 1 ya existen');
  await page.screenshot({ path: 'tests/e2e/capturas/admin-generar.png' });
  await gen.getByRole('button', { name: 'Crear 2 fechas' }).click();
  await expect(page.getByText('Creadas 2 fechas (1 ya existían).')).toBeVisible();
  const [{ n }] = await sql('select count(*)::int as n from public.fechas_bingo');
  expect(n).toBe(4);

  // Cancelar la fecha con 2 reservas → informa y exige confirmación
  const fila = page.getByRole('listitem').filter({ hasText: formatoLargo(f.fecha) }).first();
  await fila.getByRole('button', { name: 'Cancelar fecha' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('Hay 2 reservas afectadas');
  await expect(dlg).toContainText('Pedro Riquelme');
  await expect(dlg).toContainText('María García');
  await dlg.getByLabel(/Motivo/).fill('Obras en el local');
  await expect(dlg.getByRole('button', { name: 'Cancelar fecha' })).toBeDisabled();
  await dlg.getByLabel('Entiendo que se cancelarán 2 reservas.').check();
  await expect(dlg.getByRole('button', { name: 'Cancelar fecha' })).toBeEnabled();
  await page.screenshot({ path: 'tests/e2e/capturas/admin-cancelar-fecha.png' });
  await dlg.getByRole('button', { name: 'Cancelar fecha' }).click();
  await expect(page.getByText('Fecha cancelada. 2 reservas canceladas.')).toBeVisible();
  expect(await reservasActivas(f.id)).toBe(0);

  // La web pública lo refleja
  await page.goto('/');
  const t = tarjeta(page, formatoLargo(f.fecha));
  await expect(t.getByText('Cancelado', { exact: true })).toBeVisible();
  await expect(t).toContainText('Obras en el local');

  // El historial lo registra
  await page.goto('/admin/historial');
  await expect(page.getByText(/Cancelado el .* Obras en el local \(2 reservas afectadas\)/)).toBeVisible();
});

test('administración: apuntar a una persona sin cuenta y gestionar permisos', async ({ page }) => {
  await crearPersona('Admin', 'Gestor', 'admin@prueba.test', 'admin');
  await crearPersona('María', 'García', 'maria@prueba.test');
  const f = await crearFecha(7);

  await iniciarSesion(page, 'admin@prueba.test');
  await page.goto('/admin/participantes');
  await page.getByRole('button', { name: 'Añadir persona sin cuenta' }).click();
  await page.getByRole('dialog').getByLabel('Nombre').fill('Carmen');
  await page.getByRole('dialog').getByLabel('Apellidos').fill('Sánchez');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Persona añadida.')).toBeVisible();

  const filaMaria = page.getByRole('listitem').filter({ hasText: 'maria@prueba.test' });
  await filaMaria.getByRole('button', { name: 'Hacer admin' }).click();
  await expect(filaMaria.getByText('Administrador/a')).toBeVisible();

  await page.goto('/admin/fechas');
  await page.getByRole('listitem').filter({ hasText: formatoLargo(f.fecha) }).first().getByRole('button', { name: 'Apuntar a alguien' }).click();
  await page.getByRole('dialog').getByLabel('Buscar').fill('carmen');
  await page.getByRole('dialog').getByLabel('Persona').selectOption({ label: 'Carmen Sánchez · sin cuenta' });
  await page.getByRole('dialog').getByRole('button', { name: 'Apuntar' }).click();
  await expect(page.getByText('Persona apuntada.')).toBeVisible();
  expect(await reservasActivas(f.id)).toBe(1);

  await page.goto('/');
  await expect(tarjeta(page, formatoLargo(f.fecha)).getByRole('listitem')).toHaveText(['Carmen S.']);
});

test('#14 si falla la conexión al reservar, avisa y no da la reserva por confirmada', async ({ page }) => {
  const f = await crearFecha(7);
  await crearPersona('Pedro', 'Riquelme', 'pedro@prueba.test');
  await iniciarSesion(page, 'pedro@prueba.test');
  await page.goto('/');
  await tarjeta(page, formatoLargo(f.fecha)).getByRole('button', { name: 'Reservar plaza' }).click();

  await page.route('**/rest/v1/rpc/reservar', (ruta) => ruta.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();

  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByRole('alert')).toContainText('No se ha podido conectar con el servidor');
  await expect(dialogo.getByRole('heading', { name: '¡Reserva confirmada!' })).toHaveCount(0);
  expect(await reservasActivas(f.id)).toBe(0);

  // Al volver la conexión, se puede reintentar
  await page.unroute('**/rest/v1/rpc/reservar');
  await dialogo.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(dialogo.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
});

test('#14 si la base de datos no responde al cargar, muestra un aviso con opción de reintentar', async ({ page }) => {
  await page.route('**/rest/v1/rpc/calendario_publico', (ruta) => ruta.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByText('No se han podido cargar las fechas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('#13 las rutas internas funcionan al entrar directamente y las desconocidas dan 404', async ({ page }) => {
  for (const [ruta, titulo] of [
    ['/mis-reservas', 'Mis reservas'],
    ['/privacidad', 'Privacidad'],
    ['/acceso', 'Entrar'],
    ['/admin/fechas', 'Acceso de administración'],
    ['/no-existe', 'Esta página no existe'],
  ] as const) {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
  }
  await expect(page.locator('body')).not.toContainText('privacidad@ejemplo.test@');
});

test('vista móvil: sin desplazamiento horizontal y botones accesibles @movil', async ({ page }) => {
  const f = await crearFecha(7);
  await crearFecha(21);
  await reservarComo((await crearPersona('María José', 'Fernández')).uid, f.id);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reservar plaza' }).first()).toBeVisible();
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(desborda).toBe(false);
  await page.screenshot({ path: 'tests/e2e/capturas/inicio-movil.png', fullPage: true });

  await page.getByRole('button', { name: 'Reservar plaza' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: 'tests/e2e/capturas/dialogo-movil.png' });
});

test('#12 cabeceras de seguridad de producción (CSP incluida) sin romper nada', async ({ page }) => {
  const f = await crearFecha(7);
  await crearPersona('Admin', 'Gestor', 'admin@prueba.test', 'admin');
  const violaciones: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violaciones.push(m.text());
  });

  const respuesta = await page.goto('/');
  const h = respuesta!.headers();
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');

  // Recorre las pantallas principales con las cabeceras activas
  await tarjeta(page, formatoLargo(f.fecha)).getByRole('button', { name: 'Reservar plaza' }).click();
  await completarAcceso(page, 'admin@prueba.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();
  await page.goto('/mis-reservas');
  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
  await page.goto('/admin/fechas');
  await expect(page.getByRole('heading', { name: 'Fechas de bingo' })).toBeVisible();
  await page.goto('/privacidad');

  expect(violaciones).toEqual([]);
});

test('identidad del Grupo Scout Alba 601: logo, nombre y título', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Reservas de Bingo · Grupo Scout Alba 601');
  const logos = page.getByRole('img', { name: 'Grupo Scout Alba 601' });
  await expect(logos.first()).toBeVisible();
  // Las imágenes del logo cargan de verdad (no están rotas)
  const anchos = await logos.evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
  expect(anchos.length).toBeGreaterThanOrEqual(3);
  expect(anchos.every((a) => a > 0)).toBe(true);
  await expect(page.getByText('una iniciativa del Grupo Scout Alba 601')).toBeVisible();
  const respuesta = await page.request.get('/logo-email.png');
  expect(respuesta.headers()['content-type']).toContain('image/png');
});
