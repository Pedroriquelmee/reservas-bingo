import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSesion } from '../auth/Sesion';
import { Logotipo } from '../components/Estructura';
import { FormularioPerfil } from '../components/FormularioPerfil';
import { PanelAcceso } from '../components/PanelAcceso';
import { Aviso, Cargando } from '../components/ui';
import { admin } from '../lib/api';

const pestanas = [
  { a: '/admin', texto: 'Resumen', fin: true },
  { a: '/admin/fechas', texto: 'Fechas' },
  { a: '/admin/reservas', texto: 'Reservas' },
  { a: '/admin/participantes', texto: 'Participantes' },
  { a: '/admin/historial', texto: 'Historial' },
  { a: '/admin/ajustes', texto: 'Ajustes' },
];

/**
 * Puerta del panel. Ocultar el panel en el navegador es solo comodidad:
 * cada función admin_* vuelve a comprobar el rol en la base de datos.
 */
export default function AdminRaiz() {
  const { sesion, iniciando, perfil, cargandoPerfil, esAdmin, cerrarSesion } = useSesion();

  let contenido;
  if (iniciando || (sesion && cargandoPerfil)) {
    contenido = <Cargando />;
  } else if (!sesion) {
    contenido = (
      <Caja titulo="Acceso de administración">
        <PanelAcceso intro="Identifícate con el correo de tu cuenta de administración." />
      </Caja>
    );
  } else if (!perfil) {
    contenido = (
      <Caja titulo="Completa tus datos">
        <FormularioPerfil textoBoton="Continuar" />
      </Caja>
    );
  } else if (!esAdmin) {
    contenido = (
      <div className="mx-auto max-w-md">
        <Aviso tipo="error" titulo="Acceso restringido">
          Tu cuenta no tiene permisos de administración. Si crees que deberías tenerlos, pídeselo a un administrador.
        </Aviso>
        <Link to="/" className="mt-4 inline-block text-fucsia-700 underline">
          Volver a las reservas
        </Link>
      </div>
    );
  } else {
    contenido = <PanelAdmin />;
  }

  return (
    <div className="min-h-dvh bg-marino-50">
      <header className="border-t-4 border-fucsia-500 bg-marino-950 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
            <Logotipo />
            <span className="truncate font-bold">
              Reservas de Bingo <span className="font-normal text-fucsia-300">· Administración</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1 text-sm">
            <Link to="/" className="rounded-lg px-3 py-2 font-semibold text-marino-200 hover:bg-white/10">
              Web pública
            </Link>
            {sesion && (
              <button type="button" onClick={() => cerrarSesion()} className="rounded-lg px-3 py-2 font-semibold text-marino-200 hover:bg-white/10">
                Salir
              </button>
            )}
          </div>
        </div>
        {esAdmin && (
          <nav aria-label="Secciones de administración" className="mx-auto max-w-6xl overflow-x-auto px-2">
            <ul className="flex gap-1">
              {pestanas.map((p) => (
                <li key={p.a}>
                  <NavLink
                    to={p.a}
                    end={p.fin}
                    className={({ isActive }) =>
                      `block whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold ${
                        isActive ? 'bg-marino-50 text-marino-900' : 'text-marino-300 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    {p.texto}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">{contenido}</main>
    </div>
  );
}

function PanelAdmin() {
  const queryClient = useQueryClient();
  const hecho = useRef(false);

  // Si la generación automática está activada, completa el calendario al entrar
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    admin
      .asegurarFechasFuturas()
      .then((r) => {
        if (r.creadas.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['admin'] });
          queryClient.invalidateQueries({ queryKey: ['calendario'] });
        }
      })
      .catch(() => {
        /* no bloquea el panel */
      });
  }, [queryClient]);

  return <Outlet />;
}

function Caja({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-extrabold">{titulo}</h1>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-marino-200">{children}</div>
    </div>
  );
}
