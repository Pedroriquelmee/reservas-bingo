// JWT HS256 mínimo para el simulador local (pruebas y demo). No se usa en producción.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SECRETO = 'secreto-solo-para-pruebas-locales-no-usar-en-produccion';

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

export function firmar(carga) {
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(carga)}`;
  const firma = createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function verificar(token) {
  const partes = String(token).split('.');
  if (partes.length !== 3) return null;
  const esperada = createHmac('sha256', SECRETO).update(`${partes[0]}.${partes[1]}`).digest();
  const recibida = Buffer.from(partes[2], 'base64url');
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  const carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString());
  if (carga.exp && carga.exp < Date.now() / 1000) return null;
  return carga;
}

/** Clave "publicable" del simulador: un JWT con rol anon. */
export const CLAVE_ANON = firmar({ role: 'anon', iss: 'simulador', iat: 1760000000, exp: 4102444800 });
