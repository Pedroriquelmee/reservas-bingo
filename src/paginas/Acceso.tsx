import { useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSesion } from '../auth/Sesion';
import { FormularioPerfil } from '../components/FormularioPerfil';
import { PanelAcceso } from '../components/PanelAcceso';
import { Cargando } from '../components/ui';

/** Solo se permiten destinos internos (evita redirecciones abiertas). */
export function destinoSeguro(valor: string | null): string {
  return valor && valor.startsWith('/') && !valor.startsWith('//') ? valor : '/';
}

export function Acceso() {
  const { sesion, iniciando, perfil, cargandoPerfil } = useSesion();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const destino = destinoSeguro(params.get('siguiente'));

  useEffect(() => {
    if (sesion && perfil) navigate(destino, { replace: true });
  }, [sesion, perfil, destino, navigate]);

  if (iniciando || (sesion && cargandoPerfil)) return <Cargando />;
  if (sesion && perfil) return <Navigate to={destino} replace />;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-extrabold">{sesion ? 'Completa tus datos' : 'Entrar'}</h1>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        {sesion ? <FormularioPerfil textoBoton="Continuar" /> : <PanelAcceso />}
      </div>
    </div>
  );
}
