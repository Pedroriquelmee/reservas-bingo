import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSesion } from '../auth/Sesion';
import { Aviso, Boton, Campo, Cargando, Dialogo } from '../components/ui';
import { admin } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import { formatoMomento } from '../lib/fechas';
import type { AdminParticipante } from '../lib/tipos';
import { normalizarNombre, validarNombre } from '../lib/validacion';
import { Casilla, useAccion } from './comun';

export function AdminParticipantes() {
  const { perfil } = useSesion();
  const consulta = useQuery({ queryKey: ['admin', 'participantes'], queryFn: admin.listarParticipantes });
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<AdminParticipante | null>(null);
  const [creando, setCreando] = useState(false);
  const [cambiandoRol, setCambiandoRol] = useState<string | null>(null);
  const rol = useAccion();

  const lista = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return (consulta.data ?? []).filter((p) => !t || `${p.nombre} ${p.apellidos} ${p.email ?? ''}`.toLowerCase().includes(t));
  }, [consulta.data, busqueda]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Participantes</h1>
        <Boton onClick={() => setCreando(true)}>Añadir persona sin cuenta</Boton>
      </div>
      <p className="max-w-3xl text-sm text-marino-600">
        Las personas se registran solas al reservar con su correo. Aquí puedes corregir nombres, desactivar cuentas (no podrán
        reservar), dar permisos de administración o añadir a alguien sin correo para apuntarle tú desde «Fechas».
      </p>

      <Campo etiqueta="Buscar" type="search" placeholder="Nombre o correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full sm:w-72" />

      {rol.error && <Aviso tipo="error">{rol.error.mensaje}</Aviso>}

      {consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        <Aviso tipo="error">{mensajeDeError(consulta.error)}</Aviso>
      ) : lista.length === 0 ? (
        <Aviso tipo="info">No hay participantes que coincidan.</Aviso>
      ) : (
        <ul className="divide-y divide-marino-100 rounded-xl bg-white ring-1 ring-marino-200">
          {lista.map((p) => {
            const soyYo = p.id === perfil?.id;
            return (
              <li key={p.id} className={`flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between ${p.activo ? '' : 'bg-marino-50'}`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {p.nombre} {p.apellidos}
                    {soyYo && <span className="ml-2 text-xs font-normal text-marino-500">(tú)</span>}
                  </p>
                  <p className="truncate text-sm text-marino-600">{p.email ?? (p.tiene_cuenta ? '—' : 'Sin cuenta')}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {p.rol === 'admin' && <span className="rounded-full bg-marino-900 px-2 py-0.5 font-semibold text-white">Administrador/a</span>}
                    {!p.activo && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">Desactivada</span>}
                    <span className="rounded-full bg-marino-100 px-2 py-0.5 text-marino-700">{p.reservas_futuras} reservas próximas</span>
                    <span className="rounded-full bg-marino-100 px-2 py-0.5 text-marino-700">desde {formatoMomento(p.creado_en).slice(0, 10)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Boton variante="secundario" tamano="pequeno" onClick={() => setEditando(p)}>
                    Editar
                  </Boton>
                  {p.tiene_cuenta && p.activo && (
                    <Boton
                      variante="fantasma"
                      tamano="pequeno"
                      cargando={rol.ocupado && cambiandoRol === p.id}
                      disabled={rol.ocupado}
                      onClick={async () => {
                        setCambiandoRol(p.id);
                        await rol.ejecutar(
                          () => admin.cambiarRol(p.id, p.rol === 'admin' ? 'participante' : 'admin'),
                          p.rol === 'admin' ? 'Permisos de administración retirados.' : 'Ahora es administrador/a.',
                        );
                        setCambiandoRol(null);
                      }}
                    >
                      {p.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </Boton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando && <DialogoParticipante participante={editando} esYo={editando.id === perfil?.id} onCerrar={() => setEditando(null)} />}
      {creando && <DialogoParticipante participante={null} esYo={false} onCerrar={() => setCreando(false)} />}
    </div>
  );
}

function DialogoParticipante({ participante, esYo, onCerrar }: { participante: AdminParticipante | null; esYo: boolean; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(participante?.nombre ?? '');
  const [apellidos, setApellidos] = useState(participante?.apellidos ?? '');
  const [activo, setActivo] = useState(participante?.activo ?? true);
  const [errores, setErrores] = useState<{ nombre?: string | null; apellidos?: string | null }>({});
  const { ocupado, error, ejecutar } = useAccion();

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const nuevos = { nombre: validarNombre(nombre, 'nombre'), apellidos: validarNombre(apellidos, 'apellidos') };
    setErrores(nuevos);
    if (nuevos.nombre || nuevos.apellidos) return;
    const n = normalizarNombre(nombre);
    const a = normalizarNombre(apellidos);
    const r = participante
      ? await ejecutar(() => admin.editarParticipante(participante.id, n, a, activo), 'Datos guardados.')
      : await ejecutar(() => admin.crearParticipante(n, a), 'Persona añadida.');
    if (r) onCerrar();
  }

  return (
    <Dialogo abierto onCerrar={onCerrar} titulo={participante ? 'Editar participante' : 'Añadir persona sin cuenta'} bloqueado={ocupado}>
      <form onSubmit={guardar} noValidate className="space-y-4">
        {!participante && (
          <p className="text-[15px] text-marino-700">Para personas que no usan el correo. Podrás apuntarlas tú desde «Fechas».</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} maxLength={50} />
          <Campo etiqueta="Apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} error={errores.apellidos} maxLength={80} />
        </div>
        {participante && !esYo && (
          <Casilla
            etiqueta={
              <>
                Cuenta activa <span className="block text-sm text-marino-500">Si la desactivas, no podrá hacer reservas nuevas.</span>
              </>
            }
            checked={activo}
            onChange={setActivo}
          />
        )}
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={onCerrar} disabled={ocupado}>
            Volver
          </Boton>
          <Boton type="submit" cargando={ocupado}>
            Guardar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
