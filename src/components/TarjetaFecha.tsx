import { formatoLargo, relativo } from '../lib/fechas';
import type { FechaPublica } from '../lib/tipos';
import { Boton, InsigniaEstado, Plazas } from './ui';

interface Props {
  fecha: FechaPublica;
  hoy: string;
  onReservar: (f: FechaPublica) => void;
  onCancelar: (f: FechaPublica) => void;
}

export function TarjetaFecha({ fecha, hoy, onReservar, onCancelar }: Props) {
  const cancelada = fecha.estado === 'cancelada';
  const completa = fecha.estado === 'completa' || fecha.ocupadas >= fecha.plazas_totales;
  const libres = Math.max(fecha.plazas_totales - fecha.ocupadas, 0);
  const mia = !!fecha.mi_reserva_id;
  const estado = cancelada ? 'cancelada' : completa ? 'completa' : 'abierta';
  const titulo = formatoLargo(fecha.fecha);

  return (
    <article
      aria-label={titulo}
      className={`flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ${
        mia ? 'ring-2 ring-fucsia-600' : 'ring-slate-200'
      } ${cancelada ? 'bg-slate-100/70' : ''}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{relativo(fecha.fecha, hoy)}</p>
          <h3 className={`mt-0.5 text-lg font-bold leading-snug ${cancelada ? 'text-slate-500 line-through' : ''}`}>{titulo}</h3>
        </div>
        <InsigniaEstado estado={estado} />
      </header>

      {fecha.notas && <p className="mt-2 text-sm text-slate-600">{fecha.notas}</p>}

      {cancelada ? (
        <div className="mt-4 rounded-xl bg-slate-200/60 p-3 text-sm text-slate-700">
          <p className="font-semibold">Este domingo no hay bingo.</p>
          {fecha.motivo_cancelacion && <p className="mt-0.5">Motivo: {fecha.motivo_cancelacion}</p>}
        </div>
      ) : (
        <div className="mt-4 flex-1 space-y-3">
          <div>
            <Plazas ocupadas={fecha.ocupadas} total={fecha.plazas_totales} />
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-slate-500">Plazas ocupadas</dt>
                <dd className="font-semibold">
                  {fecha.ocupadas} de {fecha.plazas_totales}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Plazas disponibles</dt>
                <dd className={`font-semibold ${libres === 0 ? 'text-marino-900' : 'text-emerald-800'}`}>{libres}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="text-sm text-slate-500">Personas apuntadas</p>
            {fecha.participantes.length === 0 ? (
              <p className="mt-1 text-[15px] italic text-slate-500">Todavía no hay nadie apuntado.</p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {fecha.participantes.map((p) => (
                  <li key={p.plaza} className="rounded-full bg-slate-100 px-3 py-1 text-[15px] font-medium text-slate-800">
                    {p.nombre}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!cancelada && (
        <footer className="mt-5">
          {mia ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-fucsia-800">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
                </svg>
                Tienes plaza este domingo
              </p>
              <Boton variante="secundario" className="w-full" onClick={() => onCancelar(fecha)}>
                Cancelar mi plaza
              </Boton>
            </div>
          ) : completa ? (
            <Boton variante="secundario" disabled className="w-full">
              COMPLETO
            </Boton>
          ) : (
            <Boton className="w-full" onClick={() => onReservar(fecha)}>
              Reservar plaza
            </Boton>
          )}
        </footer>
      )}
    </article>
  );
}
