import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Aviso, Boton, Campo, Cargando, Confirmacion } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoCorto, formatoLargo, formatoMomento, hoyMadrid } from '../lib/fechas';
import type { AdminReserva } from '../lib/tipos';
import { Filtros, useAccion } from './comun';
import { descargarCsv } from './utilidades';

type Filtro = 'activa' | 'cancelada' | 'todas';

export function AdminReservas() {
  const [filtro, setFiltro] = useState<Filtro>('activa');
  const [busqueda, setBusqueda] = useState('');
  const [aCancelar, setACancelar] = useState<AdminReserva | null>(null);
  const accion = useAccion();
  const hoy = hoyMadrid();

  const consulta = useQuery({
    queryKey: ['admin', 'reservas', filtro],
    queryFn: () => admin.listarReservas(filtro === 'todas' ? null : filtro),
  });

  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return (consulta.data ?? []).filter(
      (r) => !t || `${r.participante.nombre} ${r.participante.apellidos} ${r.participante.email ?? ''} ${formatoCorto(r.fecha.fecha)}`.toLowerCase().includes(t),
    );
  }, [consulta.data, busqueda]);

  function exportar() {
    descargarCsv(
      `reservas-bingo-${hoy}.csv`,
      ['Domingo', 'Nombre', 'Apellidos', 'Correo', 'Plaza', 'Estado', 'Reservada el', 'Cancelada el', 'Motivo'],
      filas.map((r) => [
        r.fecha.fecha,
        r.participante.nombre,
        r.participante.apellidos,
        r.participante.email,
        r.plaza,
        r.estado,
        formatoMomento(r.creada_en),
        r.cancelada_en ? formatoMomento(r.cancelada_en) : '',
        r.motivo_cancelacion,
      ]),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Reservas</h1>
        <Boton variante="secundario" onClick={exportar} disabled={filas.length === 0}>
          Exportar CSV
        </Boton>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Filtros
          etiqueta="Estado"
          valor={filtro}
          onCambio={setFiltro}
          opciones={[
            { valor: 'activa', texto: 'Activas' },
            { valor: 'cancelada', texto: 'Canceladas' },
            { valor: 'todas', texto: 'Todas' },
          ]}
        />
        <Campo etiqueta="Buscar" type="search" placeholder="Nombre, correo o fecha" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full sm:w-72" />
      </div>

      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
      ) : filas.length === 0 ? (
        <Aviso tipo="info">No hay reservas que coincidan.</Aviso>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-marino-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Listado de reservas</caption>
            <thead className="bg-marino-50 text-xs uppercase tracking-wider text-marino-500">
              <tr>
                <th scope="col" className="px-4 py-3">Domingo</th>
                <th scope="col" className="px-4 py-3">Persona</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Reservada</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-marino-100">
              {filas.map((r) => (
                <tr key={r.id} className={r.estado === 'cancelada' ? 'text-marino-500' : ''}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatoCorto(r.fecha.fecha)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-marino-900">
                      {r.participante.nombre} {r.participante.apellidos}
                    </span>
                    <span className="block text-xs">{r.participante.email ?? 'sin cuenta'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.estado === 'activa' ? (
                      <span className="font-semibold text-emerald-700">Activa</span>
                    ) : (
                      <>
                        <span className="font-semibold">Cancelada</span>
                        <span className="block text-xs">
                          {r.cancelada_en && formatoMomento(r.cancelada_en)}
                          {r.motivo_cancelacion && ` · ${r.motivo_cancelacion}`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{formatoMomento(r.creada_en)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.estado === 'activa' && (
                      <Boton variante="fantasma" tamano="pequeno" className="text-red-700" onClick={() => setACancelar(r)}>
                        Cancelar
                      </Boton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-marino-500">Para mover una reserva a otro domingo, usa la sección «Fechas».</p>

      <Confirmacion
        abierto={!!aCancelar}
        titulo="Cancelar reserva"
        textoConfirmar="Cancelar reserva"
        variante="peligro"
        cargando={accion.ocupado}
        onCerrar={() => {
          setACancelar(null);
          accion.setError(null);
        }}
        onConfirmar={async () => {
          if (aCancelar && (await accion.ejecutar(() => admin.cancelarReserva(aCancelar.id, null), 'Reserva cancelada.'))) setACancelar(null);
        }}
      >
        {aCancelar && (
          <p>
            Se cancelará la plaza de{' '}
            <strong>
              {aCancelar.participante.nombre} {aCancelar.participante.apellidos}
            </strong>{' '}
            del {formatoLargo(aCancelar.fecha.fecha)}.
          </p>
        )}
        {aCancelar && accion.error && <Aviso tipo="error">{accion.error.mensaje}</Aviso>}
      </Confirmacion>
    </div>
  );
}
