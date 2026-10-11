import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSesion } from '../auth/Sesion';
import { DialogoReserva } from '../components/DialogoReserva';
import { Logotipo, NOMBRE_GRUPO } from '../components/Estructura';
import { useNotificar } from '../components/Notificaciones';
import { TarjetaFecha } from '../components/TarjetaFecha';
import { Aviso, Boton, Cargando, Confirmacion } from '../components/ui';
import { borrarReservaPendiente, leerReservaPendiente } from '../lib/almacen';
import { cancelarMiReserva, obtenerCalendario } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoLargo, hoyMadrid } from '../lib/fechas';
import { intervaloRefresco, useTiempoReal } from '../lib/tiempoReal';
import type { FechaPublica } from '../lib/tipos';

export function Inicio() {
  const { sesion } = useSesion();
  const tiempoReal = useTiempoReal();
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const uid = sesion?.user.id ?? null;

  const calendario = useQuery({
    queryKey: ['calendario', uid],
    queryFn: obtenerCalendario,
    refetchInterval: intervaloRefresco(tiempoReal),
  });

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [aCancelar, setACancelar] = useState<FechaPublica | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const fechas = calendario.data ?? [];
  // La fecha del diálogo se toma siempre de los datos más recientes
  const seleccionada = useMemo(() => fechas.find((f) => f.id === seleccionadaId) ?? null, [fechas, seleccionadaId]);
  const hoy = hoyMadrid();

  // Si la persona entró con el enlace del correo, retomamos su reserva
  useEffect(() => {
    if (!sesion || !calendario.data) return;
    const pendiente = leerReservaPendiente();
    if (pendiente && calendario.data.some((f) => f.id === pendiente)) {
      setSeleccionadaId(pendiente);
    } else if (pendiente) {
      borrarReservaPendiente();
    }
  }, [sesion, calendario.data]);

  async function confirmarCancelacion() {
    if (!aCancelar?.mi_reserva_id) return;
    setCancelando(true);
    try {
      await cancelarMiReserva(aCancelar.mi_reserva_id);
      notificar('Reserva cancelada. La plaza ya está libre para otra persona.');
      setACancelar(null);
    } catch (e) {
      notificar(mensajeDeError(e), 'error');
    } finally {
      setCancelando(false);
      queryClient.invalidateQueries({ queryKey: ['calendario'] });
      queryClient.invalidateQueries({ queryKey: ['mis-reservas'] });
    }
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-marino-900 px-5 py-7 text-white sm:px-8 sm:py-9">
        {/* Franja fucsia, como el amanecer sobre el mar del logo */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-fucsia-500" aria-hidden="true" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          <Logotipo grande className="h-24 w-24 ring-4 ring-white/10 sm:h-32 sm:w-32" />
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-fucsia-300">{NOMBRE_GRUPO}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Reservas de Bingo</h1>
            <p className="mt-3 text-[17px] leading-relaxed text-marino-100">
              Organizamos aquí quién ayuda en los bingos de los domingos del grupo. Cada domingo necesitamos{' '}
              <strong className="text-white">3 personas</strong>: puedes ver quién va y apuntarte en las fechas con plazas libres.
            </p>
          </div>
        </div>
      </section>

      <ol className="mt-5 grid gap-3 text-[15px] text-slate-700 sm:grid-cols-3" aria-label="Cómo funciona">
        {[
          ['Elige un domingo', 'con plazas disponibles.'],
          ['Identifícate', 'con tu correo; sin contraseñas.'],
          ['Confirma', 'y listo. Si no puedes ir, cancélala.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-marino-100">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fucsia-700 text-sm font-bold text-white">{i + 1}</span>
            <span>
              <strong className="text-marino-900">{t}</strong> {d}
            </span>
          </li>
        ))}
      </ol>

      <section className="mt-10" aria-labelledby="titulo-proximos">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="titulo-proximos" className="text-xl font-bold text-marino-900">
            Próximos domingos
          </h2>
          <EstadoActualizacion tiempoReal={tiempoReal} actualizado={calendario.dataUpdatedAt} />
        </div>

        {calendario.isPending ? (
          <Cargando texto="Cargando fechas…" />
        ) : calendario.isError && !calendario.data ? (
          <Aviso tipo="error" titulo="No se han podido cargar las fechas">
            <p>{mensajeDeError(calendario.error)}</p>
            <Boton variante="secundario" tamano="pequeno" className="mt-3" onClick={() => calendario.refetch()} cargando={calendario.isFetching}>
              Reintentar
            </Boton>
          </Aviso>
        ) : fechas.length === 0 ? (
          <Aviso tipo="info" titulo="Todavía no hay domingos programados">
            Vuelve a mirar más adelante.
          </Aviso>
        ) : (
          <>
            {calendario.isError && (
              <Aviso tipo="atencion" className="mb-4">
                Sin conexión con el servidor: puede que estos datos no estén actualizados.
              </Aviso>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fechas.map((f) => (
                <TarjetaFecha key={f.id} fecha={f} hoy={hoy} onReservar={(x) => setSeleccionadaId(x.id)} onCancelar={setACancelar} />
              ))}
            </div>
          </>
        )}
      </section>

      <DialogoReserva fecha={seleccionada} onCerrar={() => setSeleccionadaId(null)} />

      <Confirmacion
        abierto={!!aCancelar}
        titulo="¿Cancelar tu plaza?"
        textoConfirmar="Sí, cancelar mi plaza"
        variante="peligro"
        cargando={cancelando}
        onConfirmar={confirmarCancelacion}
        onCerrar={() => setACancelar(null)}
      >
        {aCancelar && (
          <p>
            Vas a cancelar tu plaza del <strong>{formatoLargo(aCancelar.fecha)}</strong>. Quedará libre para otra persona.
          </p>
        )}
      </Confirmacion>
    </>
  );
}

function EstadoActualizacion({ tiempoReal, actualizado }: { tiempoReal: boolean; actualizado: number }) {
  if (tiempoReal) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
        </span>
        Se actualiza en tiempo real
      </p>
    );
  }
  if (!actualizado) return null;
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(actualizado);
  return <p className="text-sm text-slate-600">Actualizado a las {hora}</p>;
}
