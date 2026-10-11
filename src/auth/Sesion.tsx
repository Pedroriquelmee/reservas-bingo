import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { obtenerMiPerfil } from '../lib/api';
import type { Perfil } from '../lib/tipos';

interface ValorSesion {
  sesion: Session | null;
  /** true mientras se recupera la sesión guardada al abrir la web */
  iniciando: boolean;
  email: string | null;
  perfil: Perfil | null;
  cargandoPerfil: boolean;
  errorPerfil: unknown;
  esAdmin: boolean;
  enviarCodigo: (email: string) => Promise<void>;
  verificarCodigo: (email: string, codigo: string) => Promise<void>;
  verificarEnlace: (tokenHash: string, tipo: EmailOtpType) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  refrescarPerfil: () => Promise<unknown>;
}

const Contexto = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let activo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (activo) setSesion(data.session);
      })
      .finally(() => activo && setIniciando(false));

    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
    });
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const uid = sesion?.user.id ?? null;

  const perfil = useQuery({
    queryKey: ['perfil', uid],
    queryFn: obtenerMiPerfil,
    enabled: !!uid,
    staleTime: 60_000,
  });

  const enviarCodigo = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/confirmar`,
      },
    });
    if (error) throw error;
  }, []);

  const verificarCodigo = useCallback(async (email: string, codigo: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo,
      type: 'email',
    });
    if (error) throw error;
  }, []);

  const verificarEnlace = useCallback(async (tokenHash: string, tipo: EmailOtpType) => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    if (error) throw error;
  }, []);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    queryClient.removeQueries({ queryKey: ['perfil'] });
    queryClient.removeQueries({ queryKey: ['mis-reservas'] });
    queryClient.removeQueries({ queryKey: ['admin'] });
    await queryClient.invalidateQueries({ queryKey: ['calendario'] });
  }, [queryClient]);

  const valor = useMemo<ValorSesion>(() => {
    const p = uid ? (perfil.data ?? null) : null;
    return {
      sesion,
      iniciando,
      email: sesion?.user.email ?? null,
      perfil: p,
      cargandoPerfil: !!uid && perfil.isPending,
      errorPerfil: perfil.error,
      esAdmin: !!p && p.rol === 'admin' && p.activo,
      enviarCodigo,
      verificarCodigo,
      verificarEnlace,
      cerrarSesion,
      refrescarPerfil: () => perfil.refetch(),
    };
  }, [sesion, iniciando, uid, perfil, enviarCodigo, verificarCodigo, verificarEnlace, cerrarSesion]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSesion fuera de ProveedorSesion');
  return v;
}
