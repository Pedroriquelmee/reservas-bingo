import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProveedorSesion } from './auth/Sesion';
import { Estructura } from './components/Estructura';
import { ProveedorNotificaciones } from './components/Notificaciones';
import { Cargando } from './components/ui';
import { faltaConfiguracion } from './lib/supabase';
import { ProveedorTiempoReal } from './lib/tiempoReal';
import { Acceso } from './paginas/Acceso';
import { AuthConfirmar } from './paginas/AuthConfirmar';
import { Inicio } from './paginas/Inicio';
import { MisReservas } from './paginas/MisReservas';
import { NoEncontrada } from './paginas/NoEncontrada';
import { Privacidad } from './paginas/Privacidad';

const RutasAdmin = lazy(() => import('./admin'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Los errores de permisos no se arreglan reintentando
      retry: (intentos, error: any) => intentos < 2 && !['NO_AUTORIZADO', 'NO_AUTENTICADO'].includes(error?.codigo),
    },
  },
});

export default function App() {
  if (faltaConfiguracion) return <ConfiguracionPendiente />;

  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorNotificaciones>
        <ProveedorSesion>
          <ProveedorTiempoReal>
            <BrowserRouter>
              <Routes>
                <Route element={<Estructura />}>
                  <Route index element={<Inicio />} />
                  <Route path="mis-reservas" element={<MisReservas />} />
                  <Route path="acceso" element={<Acceso />} />
                  <Route path="auth/confirmar" element={<AuthConfirmar />} />
                  <Route path="privacidad" element={<Privacidad />} />
                  <Route path="*" element={<NoEncontrada />} />
                </Route>
                <Route
                  path="admin/*"
                  element={
                    <Suspense fallback={<Cargando />}>
                      <RutasAdmin />
                    </Suspense>
                  }
                />
              </Routes>
            </BrowserRouter>
          </ProveedorTiempoReal>
        </ProveedorSesion>
      </ProveedorNotificaciones>
    </QueryClientProvider>
  );
}

function ConfiguracionPendiente() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-bold">Falta la configuración</h1>
      <p className="mt-2 text-slate-700">
        Define <code className="rounded bg-slate-200 px-1 font-mono">VITE_SUPABASE_URL</code> y{' '}
        <code className="rounded bg-slate-200 px-1 font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code> en el archivo{' '}
        <code className="rounded bg-slate-200 px-1 font-mono">.env.local</code> (desarrollo) o en las variables de entorno de Vercel
        (producción) y vuelve a construir la web.
      </p>
    </div>
  );
}
