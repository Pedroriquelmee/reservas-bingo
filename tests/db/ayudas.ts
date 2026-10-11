// Ayudas para ejecutar SQL "como" un visitante, un participante o un admin,
// igual que lo hace Supabase (rol + claims del JWT en la sesión).
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type Rol = 'anon' | 'authenticated';

export interface Usuario {
  uid: string;
  email: string;
}

export class Bd {
  constructor(public pool: pg.Pool) {}

  /** Consulta como superusuario (preparar datos / comprobar resultados). */
  async sql<T = Record<string, unknown>>(texto: string, valores: unknown[] = []): Promise<T[]> {
    const r = await this.pool.query(texto, valores);
    return r.rows as T[];
  }

  async limpiar(): Promise<void> {
    await this.pool.query(`
      truncate public.historial, public.reservas, public.fechas_bingo, public.participantes restart identity cascade;
      delete from auth.users;
      update public.configuracion
         set generacion_automatica = false, intervalo_dias = 14,
             fecha_referencia = null, fechas_futuras_minimas = 6;
    `);
  }

  /** Ejecuta fn dentro de una transacción con el rol y el usuario indicados. */
  async como<T>(uid: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await this.fijarIdentidad(c, uid);
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  async fijarIdentidad(c: pg.PoolClient, uid: string | null): Promise<void> {
    await c.query(uid ? 'set local role authenticated' : 'set local role anon');
    const claims = uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' };
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  }

  /** Llama a una función RPC con argumentos con nombre, como PostgREST. */
  async rpc<T = any>(uid: string | null, funcion: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.como(uid, (c) => llamar<T>(c, funcion, args));
  }

  async crearUsuario(email = `${randomUUID().slice(0, 8)}@prueba.test`): Promise<Usuario> {
    const uid = randomUUID();
    await this.sql('insert into auth.users (id, email) values ($1, $2)', [uid, email]);
    return { uid, email };
  }

  /** Usuario con cuenta y perfil completo (nombre y apellidos). */
  async crearParticipante(nombre: string, apellidos = 'Prueba'): Promise<Usuario & { id: string }> {
    const u = await this.crearUsuario();
    const perfil = await this.rpc(u.uid, 'guardar_mi_perfil', { p_nombre: nombre, p_apellidos: apellidos });
    return { ...u, id: perfil.id };
  }

  async crearAdmin(nombre = 'Admin'): Promise<Usuario & { id: string }> {
    const p = await this.crearParticipante(nombre, 'Gestor');
    await this.sql(`update public.participantes set rol = 'admin' where id = $1`, [p.id]);
    return p;
  }

  /** Fecha relativa a "hoy" en Madrid (n días) como 'YYYY-MM-DD'. */
  async dia(n: number): Promise<string> {
    const [r] = await this.sql<{ d: string }>(`select (public.hoy_madrid() + $1::int)::text as d`, [n]);
    return r.d;
  }

  async crearFecha(diasDesdeHoy: number): Promise<{ id: string; fecha: string }> {
    const fecha = await this.dia(diasDesdeHoy);
    const [r] = await this.sql<{ id: string }>(
      'insert into public.fechas_bingo (fecha) values ($1) returning id',
      [fecha],
    );
    return { id: r.id, fecha };
  }

  async reservasActivas(fechaId: string): Promise<number> {
    const [r] = await this.sql<{ n: number }>(
      `select count(*)::int as n from public.reservas where fecha_id = $1 and estado = 'activa'`,
      [fechaId],
    );
    return r.n;
  }

  async estadoFecha(fechaId: string): Promise<string> {
    const [r] = await this.sql<{ estado: string }>('select estado from public.fechas_bingo where id = $1', [fechaId]);
    return r.estado;
  }
}

export async function llamar<T = any>(c: pg.PoolClient, funcion: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^[a-z_]+$/.test(funcion)) throw new Error('nombre de función no válido');
  const claves = Object.keys(args);
  const lista = claves.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const r = await c.query(`select public.${funcion}(${lista}) as r`, claves.map((k) => args[k]));
  return r.rows[0].r as T;
}

/** Espera que una promesa falle con un código de negocio concreto. */
export async function fallaCon(p: Promise<unknown>, codigo: string): Promise<{ message: string; detail?: string; code?: string }> {
  try {
    await p;
  } catch (e: any) {
    if (e.message !== codigo) {
      throw new Error(`Se esperaba el error ${codigo} y llegó: ${e.message}`);
    }
    return e;
  }
  throw new Error(`Se esperaba el error ${codigo} y la operación tuvo éxito`);
}
