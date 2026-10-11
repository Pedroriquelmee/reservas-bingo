import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSesion } from '../auth/Sesion';
import { reservar } from '../lib/api';
import { borrarReservaPendiente, guardarReservaPendiente } from '../lib/almacen';
import { traducirError } from '../lib/errores';
import { formatoLargo, formatoMedio } from '../lib/fechas';
import type { FechaPublica } from '../lib/tipos';
import { FormularioPerfil } from './FormularioPerfil';
import { useNotificar } from './Notificaciones';
import { PanelAcceso } from './PanelAcceso';
import { Aviso, Boton, Cargando, Dialogo, InsigniaEstado } from './ui';

/**
 * Flujo completo de reserva en un único diálogo:
 * identificarse → (nombre y apellidos la primera vez) → resumen → confirmación.
 */
export function DialogoReserva({ fecha, onCerrar }: { fecha: FechaPublica | null; onCerrar: () => void }) {
  const { sesion, perfil, cargandoPerfil, errorPerfil } = useSesion();
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<{ codigo: string; mensaje: string } | null>(null);
  const [confirmada, setConfirmada] = useState<{ fecha: string } | null>(null);

  const abierto = !!fecha;

  useEffect(() => {
    if (!fecha) {
      setError(null);
      setConfirmada(null);
      setOcupado(false);
    } else if (!sesion) {
      // Si entra con el enlace del correo, retomamos esta reserva al volver
      guardarReservaPendiente(fecha.id);
    }
  }, [fecha, sesion]);

  async function confirmar() {
    if (!fecha) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await reservar(fecha.id);
      borrarReservaPendiente();
      setConfirmada({ fecha: r.fecha });
      notificar('Reserva confirmada.');
    } catch (e) {
      const err = traducirError(e);
      setError({ codigo: err.codigo, mensaje: err.mensaje });
    } finally {
      setOcupado(false);
      // Pase lo que pase, mostramos el estado real guardado en la base de datos
      queryClient.invalidateQueries({ queryKey: ['calendario'] });
      queryClient.invalidateQueries({ queryKey: ['mis-reservas'] });
    }
  }

  function cerrar() {
    borrarReservaPendiente();
    onCerrar();
  }

  let titulo = 'Reservar plaza';
  let contenido: ReactNode = null;

  if (!fecha) {
    contenido = null;
  } else if (!sesion) {
    titulo = 'Identifícate para reservar';
    contenido = (
      <div className="space-y-4">
        <ResumenFecha fecha={fecha} />
        <PanelAcceso intro="Para reservar necesitamos saber quién eres. Escribe tu correo y te enviaremos un código; no necesitas contraseña." />
      </div>
    );
  } else if (cargandoPerfil) {
    contenido = <Cargando />;
  } else if (errorPerfil && !perfil) {
    contenido = <Aviso tipo="error">{traducirError(errorPerfil).mensaje}</Aviso>;
  } else if (!perfil) {
    titulo = '¿Cómo te llamas?';
    contenido = (
      <div className="space-y-4">
        <p className="text-[15px] text-slate-700">Es la primera vez que entras. Indica tu nombre y apellidos para que sepamos quién ayuda.</p>
        <FormularioPerfil textoBoton="Continuar" />
      </div>
    );
  } else if (confirmada) {
    titulo = '¡Reserva confirmada!';
    contenido = (
      <div className="space-y-4">
        <Aviso tipo="exito" titulo="Tu plaza está guardada">
          Te esperamos el {formatoMedio(confirmada.fecha)}. Si al final no puedes ir, cancela desde «Mis reservas» para que otra
          persona pueda ocupar tu plaza.
        </Aviso>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/mis-reservas" onClick={cerrar} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100">
            Ver mis reservas
          </Link>
          <Boton onClick={cerrar}>Cerrar</Boton>
        </div>
      </div>
    );
  } else {
    const yaMia = !!fecha.mi_reserva_id;
    const noDisponible = fecha.estado !== 'abierta' || fecha.ocupadas >= fecha.plazas_totales;
    titulo = 'Confirma tu reserva';
    contenido = (
      <div className="space-y-4">
        <ResumenFecha fecha={fecha} />
        <dl className="rounded-xl bg-slate-50 p-4 text-[15px] ring-1 ring-slate-200">
          <dt className="text-sm text-slate-500">A nombre de</dt>
          <dd className="font-semibold">
            {perfil.nombre} {perfil.apellidos}
          </dd>
        </dl>
        {error && (
          <Aviso tipo={error.codigo === 'YA_RESERVADO' ? 'info' : 'error'}>
            {error.mensaje}
          </Aviso>
        )}
        {!error && yaMia && <Aviso tipo="info">Ya tienes plaza en este domingo.</Aviso>}
        {!error && !yaMia && noDisponible && (
          <Aviso tipo="error">
            {fecha.estado === 'cancelada'
              ? 'Este domingo se ha cancelado.'
              : 'Este domingo ya tiene las tres plazas ocupadas. Puedes consultar otras fechas disponibles.'}
          </Aviso>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={cerrar} disabled={ocupado}>
            Volver
          </Boton>
          <Boton onClick={confirmar} cargando={ocupado} disabled={yaMia || noDisponible || error?.codigo === 'YA_RESERVADO'}>
            Confirmar reserva
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <Dialogo abierto={abierto} onCerrar={cerrar} titulo={titulo} bloqueado={ocupado}>
      {contenido}
    </Dialogo>
  );
}

function ResumenFecha({ fecha }: { fecha: FechaPublica }) {
  const libres = Math.max(fecha.plazas_totales - fecha.ocupadas, 0);
  const estado = fecha.estado === 'cancelada' ? 'cancelada' : libres === 0 ? 'completa' : 'abierta';
  return (
    <div className="rounded-xl bg-marino-50 p-4 ring-1 ring-marino-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-marino-700">Fecha seleccionada</p>
          <p className="text-lg font-bold text-slate-900">{formatoLargo(fecha.fecha)}</p>
        </div>
        <InsigniaEstado estado={estado} />
      </div>
      <p className="mt-2 text-sm text-slate-700">
        Plazas libres: <strong>{libres}</strong> de {fecha.plazas_totales}
        {fecha.participantes.length > 0 && <> · Apuntados: {fecha.participantes.map((p) => p.nombre).join(', ')}</>}
      </p>
    </div>
  );
}
