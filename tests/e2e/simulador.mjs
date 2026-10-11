// Arranca el simulador para las pruebas E2E sobre un PostgreSQL real
// (base desechable "bingo_e2e"; las pruebas la siembran directamente).
import { bdPostgres } from '../../herramientas/simulador/bd.mjs';
import { iniciarServidor } from '../../herramientas/simulador/servidor.mjs';

const ADMIN_URL = process.env.DATABASE_URL_ADMIN;
if (!ADMIN_URL) {
  console.error('Falta DATABASE_URL_ADMIN (PostgreSQL desechable)');
  process.exit(1);
}

const puerto = Number(process.env.PUERTO_SIMULADOR ?? 54321);
const bd = await bdPostgres(ADMIN_URL, 'bingo_e2e');
await iniciarServidor({ bd, puerto, sitio: process.env.URL_SITIO ?? 'http://localhost:4173' });
console.log(`Simulador de pruebas en http://localhost:${puerto}`);
