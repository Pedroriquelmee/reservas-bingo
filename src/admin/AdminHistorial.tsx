import { useInfiniteQuery } from '@tanstack/react-query';
import { Aviso, Boton, Cargando } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoMomento } from '../lib/fechas';
import { describirEntrada } from './utilidades';

const POR_PAGINA = 100;

const colores: Record<string, string> = {
  reserva_creada: 'bg-emerald-500',
  reserva_cancelada: 'bg-red-500',
  reserva_movida: 'bg-sky-500',
  fecha_cancelada: 'bg-red-500',
};

export function AdminHistorial() {
  const consulta = useInfiniteQuery({
    queryKey: ['admin', 'historial'],
    queryFn: ({ pageParam }) => admin.historial(pageParam, POR_PAGINA),
    initialPageParam: null as number | null,
    getNextPageParam: (ultima) => (ultima.length === POR_PAGINA ? ultima[ultima.length - 1].id : undefined),
  });

  const entradas = consulta.data?.pages.flat() ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Historial</h1>
      <p className="text-sm text-marino-600">Registro de reservas, cancelaciones y cambios. Lo más reciente, arriba.</p>

      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
      ) : entradas.length === 0 ? (
        <Aviso tipo="info">Todavía no hay actividad.</Aviso>
      ) : (
        <>
          <ol className="divide-y divide-marino-100 rounded-xl bg-white ring-1 ring-marino-200">
            {entradas.map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${colores[e.accion] ?? 'bg-marino-400'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[15px]">{describirEntrada(e)}</p>
                  <p className="text-xs text-marino-500">
                    {formatoMomento(e.ocurrido_en)}
                    {e.actor ? ` · por ${e.actor}` : ' · sistema'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {consulta.hasNextPage && (
            <Boton variante="secundario" onClick={() => consulta.fetchNextPage()} cargando={consulta.isFetchingNextPage}>
              Cargar más
            </Boton>
          )}
        </>
      )}
    </div>
  );
}
