// =====================================================================
// MODO DEMOSTRACIÓN · npm run demo
//
// Arranca la web en http://localhost:5173 con una base de datos
// PostgreSQL de verdad (PGlite, en memoria), las migraciones reales y
// datos de ejemplo. No necesita Supabase, cuentas ni instalar nada más.
// Los "correos" no se envían: el código de acceso aparece en la terminal.
// Los datos se pierden al cerrar (Ctrl+C).
// =====================================================================
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { bdPglite } from '../herramientas/simulador/bd.mjs';
import { CLAVE_ANON } from '../herramientas/simulador/jwt.mjs';
import { iniciarServidor } from '../herramientas/simulador/servidor.mjs';

const [mayor, menor] = process.versions.node.split('.').map(Number);
if (mayor < 20 || (mayor === 20 && menor < 19)) {
  console.error(`\nNecesitas Node.js 20.19 o superior (tienes ${process.versions.node}). Descarga la versión LTS en https://nodejs.org\n`);
  process.exit(1);
}

const raiz = join(import.meta.dirname, '..');
const PUERTO_API = 54329;
const PUERTO_WEB = 5173;
const WEB = `http://localhost:${PUERTO_WEB}`;
const ADMIN = 'admin@demo.local';

console.log('\nPreparando la base de datos de demostración (unos segundos)…');
const bd = await bdPglite();
await sembrar();

try {
  await iniciarServidor({
    bd,
    puerto: PUERTO_API,
    sitio: WEB,
    alEnviarCodigo: ({ email, codigo, enlace }) => {
      console.log(`\n  📧  Código para ${email}:  \x1b[1m${codigo}\x1b[0m`);
      console.log(`      (o abre este enlace: ${enlace})\n`);
    },
  });
} catch (e) {
  console.error(`\nNo se pudo usar el puerto ${PUERTO_API} (${e.code}). ¿Hay otra demo abierta? Ciérrala e inténtalo de nuevo.\n`);
  process.exit(1);
}

const vite = spawn(process.execPath, [join(raiz, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PUERTO_WEB), '--strictPort'], {
  cwd: raiz,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Tienen prioridad sobre .env.local: la demo nunca toca tu Supabase real
    VITE_SUPABASE_URL: `http://localhost:${PUERTO_API}`,
    VITE_SUPABASE_PUBLISHABLE_KEY: CLAVE_ANON,
    VITE_RESPONSABLE_TRATAMIENTO: 'Grupo Scout Alba 601 (demostración)',
    VITE_CONTACTO_PRIVACIDAD: 'privacidad@demo.local',
  },
});

vite.on('exit', (codigo) => process.exit(codigo ?? 0));
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    vite.kill(senal);
    process.exit(0);
  });
}

setTimeout(() => {
  console.log(`
\x1b[1m────────────────────────────────────────────────────────────\x1b[0m
 \x1b[1mReservas de Bingo · Grupo Scout Alba 601 · DEMOSTRACIÓN\x1b[0m
 Abre en el navegador:  \x1b[1m${WEB}\x1b[0m

 · Para reservar, entra con cualquier correo inventado
   (p. ej. tu@demo.local). El código aparecerá aquí.
 · Panel de administración: entra con \x1b[1m${ADMIN}\x1b[0m
   y pulsa «Administración» al pie de la página.
 · Datos de ejemplo; se borran al cerrar con Ctrl+C.
 · Sin tiempo real en la demo: la web se refresca sola cada 30 s.
\x1b[1m────────────────────────────────────────────────────────────\x1b[0m
`);
}, 1500);

// ---------------------------------------------------------------------
// Datos de ejemplo, creados con las mismas funciones que usa la web
// ---------------------------------------------------------------------
async function como(uid, funcion, args = {}) {
  return bd.transaccion(async (q) => {
    await q('set local role authenticated');
    await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    const claves = Object.keys(args);
    const lista = claves.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const r = await q(`select public.${funcion}(${lista}) as r`, claves.map((k) => args[k]));
    return r.rows[0].r;
  });
}

async function cuenta(email, nombre, apellidos) {
  const { rows } = await bd.consulta('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [email]);
  const uid = rows[0].id;
  const perfil = await como(uid, 'guardar_mi_perfil', { p_nombre: nombre, p_apellidos: apellidos });
  return { uid, id: perfil.id };
}

async function sembrar() {
  const { rows } = await bd.consulta(
    `select (d + ((7 - extract(isodow from d)::int) % 7))::text as domingo from (select public.hoy_madrid() as d) x`,
  );
  const d0 = rows[0].domingo;
  const dia = async (n) => (await bd.consulta(`select ($1::date + $2::int)::text as d`, [d0, n])).rows[0].d;

  const admin = await cuenta(ADMIN, 'Admin', 'Demo');
  await bd.consulta(`update public.participantes set rol = 'admin' where id = $1`, [admin.id]);
  const maria = await cuenta('maria@demo.local', 'María', 'García López');
  const javier = await cuenta('javier@demo.local', 'Javier', 'Martín');
  const lucia = await cuenta('lucia@demo.local', 'Lucía', 'Fernández');
  const carmen = await como(admin.uid, 'admin_crear_participante', { p_nombre: 'Carmen', p_apellidos: 'Sánchez' });

  const fecha = async (n, notas = null) => (await como(admin.uid, 'admin_crear_fecha', { p_fecha: await dia(n), p_notas: notas })).id;
  const pasada = await fecha(-14);
  const f1 = await fecha(0, 'De 17:00 a 20:00');
  const f2 = await fecha(14);
  await fecha(28);
  const f4 = await fecha(42);

  for (const p of [lucia, javier, maria]) await como(admin.uid, 'admin_reservar_para', { p_participante_id: p.id, p_fecha_id: pasada });
  await como(maria.uid, 'reservar', { p_fecha_id: f1 });
  await como(javier.uid, 'reservar', { p_fecha_id: f1 });
  await como(maria.uid, 'reservar', { p_fecha_id: f2 });
  await como(lucia.uid, 'reservar', { p_fecha_id: f2 });
  await como(admin.uid, 'admin_reservar_para', { p_participante_id: carmen.id, p_fecha_id: f2 });
  await como(admin.uid, 'admin_cancelar_fecha', { p_id: f4, p_motivo: 'Fiestas del barrio', p_confirmar: false });
}
