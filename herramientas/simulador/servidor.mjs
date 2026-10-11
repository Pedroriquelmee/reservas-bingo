// =====================================================================
// SIMULADOR LOCAL DE SUPABASE — solo para pruebas y para la demo.
//
// No es Supabase: imita la parte del protocolo que usa la web
// (supabase-js) para poder usarla sin cuentas externas:
//   · /rest/v1/rpc/<funcion>  → ejecuta la función en PostgreSQL con el
//     mismo rol y claims que pondría PostgREST (anon / authenticated).
//   · /auth/v1/otp, /verify, /token, /user, /logout → inicio de sesión
//     por código de un solo uso, con la plantilla de correo real.
//   · /realtime → no disponible (la web debe seguir funcionando sin él).
//
// La lógica de negocio y la seguridad (RLS, permisos, plazas) son las de
// las migraciones reales, ejecutadas en un PostgreSQL de verdad.
// =====================================================================
import { createServer } from 'node:http';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firmar, verificar } from './jwt.mjs';

const raiz = join(import.meta.dirname, '..', '..');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version, x-retry-count',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, x-supabase-api-version',
};

/**
 * @param {object} o
 * @param {{consulta: Function, transaccion: Function}} o.bd
 * @param {number} o.puerto
 * @param {string} o.sitio  URL de la web (para el enlace del correo)
 * @param {(correo: {email: string, codigo: string, enlace: string}) => void} [o.alEnviarCodigo]
 */
export function iniciarServidor({ bd, puerto, sitio, alEnviarCodigo }) {
  const plantilla = readFileSync(join(raiz, 'supabase/plantillas-email/codigo-acceso.html'), 'utf8');
  /** @type {Map<string, {codigo: string, hash: string, caduca: number, enviado: number, html: string}>} */
  const codigos = new Map();
  const refrescos = new Map(); // refresh_token -> id de usuario

  const responder = (res, estado, cuerpo) => {
    res.writeHead(estado, { 'content-type': 'application/json', ...CORS });
    res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
  };
  const errorAuth = (res, estado, codigo, msg) => responder(res, estado, { code: estado, error_code: codigo, msg });

  async function leerJson(req) {
    let datos = '';
    for await (const trozo of req) datos += trozo;
    return datos ? JSON.parse(datos) : {};
  }

  function identidad(req) {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || req.headers.apikey;
    return token ? verificar(token) : null;
  }

  async function usuarioPorId(id) {
    const { rows } = await bd.consulta('select id, email, created_at from auth.users where id = $1', [id]);
    return rows[0] ?? null;
  }

  const objetoUsuario = (u) => ({
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.created_at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: u.created_at,
    updated_at: u.created_at,
  });

  function sesionPara(u) {
    const ahora = Math.floor(Date.now() / 1000);
    const access = firmar({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: ahora, exp: ahora + 3600 });
    const refresh = randomBytes(24).toString('hex');
    refrescos.set(refresh, u.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: ahora + 3600, refresh_token: refresh, user: objetoUsuario(u) };
  }

  async function auth(req, res, ruta, url) {
    if (ruta === '/otp' && req.method === 'POST') {
      const { email, create_user } = await leerJson(req);
      const correo = String(email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
        return errorAuth(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
      }
      const previo = codigos.get(correo);
      if (previo && Date.now() - previo.enviado < 60_000) {
        return errorAuth(res, 429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 60 seconds.');
      }
      const { rows } = await bd.consulta('select id from auth.users where email = $1', [correo]);
      if (rows.length === 0) {
        if (create_user === false) return errorAuth(res, 422, 'otp_disabled', 'Signups not allowed for otp');
        await bd.consulta('insert into auth.users (id, email) values ($1, $2)', [randomUUID(), correo]);
      }
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const hash = createHash('sha224').update(correo + codigo + randomBytes(8).toString('hex')).digest('hex');
      const html = plantilla
        .replaceAll('{{ .Token }}', codigo)
        .replaceAll('{{ .TokenHash }}', hash)
        .replaceAll('{{ .SiteURL }}', sitio)
        .replaceAll('{{ .Email }}', correo);
      codigos.set(correo, { codigo, hash, caduca: Date.now() + 3600_000, enviado: Date.now(), html });
      alEnviarCodigo?.({ email: correo, codigo, enlace: `${sitio}/auth/confirmar?token_hash=${hash}&type=email` });
      return responder(res, 200, {});
    }

    if (ruta === '/verify' && req.method === 'POST') {
      const { email, token, token_hash } = await leerJson(req);
      let correo = null;
      if (token_hash) {
        for (const [c, d] of codigos) if (d.hash === token_hash) correo = c;
      } else {
        correo = String(email ?? '').trim().toLowerCase();
      }
      const d = correo ? codigos.get(correo) : null;
      const valido = d && d.caduca > Date.now() && (token_hash ? d.hash === token_hash : d.codigo === String(token));
      if (!valido) return errorAuth(res, 403, 'otp_expired', 'Token has expired or is invalid');
      codigos.delete(correo); // un solo uso
      const { rows } = await bd.consulta('select id, email, created_at from auth.users where email = $1', [correo]);
      return responder(res, 200, sesionPara(rows[0]));
    }

    if (ruta === '/token' && req.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = await leerJson(req);
      const id = refrescos.get(refresh_token);
      const u = id ? await usuarioPorId(id) : null;
      if (!u) return errorAuth(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refrescos.delete(refresh_token);
      return responder(res, 200, sesionPara(u));
    }

    if (ruta === '/user' && req.method === 'GET') {
      const c = identidad(req);
      const u = c?.sub ? await usuarioPorId(c.sub) : null;
      if (!u) return errorAuth(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist');
      return responder(res, 200, objetoUsuario(u));
    }

    if (ruta === '/logout' && req.method === 'POST') {
      res.writeHead(204, CORS);
      return res.end();
    }

    return errorAuth(res, 404, 'not_found', 'Ruta no simulada');
  }

  async function rpc(req, res, funcion) {
    if (!/^[a-z_]+$/.test(funcion)) return responder(res, 404, { code: 'PGRST202', message: 'Función no encontrada' });
    const claims = identidad(req);
    if (!claims) return responder(res, 401, { code: 'PGRST301', message: 'JWT inválido' });
    const rol = claims.role === 'authenticated' ? 'authenticated' : 'anon';
    const args = req.method === 'POST' ? await leerJson(req) : {};
    const claves = Object.keys(args);
    if (!claves.every((k) => /^[a-z_]+$/.test(k))) return responder(res, 400, { code: 'PGRST100', message: 'Argumento no válido' });

    try {
      const resultado = await bd.transaccion(async (q) => {
        await q(`set local role ${rol}`);
        await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        const lista = claves.map((k, i) => `${k} => $${i + 1}`).join(', ');
        const r = await q(`select public.${funcion}(${lista}) as r`, claves.map((k) => args[k]));
        return r.rows[0].r;
      });
      return responder(res, 200, resultado);
    } catch (e) {
      const estado = e.code === '42501' ? (rol === 'anon' ? 401 : 403) : e.code === '42883' ? 404 : 400;
      return responder(res, estado, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
    }
  }

  const servidor = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        return res.end();
      }
      if (url.pathname.startsWith('/auth/v1/')) return await auth(req, res, url.pathname.slice('/auth/v1'.length), url);
      if (url.pathname.startsWith('/rest/v1/rpc/')) return await rpc(req, res, url.pathname.slice('/rest/v1/rpc/'.length));
      // Ayudas para las pruebas automáticas
      if (url.pathname === '/__pruebas/correo') {
        const d = codigos.get(String(url.searchParams.get('email')).toLowerCase());
        return d ? responder(res, 200, { codigo: d.codigo, token_hash: d.hash, html: d.html }) : responder(res, 404, {});
      }
      if (url.pathname === '/__pruebas/olvidar-limites') {
        for (const d of codigos.values()) d.enviado = 0;
        return responder(res, 200, {});
      }
      return responder(res, 404, { message: 'No disponible en el simulador' });
    } catch (e) {
      console.error('[simulador]', e);
      responder(res, 500, { message: 'Error interno del simulador' });
    }
  });

  // Sin tiempo real: se cierran las conexiones WebSocket (la web cae a refresco periódico)
  servidor.on('upgrade', (_req, socket) => socket.destroy());

  return new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(puerto, () => resolver(servidor));
  });
}
