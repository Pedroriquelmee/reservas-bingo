import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Aviso, Boton, Campo, Cargando, Dialogo, InsigniaEstado, Plazas } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { esDomingo, formatoLargo, hoyMadrid, proximoDomingo, relativo, sumarDias } from '../lib/fechas';
import type { AdminFecha, ResultadoGeneracion } from '../lib/tipos';
import { validarNotas } from '../lib/validacion';
import { Casilla, Filtros, Selector, useAccion } from './comun';

type Filtro = 'proximas' | 'anteriores' | 'todas';
type ReservaFila = AdminFecha['reservas'][number];

type DialogoAbierto =
  | { tipo: 'nueva' }
  | { tipo: 'editar'; fecha: AdminFecha }
  | { tipo: 'generar' }
  | { tipo: 'cancelar'; fecha: AdminFecha }
  | { tipo: 'eliminar'; fecha: AdminFecha }
  | { tipo: 'apuntar'; fecha: AdminFecha }
  | { tipo: 'mover'; fecha: AdminFecha; reserva: ReservaFila }
  | { tipo: 'cancelarReserva'; fecha: AdminFecha; reserva: ReservaFila }
  | null;

export function AdminFechas() {
  const hoy = hoyMadrid();
  const [filtro, setFiltro] = useState<Filtro>('proximas');
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null);
  const accion = useAccion();

  const consulta = useQuery({
    queryKey: ['admin', 'calendario', filtro, hoy],
    queryFn: () =>
      filtro === 'proximas' ? admin.calendario(hoy, null) : filtro === 'anteriores' ? admin.calendario(null, sumarDias(hoy, -1)) : admin.calendario(null, null),
  });

  const fechas = useMemo(() => {
    const lista = consulta.data ?? [];
    return filtro === 'proximas' ? lista : [...lista].reverse();
  }, [consulta.data, filtro]);

  const cerrar = () => setDialogo(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Fechas de bingo</h1>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={() => setDialogo({ tipo: 'generar' })}>
            Generar fechas
          </Boton>
          <Boton onClick={() => setDialogo({ tipo: 'nueva' })}>Nueva fecha</Boton>
        </div>
      </div>

      <Filtros
        etiqueta="Qué fechas mostrar"
        valor={filtro}
        onCambio={setFiltro}
        opciones={[
          { valor: 'proximas', texto: 'Próximas' },
          { valor: 'anteriores', texto: 'Anteriores' },
          { valor: 'todas', texto: 'Todas' },
        ]}
      />

      {accion.error && <Aviso tipo="error">{accion.error.mensaje}</Aviso>}

      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
      ) : fechas.length === 0 ? (
        <Aviso tipo="info">{filtro === 'anteriores' ? 'Todavía no hay domingos anteriores.' : 'No hay fechas. Crea una o genera varias.'}</Aviso>
      ) : (
        <ul className="space-y-3">
          {fechas.map((f) => {
            const pasada = f.fecha < hoy;
            const cancelada = f.estado === 'cancelada';
            return (
              <li key={f.id} className={`rounded-xl bg-white p-4 ring-1 ring-marino-200 ${cancelada ? 'opacity-80' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-marino-500">
                      {relativo(f.fecha, hoy)}
                      {!esDomingo(f.fecha) && <span className="ml-2 text-amber-700">· no es domingo</span>}
                    </p>
                    <p className={`text-lg font-bold ${cancelada ? 'text-marino-500 line-through' : ''}`}>{formatoLargo(f.fecha)}</p>
                    {f.notas && <p className="text-sm text-marino-600">{f.notas}</p>}
                    {cancelada && f.motivo_cancelacion && <p className="text-sm text-marino-600">Motivo: {f.motivo_cancelacion}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {!cancelada && (
                      <span className="text-sm font-semibold tabular-nums text-marino-700">
                        {f.ocupadas}/{f.plazas_totales}
                      </span>
                    )}
                    <InsigniaEstado estado={f.estado} />
                  </div>
                </div>

                {!cancelada && (
                  <div className="mt-3">
                    <Plazas ocupadas={f.ocupadas} total={f.plazas_totales} />
                  </div>
                )}

                {f.reservas.length > 0 && (
                  <ol className="mt-3 divide-y divide-marino-100 rounded-lg bg-marino-50 ring-1 ring-marino-200">
                    {f.reservas.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0">
                          <span className="font-semibold">
                            {r.participante.nombre} {r.participante.apellidos}
                          </span>
                          <span className="block truncate text-sm text-marino-500">{r.participante.email ?? 'Sin cuenta (añadida por la organización)'}</span>
                        </span>
                        <span className="flex gap-1">
                          <Boton variante="fantasma" tamano="pequeno" onClick={() => setDialogo({ tipo: 'mover', fecha: f, reserva: r })}>
                            Mover
                          </Boton>
                          <Boton variante="fantasma" tamano="pequeno" className="text-red-700" onClick={() => setDialogo({ tipo: 'cancelarReserva', fecha: f, reserva: r })}>
                            Cancelar
                          </Boton>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {!cancelada && f.ocupadas < f.plazas_totales && (
                    <Boton variante="secundario" tamano="pequeno" onClick={() => setDialogo({ tipo: 'apuntar', fecha: f })}>
                      Apuntar a alguien
                    </Boton>
                  )}
                  <Boton variante="secundario" tamano="pequeno" onClick={() => setDialogo({ tipo: 'editar', fecha: f })}>
                    Editar
                  </Boton>
                  {cancelada ? (
                    <Boton variante="secundario" tamano="pequeno" cargando={accion.ocupado} onClick={() => accion.ejecutar(() => admin.reabrirFecha(f.id), 'Fecha reabierta.')}>
                      Reabrir
                    </Boton>
                  ) : (
                    !pasada && (
                      <Boton variante="secundario" tamano="pequeno" className="text-red-700" onClick={() => setDialogo({ tipo: 'cancelar', fecha: f })}>
                        Cancelar fecha
                      </Boton>
                    )
                  )}
                  {f.total_reservas_historicas === 0 && (
                    <Boton variante="fantasma" tamano="pequeno" onClick={() => setDialogo({ tipo: 'eliminar', fecha: f })}>
                      Eliminar
                    </Boton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(dialogo?.tipo === 'nueva' || dialogo?.tipo === 'editar') && (
        <DialogoFecha fecha={dialogo.tipo === 'editar' ? dialogo.fecha : null} onCerrar={cerrar} />
      )}
      {dialogo?.tipo === 'generar' && <DialogoGenerar onCerrar={cerrar} />}
      {dialogo?.tipo === 'cancelar' && <DialogoCancelarFecha fecha={dialogo.fecha} onCerrar={cerrar} />}
      {dialogo?.tipo === 'eliminar' && <DialogoEliminar fecha={dialogo.fecha} onCerrar={cerrar} />}
      {dialogo?.tipo === 'apuntar' && <DialogoApuntar fecha={dialogo.fecha} onCerrar={cerrar} />}
      {dialogo?.tipo === 'mover' && <DialogoMover fecha={dialogo.fecha} reserva={dialogo.reserva} onCerrar={cerrar} />}
      {dialogo?.tipo === 'cancelarReserva' && <DialogoCancelarReserva fecha={dialogo.fecha} reserva={dialogo.reserva} onCerrar={cerrar} />}
    </div>
  );
}

// ---------------------------------------------------------------------

function Acciones({ onCerrar, ocupado, texto, variante = 'primario', deshabilitado }: { onCerrar: () => void; ocupado: boolean; texto: string; variante?: 'primario' | 'peligro'; deshabilitado?: boolean }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
        Volver
      </Boton>
      <Boton type="submit" variante={variante} cargando={ocupado} disabled={deshabilitado}>
        {texto}
      </Boton>
    </div>
  );
}

function DialogoFecha({ fecha, onCerrar }: { fecha: AdminFecha | null; onCerrar: () => void }) {
  const hoy = hoyMadrid();
  const [dia, setDia] = useState(fecha?.fecha ?? proximoDomingo(hoy));
  const [notas, setNotas] = useState(fecha?.notas ?? '');
  const { ocupado, error, ejecutar } = useAccion();
  const errorNotas = validarNotas(notas);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!dia || errorNotas) return;
    const n = notas.trim() || null;
    const r = fecha
      ? await ejecutar(() => admin.editarFecha(fecha.id, dia, n), 'Fecha actualizada.')
      : await ejecutar(() => admin.crearFecha(dia, n), 'Fecha creada.');
    if (r) onCerrar();
  }

  const mueveConReservas = fecha && fecha.fecha !== dia && fecha.reservas.length > 0;

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={fecha ? 'Editar fecha' : 'Nueva fecha'} bloqueado={ocupado}>
      <form onSubmit={guardar} noValidate className="space-y-4">
        <Campo etiqueta="Día" type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />
        {dia && <p className="-mt-2 text-sm text-marino-600">{formatoLargo(dia)}</p>}
        {dia && !esDomingo(dia) && <Aviso tipo="atencion">Ese día no es domingo. Puedes guardarlo igualmente si es una excepción.</Aviso>}
        {dia && dia < hoy && <Aviso tipo="atencion">Esa fecha ya ha pasado.</Aviso>}
        {mueveConReservas && (
          <Aviso tipo="atencion">
            Las {fecha.reservas.length} personas apuntadas pasarán al nuevo día. Recuerda avisarles.
          </Aviso>
        )}
        <Campo
          etiqueta="Notas (opcional, visibles para todos)"
          placeholder="Por ejemplo: de 17:00 a 20:00"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          error={errorNotas}
          maxLength={200}
        />
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} texto={fecha ? 'Guardar cambios' : 'Crear fecha'} />
      </form>
    </Dialogo>
  );
}

function DialogoGenerar({ onCerrar }: { onCerrar: () => void }) {
  const hoy = hoyMadrid();
  const [inicio, setInicio] = useState(proximoDomingo(hoy));
  const [intervalo, setIntervalo] = useState(14);
  const [cantidad, setCantidad] = useState(6);
  const [vista, setVista] = useState<ResultadoGeneracion | null>(null);
  const previa = useAccion();
  const real = useAccion();

  const valido = !!inicio && intervalo >= 1 && intervalo <= 60 && cantidad >= 1 && cantidad <= 52;

  async function verVista() {
    if (!valido) return;
    const r = await previa.ejecutar(() => admin.generarFechas(inicio, intervalo, cantidad, true));
    if (r) setVista(r);
  }

  async function generar(e: FormEvent) {
    e.preventDefault();
    if (!vista) return verVista();
    const r = await real.ejecutar(
      () => admin.generarFechas(inicio, intervalo, cantidad, false),
      (x) => `Creadas ${x.creadas.length} fechas${x.omitidas.length ? ` (${x.omitidas.length} ya existían)` : ''}.`,
    );
    if (r) onCerrar();
  }

  const cambiar = (fn: () => void) => {
    fn();
    setVista(null);
  };

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Generar fechas" bloqueado={real.ocupado} ancho="ancho">
      <form onSubmit={generar} noValidate className="space-y-4">
        <p className="text-[15px] text-marino-700">
          Crea varias fechas de golpe con la frecuencia que elijas. Las que ya existan se omiten, así que no se duplicará nada.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Primera fecha" type="date" value={inicio} onChange={(e) => cambiar(() => setInicio(e.target.value))} />
          <Selector etiqueta="Cada" value={intervalo} onChange={(e) => cambiar(() => setIntervalo(Number(e.target.value)))}>
            <option value={7}>7 días (semanal)</option>
            <option value={14}>14 días (cada 2 semanas)</option>
            <option value={21}>21 días (cada 3 semanas)</option>
            <option value={28}>28 días (cada 4 semanas)</option>
            <option value={15}>15 días exactos</option>
          </Selector>
          <Campo
            etiqueta="Número de fechas"
            type="number"
            min={1}
            max={52}
            value={cantidad}
            onChange={(e) => cambiar(() => setCantidad(Math.max(1, Math.min(52, Number(e.target.value) || 1))))}
          />
        </div>
        {intervalo % 7 !== 0 && <Aviso tipo="atencion">Con {intervalo} días las fechas no caerán siempre en domingo.</Aviso>}

        {vista && (
          <div>
            <p className="mb-2 text-sm font-semibold text-marino-700">
              Vista previa: {vista.creadas.length} nuevas{vista.omitidas.length > 0 && `, ${vista.omitidas.length} ya existen`}
            </p>
            <ul className="max-h-64 divide-y divide-marino-100 overflow-auto rounded-lg ring-1 ring-marino-200">
              {[...vista.creadas.map((d) => ({ d, nueva: true })), ...vista.omitidas.map((d) => ({ d, nueva: false }))]
                .sort((a, b) => a.d.localeCompare(b.d))
                .map(({ d, nueva }) => (
                  <li key={d} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className={nueva ? '' : 'text-marino-400 line-through'}>{formatoLargo(d)}</span>
                    <span className={`text-xs font-semibold ${nueva ? 'text-emerald-700' : 'text-marino-500'}`}>{nueva ? 'Nueva' : 'Ya existe'}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        {(previa.error || real.error) && <Aviso tipo="error">{(previa.error ?? real.error)!.mensaje}</Aviso>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar} disabled={real.ocupado}>
            Volver
          </Boton>
          {vista ? (
            <Boton type="submit" cargando={real.ocupado} disabled={vista.creadas.length === 0}>
              {vista.creadas.length === 0 ? 'No hay fechas nuevas' : `Crear ${vista.creadas.length} fechas`}
            </Boton>
          ) : (
            <Boton type="submit" cargando={previa.ocupado} disabled={!valido}>
              Ver vista previa
            </Boton>
          )}
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoCancelarFecha({ fecha, onCerrar }: { fecha: AdminFecha; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [entendido, setEntendido] = useState(false);
  const [afectadasServidor, setAfectadasServidor] = useState<number | null>(null);
  const { ocupado, error, setError, ejecutar } = useAccion();
  const afectadas = afectadasServidor ?? fecha.reservas.length;
  const errorMotivo = validarNotas(motivo);

  async function cancelar(e: FormEvent) {
    e.preventDefault();
    if (errorMotivo || (afectadas > 0 && !entendido)) return;
    const r = await ejecutar(
      () => admin.cancelarFecha(fecha.id, motivo.trim() || null, afectadas > 0),
      (x) => (x.reservas_canceladas > 0 ? `Fecha cancelada. ${x.reservas_canceladas} reservas canceladas.` : 'Fecha cancelada.'),
    );
    if (r) onCerrar();
  }

  // Si alguien se apuntó mientras el diálogo estaba abierto, el servidor
  // rechaza la operación y pide confirmación explícita.
  useEffect(() => {
    if (error?.codigo === 'RESERVAS_AFECTADAS') {
      setAfectadasServidor(Number(error.detalle) || 1);
      setEntendido(false);
      setError(null);
    }
  }, [error, setError]);

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Cancelar fecha" bloqueado={ocupado}>
      <form onSubmit={cancelar} noValidate className="space-y-4">
        <p className="text-[15px]">
          Vas a cancelar el bingo del <strong>{formatoLargo(fecha.fecha)}</strong>. Seguirá apareciendo en la web como «Cancelado».
        </p>
        <Campo etiqueta="Motivo (opcional, visible para todos)" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errorMotivo} maxLength={200} />
        {afectadas > 0 && (
          <Aviso tipo="atencion" titulo={`Hay ${afectadas} ${afectadas === 1 ? 'reserva afectada' : 'reservas afectadas'}`}>
            {afectadasServidor === null ? (
              <ul className="mt-1 list-disc pl-5">
                {fecha.reservas.map((r) => (
                  <li key={r.id}>
                    {r.participante.nombre} {r.participante.apellidos}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Alguien se ha apuntado mientras tanto. Revisa la lista después.</p>
            )}
            <p className="mt-2">Sus reservas se cancelarán. Recuerda avisarles.</p>
          </Aviso>
        )}
        {afectadas > 0 && (
          <Casilla etiqueta={`Entiendo que se cancelarán ${afectadas} ${afectadas === 1 ? 'reserva' : 'reservas'}.`} checked={entendido} onChange={setEntendido} />
        )}
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} variante="peligro" texto="Cancelar fecha" deshabilitado={afectadas > 0 && !entendido} />
      </form>
    </Dialogo>
  );
}

function DialogoEliminar({ fecha, onCerrar }: { fecha: AdminFecha; onCerrar: () => void }) {
  const { ocupado, error, ejecutar } = useAccion();
  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Eliminar fecha" bloqueado={ocupado}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await ejecutar(() => admin.eliminarFecha(fecha.id), 'Fecha eliminada.')) onCerrar();
        }}
      >
        <p className="text-[15px]">
          Se eliminará el <strong>{formatoLargo(fecha.fecha)}</strong> por completo. Úsalo solo para fechas creadas por error; para avisar
          de que no hay bingo, mejor «Cancelar fecha».
        </p>
        {error && <Aviso tipo="error" className="mt-4">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} variante="peligro" texto="Eliminar" />
      </form>
    </Dialogo>
  );
}

function DialogoApuntar({ fecha, onCerrar }: { fecha: AdminFecha; onCerrar: () => void }) {
  const participantes = useQuery({ queryKey: ['admin', 'participantes'], queryFn: admin.listarParticipantes });
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState('');
  const { ocupado, error, ejecutar } = useAccion();

  const yaApuntados = new Set(fecha.reservas.map((r) => r.participante.id));
  const t = busqueda.trim().toLowerCase();
  const opciones = (participantes.data ?? []).filter(
    (p) => p.activo && !yaApuntados.has(p.id) && (!t || `${p.nombre} ${p.apellidos} ${p.email ?? ''}`.toLowerCase().includes(t)),
  );

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Apuntar a alguien" bloqueado={ocupado}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!elegido) return;
          if (await ejecutar(() => admin.reservarPara(elegido, fecha.id), 'Persona apuntada.')) onCerrar();
        }}
        className="space-y-4"
      >
        <p className="text-[15px]">
          {formatoLargo(fecha.fecha)} · {fecha.plazas_totales - fecha.ocupadas} plazas libres
        </p>
        {participantes.isPending ? (
          <Cargando />
        ) : (
          <>
            <Campo etiqueta="Buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o correo" />
            <Selector etiqueta="Persona" value={elegido} onChange={(e) => setElegido(e.target.value)} required size={Math.min(8, Math.max(3, opciones.length + 1))}>
              {opciones.length === 0 && <option disabled>Sin resultados</option>}
              {opciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellidos}
                  {p.email ? ` · ${p.email}` : ' · sin cuenta'}
                </option>
              ))}
            </Selector>
            <p className="text-sm text-marino-600">
              ¿No aparece? Añádela en{' '}
              <Link to="/admin/participantes" className="text-fucsia-700 underline">
                Participantes
              </Link>
              .
            </p>
          </>
        )}
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} texto="Apuntar" deshabilitado={!elegido} />
      </form>
    </Dialogo>
  );
}

function DialogoMover({ fecha, reserva, onCerrar }: { fecha: AdminFecha; reserva: ReservaFila; onCerrar: () => void }) {
  const hoy = hoyMadrid();
  const destinos = useQuery({ queryKey: ['admin', 'calendario', 'proximas', hoy], queryFn: () => admin.calendario(hoy, null) });
  const [destino, setDestino] = useState('');
  const { ocupado, error, ejecutar } = useAccion();

  const opciones = (destinos.data ?? []).filter(
    (f) => f.id !== fecha.id && f.estado !== 'cancelada' && f.ocupadas < f.plazas_totales && !f.reservas.some((r) => r.participante.id === reserva.participante.id),
  );

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Mover reserva" bloqueado={ocupado}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!destino) return;
          if (await ejecutar(() => admin.moverReserva(reserva.id, destino), 'Reserva movida.')) onCerrar();
        }}
        className="space-y-4"
      >
        <p className="text-[15px]">
          <strong>
            {reserva.participante.nombre} {reserva.participante.apellidos}
          </strong>{' '}
          tiene plaza el {formatoLargo(fecha.fecha)}.
        </p>
        {destinos.isPending ? (
          <Cargando />
        ) : opciones.length === 0 ? (
          <Aviso tipo="info">No hay otras fechas con plazas libres.</Aviso>
        ) : (
          <Selector etiqueta="Nueva fecha" value={destino} onChange={(e) => setDestino(e.target.value)} required>
            <option value="">Elige una fecha…</option>
            {opciones.map((f) => (
              <option key={f.id} value={f.id}>
                {formatoLargo(f.fecha)} · {f.plazas_totales - f.ocupadas} libres
              </option>
            ))}
          </Selector>
        )}
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} texto="Mover" deshabilitado={!destino} />
      </form>
    </Dialogo>
  );
}

function DialogoCancelarReserva({ fecha, reserva, onCerrar }: { fecha: AdminFecha; reserva: ReservaFila; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { ocupado, error, ejecutar } = useAccion();
  const errorMotivo = validarNotas(motivo);
  return (
    <Dialogo abierto onCerrar={onCerrar} titulo="Cancelar reserva" bloqueado={ocupado}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (errorMotivo) return;
          if (await ejecutar(() => admin.cancelarReserva(reserva.id, motivo.trim() || null), 'Reserva cancelada.')) onCerrar();
        }}
        className="space-y-4"
      >
        <p className="text-[15px]">
          Vas a cancelar la plaza de{' '}
          <strong>
            {reserva.participante.nombre} {reserva.participante.apellidos}
          </strong>{' '}
          del {formatoLargo(fecha.fecha)}. La plaza quedará libre.
        </p>
        <Campo etiqueta="Motivo (opcional, lo verá esa persona)" value={motivo} onChange={(e) => setMotivo(e.target.value)} error={errorMotivo} maxLength={200} />
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Acciones onCerrar={onCerrar} ocupado={ocupado} variante="peligro" texto="Cancelar reserva" />
      </form>
    </Dialogo>
  );
}
