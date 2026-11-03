import { useQuery } from '@tanstack/react-query';
import { obtenerAjustesPublicos } from './api';

/**
 * Número de plazas por domingo, tal y como está guardado en la base de datos
 * (se cambia en Administración → Ajustes). Devuelve null mientras carga o si
 * no se puede consultar; en ese caso los textos se muestran sin el número.
 */
export function usePlazasPorFecha(): number | null {
  const consulta = useQuery({
    queryKey: ['ajustes-publicos'],
    queryFn: obtenerAjustesPublicos,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return consulta.data?.plazas_por_fecha ?? null;
}
