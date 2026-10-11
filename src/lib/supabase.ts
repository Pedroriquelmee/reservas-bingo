import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Clave publicable (sb_publishable_...) o la clave "anon" antigua. Es pública
// por diseño: la seguridad la ponen RLS y las funciones del servidor.
const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const faltaConfiguracion = !url || !clave;

export const supabase = createClient(url ?? 'http://localhost:54321', clave ?? 'falta-configuracion', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // El enlace del correo se procesa a mano en /auth/confirmar
    detectSessionInUrl: false,
  },
});
