#!/usr/bin/env node
// Comprueba el despliegue real: DNS, HTTPS, redirecciones, rutas, cabeceras
// de seguridad y conexión con Supabase (incluido CORS desde el subdominio).
//
// Uso:
//   node scripts/comprobar-produccion.mjs
//   node scripts/comprobar-produccion.mjs https://reservas.pedroriquelme.tech
//
// Para la parte de Supabase lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY
// del entorno o de .env.local.
import { promises as dns } from 'node:dns';
import { existsSync, readFileSync } from 'node:fs';
import tls from 'node:tls';

const sitio = new URL(process.argv[2] ?? 'https://reservas.pedroriquelme.tech');
const host = sitio.hostname;
let fallos = 0;

const ok = (m) => console.log(`  ✔ ${m}`);
const mal = (m) => {
  fallos++;
  console.log(`  ✘ ${m}`);
};
const info = (m) => console.log(`    ${m}`);

function variables() {
  const v = { ...process.env };
  if (existsSync('.env.local')) {
    for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !v[m[1]]) v[m[1]] = m[2];
    }
  }
  return v;
}

console.log(`\nComprobando ${sitio.origin}\n`);

// 1. DNS
console.log('DNS');
try {
  const cname = await dns.resolveCname(host);
  ok(`CNAME → ${cname.join(', ')}`);
  if (!cname.some((c) => /vercel/i.test(c))) info('Aviso: el CNAME no apunta a Vercel. Revisa el valor que indica Vercel.');
} catch {
  try {
    const ips = await dns.resolve4(host);
    ok(`Registro A → ${ips.join(', ')} (sin CNAME)`);
  } catch (e) {
    mal(`${host} no resuelve (${e.code}). ¿Has creado el registro en Dondominio? ¿Ha propagado?`);
  }
}

// 2. Certificado TLS
console.log('HTTPS');
await new Promise((resolver) => {
  const s = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
    const c = s.getPeerCertificate();
    if (s.authorized) {
      const dias = Math.round((new Date(c.valid_to) - Date.now()) / 86_400_000);
      ok(`Certificado válido para ${c.subject?.CN ?? host}, emitido por ${c.issuer?.O ?? c.issuer?.CN}, caduca en ${dias} días`);
    } else {
      mal(`Certificado no válido: ${s.authorizationError}`);
    }
    s.end();
    resolver();
  });
  s.on('error', (e) => {
    mal(`No se pudo abrir HTTPS: ${e.message}`);
    resolver();
  });
  s.on('timeout', () => {
    mal('Tiempo de espera agotado al conectar por HTTPS');
    s.destroy();
    resolver();
  });
});

// 3. HTTP → HTTPS
try {
  const r = await fetch(`http://${host}/`, { redirect: 'manual' });
  const destino = r.headers.get('location') ?? '';
  if (r.status >= 300 && r.status < 400 && destino.startsWith('https://')) ok(`http:// redirige a https:// (${r.status})`);
  else mal(`http:// no redirige a https:// (estado ${r.status})`);
} catch (e) {
  mal(`No se pudo comprobar la redirección HTTP: ${e.message}`);
}

// 4. Rutas de la aplicación
console.log('Rutas');
for (const ruta of ['/', '/mis-reservas', '/admin', '/admin/fechas', '/privacidad', '/auth/confirmar']) {
  try {
    const r = await fetch(new URL(ruta, sitio));
    const html = await r.text();
    if (r.status === 200 && html.includes('<div id="root">')) ok(`${ruta} → 200`);
    else mal(`${ruta} → ${r.status}`);
  } catch (e) {
    mal(`${ruta}: ${e.message}`);
  }
}
try {
  const r = await fetch(new URL('/logo-email.png', sitio));
  if (r.ok && (r.headers.get('content-type') ?? '').includes('image/png')) ok('El logo del correo se sirve como imagen');
  else mal(`/logo-email.png → ${r.status} ${r.headers.get('content-type')}`);
} catch (e) {
  mal(e.message);
}
try {
  const r = await fetch(new URL('/assets/no-existe.js', sitio));
  if (r.status === 404) ok('Un archivo inexistente devuelve 404');
  else mal(`/assets/no-existe.js devuelve ${r.status} (se esperaba 404)`);
} catch (e) {
  mal(e.message);
}

// 5. Cabeceras de seguridad
console.log('Cabeceras de seguridad');
try {
  const r = await fetch(sitio);
  for (const [cabecera, contiene] of [
    ['strict-transport-security', 'max-age='],
    ['content-security-policy', "frame-ancestors 'none'"],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin'],
  ]) {
    const v = r.headers.get(cabecera);
    if (v && v.includes(contiene)) ok(cabecera);
    else mal(`${cabecera} ausente o incorrecta (${v ?? 'no está'})`);
  }
} catch (e) {
  mal(e.message);
}

// 6. Supabase
console.log('Supabase');
const v = variables();
if (!v.VITE_SUPABASE_URL || !v.VITE_SUPABASE_PUBLISHABLE_KEY) {
  info('Sin VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY: se omite esta parte.');
} else {
  const base = v.VITE_SUPABASE_URL.replace(/\/$/, '');
  const cab = { apikey: v.VITE_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json', origin: sitio.origin };
  try {
    const r = await fetch(`${base}/rest/v1/rpc/calendario_publico`, { method: 'POST', headers: cab, body: '{}' });
    const datos = await r.json();
    if (r.ok && Array.isArray(datos)) ok(`calendario_publico responde (${datos.length} fechas próximas)`);
    else mal(`calendario_publico → ${r.status} ${JSON.stringify(datos).slice(0, 120)}`);
    const cors = r.headers.get('access-control-allow-origin');
    if (cors === '*' || cors === sitio.origin) ok(`CORS permite ${sitio.origin}`);
    else mal(`CORS: access-control-allow-origin = ${cors}`);
  } catch (e) {
    mal(`No se pudo contactar con Supabase: ${e.message} (¿proyecto pausado?)`);
  }
  try {
    const r = await fetch(`${base}/rest/v1/reservas?select=*`, { headers: cab });
    if (!r.ok) ok(`Un visitante no puede leer la tabla reservas (${r.status})`);
    else mal(`¡La tabla reservas responde ${r.status} a un visitante! Revisa la migración 300.`);
  } catch (e) {
    mal(e.message);
  }
  try {
    const r = await fetch(`${base}/rest/v1/rpc/admin_estadisticas`, { method: 'POST', headers: cab, body: '{}' });
    if (!r.ok) ok(`Un visitante no puede usar funciones de administración (${r.status})`);
    else mal(`¡admin_estadisticas responde ${r.status} a un visitante!`);
  } catch (e) {
    mal(e.message);
  }
}

console.log(fallos === 0 ? '\nTodo correcto.\n' : `\n${fallos} comprobación(es) con problemas.\n`);
process.exit(fallos === 0 ? 0 : 1);
