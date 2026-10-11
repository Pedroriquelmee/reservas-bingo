import { Link, NavLink, Outlet } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { useNotificar } from './Notificaciones';

export const NOMBRE_GRUPO = 'Grupo Scout Alba 601';

/** Insignia del Grupo Scout Alba 601 (círculo marino con dibujo fucsia). */
export function Logotipo({ className = 'h-10 w-10', grande = false }: { className?: string; grande?: boolean }) {
  return (
    <img
      src={grande ? '/logo-alba601-256.webp' : '/logo-alba601-96.webp'}
      alt={NOMBRE_GRUPO}
      width={grande ? 256 : 96}
      height={grande ? 256 : 96}
      className={`shrink-0 rounded-full ${className}`}
      decoding="async"
    />
  );
}

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-marino-100 text-marino-900' : 'text-marino-800 hover:bg-marino-100'}`;

export function Estructura() {
  const { sesion, perfil, cerrarSesion } = useSesion();
  const notificar = useNotificar();

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b border-marino-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <Logotipo />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[17px] font-extrabold tracking-tight text-marino-900">Reservas de Bingo</span>
              <span className="block truncate text-xs font-semibold text-fucsia-700">{NOMBRE_GRUPO}</span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1" aria-label="Principal">
            {sesion ? (
              <>
                <NavLink to="/mis-reservas" className={claseEnlace}>
                  Mis reservas
                </NavLink>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-marino-800 hover:bg-marino-100"
                  onClick={async () => {
                    await cerrarSesion();
                    notificar('Has cerrado la sesión.', 'info');
                  }}
                  title={perfil ? `${perfil.nombre} ${perfil.apellidos}` : (sesion.user.email ?? undefined)}
                >
                  Salir
                </button>
              </>
            ) : (
              <NavLink to="/acceso" className={claseEnlace}>
                Entrar
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:pt-8">
        <Outlet />
      </main>

      <footer className="bg-marino-900 py-8 text-sm text-marino-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Logotipo className="h-10 w-10 ring-2 ring-fucsia-500/60" />
            <p className="leading-snug">
              <span className="font-semibold text-white">Reservas de Bingo</span> · una iniciativa del {NOMBRE_GRUPO}
              <span className="block text-marino-300">Máximo 3 personas por domingo</span>
            </p>
          </div>
          <span className="flex gap-4">
            <Link to="/privacidad" className="hover:text-white hover:underline">
              Privacidad
            </Link>
            <Link to="/admin" className="hover:text-white hover:underline">
              Administración
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
