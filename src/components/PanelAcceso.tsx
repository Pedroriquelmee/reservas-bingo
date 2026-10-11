import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { traducirErrorAuth } from '../lib/errores';
import { limpiarCodigo, validarCodigo, validarEmail } from '../lib/validacion';
import { Aviso, Boton, Campo } from './ui';

const ESPERA_REENVIO = 60;

/**
 * Inicio de sesión sin contraseña: la persona escribe su correo y recibe
 * un código (y un enlace). Supabase gestiona las credenciales.
 */
export function PanelAcceso({ intro }: { intro?: string }) {
  const { enviarCodigo, verificarCodigo } = useSesion();
  const [paso, setPaso] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [espera, setEspera] = useState(0);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function pedirCodigo(e?: FormEvent) {
    e?.preventDefault();
    const fallo = validarEmail(email);
    setErrorCampo(fallo);
    setError(null);
    if (fallo) return;
    setOcupado(true);
    try {
      await enviarCodigo(email);
      setPaso('codigo');
      setCodigo('');
      setEspera(ESPERA_REENVIO);
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setOcupado(false);
    }
  }

  async function comprobarCodigo(e: FormEvent) {
    e.preventDefault();
    const fallo = validarCodigo(codigo);
    setErrorCampo(fallo);
    setError(null);
    if (fallo) return;
    setOcupado(true);
    try {
      await verificarCodigo(email, limpiarCodigo(codigo));
      // La sesión se actualiza sola (onAuthStateChange)
    } catch (err) {
      setError(traducirErrorAuth(err));
      setOcupado(false);
    }
  }

  if (paso === 'email') {
    return (
      <form onSubmit={pedirCodigo} noValidate className="space-y-4">
        <p className="text-[15px] text-slate-700">
          {intro ?? 'Escribe tu correo y te enviaremos un código para entrar. No necesitas contraseña.'}
        </p>
        <Campo
          etiqueta="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errorCampo}
          required
          autoFocus
        />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" cargando={ocupado} className="w-full">
          Enviar código
        </Boton>
        <p className="text-xs text-slate-500">
          Solo usamos tu correo para identificarte; nunca se muestra a otras personas.{' '}
          <Link to="/privacidad" className="underline hover:text-slate-800">
            Privacidad
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={comprobarCodigo} noValidate className="space-y-4">
      <Aviso tipo="info">
        Te hemos enviado un correo a <strong className="break-all">{email.trim().toLowerCase()}</strong> con un código. Escríbelo
        aquí o pulsa el enlace del correo. Si no lo ves, mira en «Spam».
      </Aviso>
      <Campo
        etiqueta="Código del correo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={10}
        value={codigo}
        onChange={(e) => setCodigo(limpiarCodigo(e.target.value))}
        error={errorCampo}
        className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.4em]"
        autoFocus
      />
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton type="submit" cargando={ocupado} className="w-full">
        Entrar
      </Boton>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="text-slate-600 underline hover:text-slate-900" onClick={() => setPaso('email')}>
          Cambiar correo
        </button>
        <button
          type="button"
          className="text-fucsia-700 underline hover:text-fucsia-900 disabled:text-slate-400 disabled:no-underline"
          disabled={espera > 0 || ocupado}
          onClick={() => pedirCodigo()}
        >
          {espera > 0 ? `Reenviar código (${espera} s)` : 'Reenviar código'}
        </button>
      </div>
    </form>
  );
}
