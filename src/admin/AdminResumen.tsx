import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Aviso, Cargando, InsigniaEstado, Plazas } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoLargo, hoyMadrid, relativo } from '../lib/fechas';

export function AdminResumen() {
  const hoy = hoyMadrid();
  const stats = useQuery({ queryKey: ['admin', 'estadisticas'], queryFn: admin.estadisticas });
  const proximas = useQuery({ queryKey: ['admin', 'calendario', 'proximas', hoy], queryFn: () => admin.calendario(hoy, null) });

  if (stats.isPending) return <Cargando />;
  if (stats.isError) return <Aviso tipo="error">{mensajeDeError(stats.error)}</Aviso>;
  const s = stats.data;
  const porcentaje = s.plazas_totales_futuras ? Math.round((100 * s.plazas_ocupadas_futuras) / s.plazas_totales_futuras) : 0;

  const tarjetas = [
    { t: 'Domingos programados', v: s.fechas_programadas, d: `${s.fechas_completas} completos` },
    { t: 'Plazas ocupadas', v: `${s.plazas_ocupadas_futuras} / ${s.plazas_totales_futuras}`, d: `${porcentaje} % de las próximas` },
    { t: 'Reservas realizadas', v: s.reservas_realizadas, d: `${s.reservas_activas} activas` },
    { t: 'Cancelaciones', v: s.cancelaciones, d: 'en total' },
    { t: 'Participantes', v: s.participantes_activos, d: `${s.administradores} admin.` },
    { t: 'Domingos celebrados', v: s.fechas_pasadas, d: 'no cancelados' },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold">Resumen</h1>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tarjetas.map((c) => (
          <div key={c.t} className="rounded-xl bg-white p-4 ring-1 ring-marino-200">
            <dt className="text-sm text-marino-500">{c.t}</dt>
            <dd className="mt-1 text-2xl font-extrabold tabular-nums">{c.v}</dd>
            <dd className="text-xs text-marino-500">{c.d}</dd>
          </div>
        ))}
      </dl>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold">Próximos domingos</h2>
          <Link to="/admin/fechas" className="text-sm font-semibold text-fucsia-700 hover:underline">
            Gestionar fechas →
          </Link>
        </div>
        {proximas.isPending ? (
          <Cargando />
        ) : proximas.isError ? (
          <Aviso tipo="error">{mensajeDeError(proximas.error)}</Aviso>
        ) : proximas.data.length === 0 ? (
          <Aviso tipo="atencion">No hay fechas futuras. Créalas en «Fechas» o activa la generación automática en «Ajustes».</Aviso>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {proximas.data.slice(0, 6).map((f) => (
              <li key={f.id} className="rounded-xl bg-white p-4 ring-1 ring-marino-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-marino-500">{relativo(f.fecha, hoy)}</p>
                    <p className="font-bold">{formatoLargo(f.fecha)}</p>
                  </div>
                  <InsigniaEstado estado={f.estado} />
                </div>
                {f.estado !== 'cancelada' && (
                  <div className="mt-3">
                    <Plazas ocupadas={f.ocupadas} total={f.plazas_totales} />
                    <p className="mt-2 text-sm text-marino-700">
                      {f.reservas.length === 0
                        ? 'Sin personas apuntadas'
                        : f.reservas.map((r) => `${r.participante.nombre} ${r.participante.apellidos}`).join(' · ')}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
