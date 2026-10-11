import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useSesion } from '../auth/Sesion';
import { Aviso, Boton } from '../components/ui';
import { traducirErrorAuth } from '../lib/errores';

const TIPOS_VALIDOS: EmailOtpType[] = ['email', 'magiclink', 'signup'];

/**
 * Destino del enlace del correo. Pide un clic antes de usar el enlace:
 * algunos antivirus y gestores de correo "visitan" los enlaces y, sin este
 * paso, podrían gastar el código antes que la persona.
 */
export function AuthConfirmar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { sesion, verificarEnlace } = useSesion();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenHash = params.get('token_hash');
  const tipoParam = params.get('type') as EmailOtpType | null;
  const tipo: EmailOtpType = tipoParam && TIPOS_VALIDOS.includes(tipoParam) ? tipoParam : 'email';

  async function entrar() {
    if (!tokenHash) return;
    setOcupado(true);
    setError(null);
    try {
      await verificarEnlace(tokenHash, tipo);
      navigate('/', { replace: true });
    } catch (e) {
      setError(traducirErrorAuth(e));
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-extrabold">Entrar</h1>
      <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        {sesion && !error ? (
          <>
            <Aviso tipo="exito">Ya has iniciado sesión.</Aviso>
            <Link to="/" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-fucsia-700 px-4 font-semibold text-white hover:bg-fucsia-800">
              Ir a las reservas
            </Link>
          </>
        ) : !tokenHash ? (
          <>
            <Aviso tipo="error">El enlace está incompleto. Copia el enlace entero del correo o usa el código.</Aviso>
            <Link to="/acceso" className="text-fucsia-700 underline">
              Volver a entrar
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] text-slate-700">Pulsa el botón para terminar de entrar en este dispositivo.</p>
            {error && (
              <Aviso tipo="error">
                {error}{' '}
                <Link to="/acceso" className="font-semibold underline">
                  Pedir un código nuevo
                </Link>
              </Aviso>
            )}
            <Boton className="w-full" onClick={entrar} cargando={ocupado} disabled={!!error}>
              Entrar
            </Boton>
          </>
        )}
      </div>
    </div>
  );
}
