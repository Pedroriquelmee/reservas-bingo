import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSesion } from '../auth/Sesion';
import { FormularioPerfil } from '../components/FormularioPerfil';
import { useNotificar } from '../components/Notificaciones';
import { PanelAcceso } from '../components/PanelAcceso';
import { Aviso, Boton, Cargando, Confirmacion, InsigniaEstado } from '../components/ui';
import { cancelarMiReserva, eliminarMiCuenta, obtenerMisReservas } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoLargo, formatoMomento, hoyMadrid, relativo } from '../lib/fechas';
import { intervaloRefresco, useTiempoReal } from '../lib/tiempoReal';
import type { MiReserva } from '../lib/tipos';

export function MisReservas() {
  const { sesion, iniciando, perfil, cargandoPerfil, email, cerrarSesion } = useSesion();
  const tiempoReal = useTiempoReal();
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const navigate = useNavigate();
  const uid = sesion?.user.id ?? null;

  const reservas = useQuery({
    queryKey: ['mis-reservas', uid],
    queryFn: obtenerMisReservas,
    enabled: !!uid && !!perfil,
    refetchInterval: intervaloRefresco(tiempoReal),
  });

  const [aCancelar, setACancelar] = useState<MiReserva | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);

  if (iniciando) return <Cargando />;

  if (!sesion) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-2xl font-extrabold">Mis reservas</h1>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <PanelAcceso intro="Identifícate con tu correo para ver y cancelar tus reservas." />
        </div>
      </div>
    );
  }

  if (cargandoPerfil) return <Cargando />;

  if (!perfil) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-2 text-2xl font-extrabold">Completa tus datos</h1>
        <p className="mb-4 text-slate-700">Antes de reservar, indica tu nombre y apellidos.</p>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <FormularioPerfil textoBoton="Guardar" onGuardado={() => notificar('Datos guardados.')} />
        </div>
      </div>
    );
  }

  const hoy = hoyMadrid();
  const todas = reservas.data ?? [];
  const proximas = todas
    .filter((r) => r.estado === 'activa' && r.fecha.fecha >= hoy && r.fecha.estado !== 'cancelada')
    .sort((a, b) => a.fecha.fecha.localeCompare(b.fecha.fecha));
  const historial = todas.filter((r) => !proximas.includes(r));

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    setCancelando(true);
    try {
      await cancelarMiReserva(aCancelar.id);
      notificar('Reserva cancelada. La plaza ya está libre para otra persona.');
      setACancelar(null);
    } catch (e) {
      notificar(mensajeDeError(e), 'error');
    } finally {
      setCancelando(false);
      queryClient.invalidateQueries({ queryKey: ['mis-reservas'] });
      queryClient.invalidateQueries({ queryKey: ['calendario'] });
    }
  }

  async function borrarCuenta() {
    setBorrando(true);
    try {
      await eliminarMiCuenta();
      await cerrarSesion();
      notificar('Tus datos se han eliminado.', 'info');
      navigate('/');
    } catch (e) {
      notificar(mensajeDeError(e), 'error');
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Mis reservas</h1>
        <p className="mt-1 text-slate-600">
          {perfil.nombre} {perfil.apellidos} · <span className="break-all">{email}</span>
        </p>
        {!perfil.activo && (
          <Aviso tipo="atencion" className="mt-4">
            Tu cuenta está desactivada y no puedes hacer reservas nuevas. Habla con la organización si crees que es un error.
          </Aviso>
        )}
      </div>

      <section aria-labelledby="t-proximas">
        <h2 id="t-proximas" className="mb-3 text-lg font-bold">
          Próximas
        </h2>
        {reservas.isPending ? (
          <Cargando />
        ) : reservas.isError ? (
          <Aviso tipo="error">{mensajeDeError(reservas.error)}</Aviso>
        ) : proximas.length === 0 ? (
          <Aviso tipo="info">No tienes reservas activas. Elige un domingo en la página principal.</Aviso>
        ) : (
          <ul className="space-y-3">
            {proximas.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{relativo(r.fecha.fecha, hoy)}</p>
                  <p className="font-bold">{formatoLargo(r.fecha.fecha)}</p>
                  {r.fecha.notas && <p className="text-sm text-slate-600">{r.fecha.notas}</p>}
                </div>
                <Boton variante="secundario" tamano="pequeno" onClick={() => setACancelar(r)}>
                  Cancelar reserva
                </Boton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {historial.length > 0 && (
        <section aria-labelledby="t-historial">
          <h2 id="t-historial" className="mb-3 text-lg font-bold">
            Historial
          </h2>
          <ul className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200">
            {historial.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[15px]">
                <span className={r.estado === 'cancelada' ? 'text-slate-500 line-through' : ''}>{formatoLargo(r.fecha.fecha)}</span>
                <span className="text-sm text-slate-600">
                  {r.estado === 'cancelada' ? (
                    <>Cancelada {r.cancelada_en ? `el ${formatoMomento(r.cancelada_en)}` : ''}{r.motivo_cancelacion ? ` · ${r.motivo_cancelacion}` : ''}</>
                  ) : r.fecha.estado === 'cancelada' ? (
                    <InsigniaEstado estado="cancelada" />
                  ) : (
                    'Reservada'
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="t-datos" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <h2 id="t-datos" className="text-lg font-bold">
            Mis datos
          </h2>
          {!editando && (
            <Boton variante="fantasma" tamano="pequeno" onClick={() => setEditando(true)}>
              Editar
            </Boton>
          )}
        </div>
        {editando ? (
          <div className="mt-4">
            <FormularioPerfil
              inicial={perfil}
              onGuardado={() => {
                setEditando(false);
                notificar('Datos actualizados.');
              }}
            />
          </div>
        ) : (
          <p className="mt-2 text-slate-700">
            {perfil.nombre} {perfil.apellidos}
          </p>
        )}
        <details className="mt-6 border-t border-slate-200 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Eliminar mi cuenta y mis datos</summary>
          <p className="mt-2 text-sm text-slate-600">
            Se cancelarán tus reservas futuras, se borrará tu cuenta de acceso y tu nombre dejará de aparecer en los registros.
          </p>
          <Boton variante="peligro" tamano="pequeno" className="mt-3" onClick={() => setBorrarAbierto(true)}>
            Eliminar mi cuenta
          </Boton>
        </details>
      </section>

      <Confirmacion
        abierto={!!aCancelar}
        titulo="¿Cancelar esta reserva?"
        textoConfirmar="Sí, cancelar"
        variante="peligro"
        cargando={cancelando}
        onConfirmar={confirmarCancelacion}
        onCerrar={() => setACancelar(null)}
      >
        {aCancelar && (
          <p>
            Vas a cancelar tu plaza del <strong>{formatoLargo(aCancelar.fecha.fecha)}</strong>. Quedará libre para otra persona.
          </p>
        )}
      </Confirmacion>

      <Confirmacion
        abierto={borrarAbierto}
        titulo="¿Eliminar tu cuenta?"
        textoConfirmar="Eliminar definitivamente"
        variante="peligro"
        cargando={borrando}
        onConfirmar={borrarCuenta}
        onCerrar={() => setBorrarAbierto(false)}
      >
        <p>Esta acción no se puede deshacer. Se cancelarán {proximas.length > 0 ? `tus ${proximas.length} reservas futuras` : 'tus reservas futuras'} y se borrarán tus datos.</p>
      </Confirmacion>
    </div>
  );
}
