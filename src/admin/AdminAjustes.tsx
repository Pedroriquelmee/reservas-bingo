import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Aviso, Boton, Campo, Cargando } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { esDomingo, formatoCorto, formatoLargo, proximoDomingo } from '../lib/fechas';
import type { Configuracion } from '../lib/tipos';
import { Casilla, Selector, useAccion } from './comun';

export function AdminAjustes() {
  const consulta = useQuery({ queryKey: ['admin', 'configuracion'], queryFn: admin.obtenerConfiguracion });
  const [activa, setActiva] = useState(false);
  const [intervalo, setIntervalo] = useState(14);
  const [referencia, setReferencia] = useState('');
  const [minimas, setMinimas] = useState(6);
  const guardar = useAccion();
  const ahora = useAccion();

  useEffect(() => {
    if (!consulta.data) return;
    setActiva(consulta.data.generacion_automatica);
    setIntervalo(consulta.data.intervalo_dias);
    setReferencia(consulta.data.fecha_referencia ?? '');
    setMinimas(consulta.data.fechas_futuras_minimas);
  }, [consulta.data]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await guardar.ejecutar(
      () =>
        admin.guardarConfiguracion({
          generacion_automatica: activa,
          intervalo_dias: intervalo,
          fecha_referencia: referencia || null,
          fechas_futuras_minimas: minimas,
        }),
      (r) => (r.generadas && r.generadas.length ? `Ajustes guardados. Se han creado ${r.generadas.length} fechas.` : 'Ajustes guardados.'),
    );
  }

  if (consulta.isPending) return <Cargando />;
  if (consulta.isError) return <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold">Ajustes</h1>

      <AjustePlazas configuracion={consulta.data} />

      <form onSubmit={enviar} className="space-y-5 rounded-xl bg-white p-5 ring-1 ring-marino-200">
        <div>
          <h2 className="text-lg font-bold">Generación automática de fechas</h2>
          <p className="mt-1 text-sm text-marino-600">
            Opcional. Si la activas, el sistema mantiene siempre un número mínimo de domingos programados añadiendo fechas
            <strong> después de la última existente</strong>. Nunca vuelve a crear una fecha que hayas movido o eliminado, así que
            puedes seguir corrigiendo el calendario a mano.
          </p>
        </div>

        <Casilla etiqueta="Activar la generación automática" checked={activa} onChange={setActiva} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Selector etiqueta="Frecuencia" value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))}>
            <option value={7}>Cada 7 días</option>
            <option value={14}>Cada 14 días</option>
            <option value={21}>Cada 21 días</option>
            <option value={28}>Cada 28 días</option>
            <option value={15}>Cada 15 días exactos</option>
          </Selector>
          <Campo
            etiqueta="Fechas futuras mínimas"
            type="number"
            min={1}
            max={26}
            value={minimas}
            onChange={(e) => setMinimas(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
          />
          <Campo
            etiqueta="Primera fecha de la serie"
            type="date"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            ayuda="Solo se usa si no hay ninguna fecha creada."
          />
        </div>
        {referencia && !esDomingo(referencia) && <Aviso tipo="atencion">{formatoLargo(referencia)} no es domingo.</Aviso>}
        {intervalo % 7 !== 0 && <Aviso tipo="atencion">Con {intervalo} días las fechas no caerán siempre en domingo.</Aviso>}
        {!referencia && <p className="text-sm text-marino-500">Si no hay fechas ni referencia, se empezará el {formatoCorto(proximoDomingo())}.</p>}

        {guardar.error && <Aviso tipo="error">{guardar.error.mensaje}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={guardar.ocupado}>
            Guardar ajustes
          </Boton>
          {consulta.data.generacion_automatica && (
            <Boton
              variante="secundario"
              cargando={ahora.ocupado}
              onClick={() =>
                ahora.ejecutar(admin.asegurarFechasFuturas, (r) => (r.creadas.length ? `Creadas ${r.creadas.length} fechas.` : 'El calendario ya estaba completo.'))
              }
            >
              Comprobar ahora
            </Boton>
          )}
        </div>
      </form>

      <section className="rounded-xl bg-white p-5 text-sm text-marino-700 ring-1 ring-marino-200">
        <h2 className="text-lg font-bold text-marino-900">Cuándo se ejecuta</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Al guardar estos ajustes.</li>
          <li>Cada vez que un administrador abre el panel.</li>
          <li>A diario, si se ha activado la tarea programada opcional (ver guía de mantenimiento).</li>
        </ul>
      </section>
    </div>
  );
}

/** Número de plazas por domingo. La base de datos garantiza que nunca se supera. */
function AjustePlazas({ configuracion }: { configuracion: Configuracion }) {
  const actual = configuracion.plazas_por_fecha;
  const [plazas, setPlazas] = useState(actual);
  const accion = useAccion();

  useEffect(() => setPlazas(actual), [actual]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await accion.ejecutar(() => admin.cambiarPlazas(plazas), `Ahora hay ${plazas} plazas por domingo.`);
  }

  let error = accion.error?.mensaje;
  if (accion.error?.codigo === 'PLAZAS_INSUFICIENTES' && accion.error.detalle) {
    const [fecha, apuntadas] = accion.error.detalle.split('|');
    error = `No se puede bajar a ${plazas}: el ${formatoLargo(fecha)} ya tiene ${apuntadas} personas apuntadas. Cancela o mueve alguna reserva en «Fechas» y vuelve a intentarlo.`;
  }

  const valido = Number.isInteger(plazas) && plazas >= 1 && plazas <= 20;

  return (
    <form onSubmit={guardar} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-marino-200">
      <div>
        <h2 className="text-lg font-bold">Plazas por domingo</h2>
        <p className="mt-1 text-sm text-marino-700">
          Cuántas personas pueden apuntarse cada domingo. Se aplica al momento a todas las fechas; la base de datos impide superar
          este número aunque varias personas reserven a la vez.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo
          etiqueta="Plazas"
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={Number.isNaN(plazas) ? '' : plazas}
          onChange={(e) => setPlazas(e.target.valueAsNumber)}
          className="w-32"
        />
        <Boton type="submit" cargando={accion.ocupado} disabled={!valido || plazas === actual}>
          Guardar plazas
        </Boton>
      </div>
      <p className="text-sm text-marino-600">
        Ahora: <strong>{actual}</strong> plazas. Al subir el número, los domingos completos vuelven a tener hueco. Para bajarlo, ningún
        domingo futuro puede tener más personas apuntadas que el nuevo número.
      </p>
      {!valido && <Aviso tipo="atencion">Escribe un número entre 1 y 20.</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </form>
  );
}
