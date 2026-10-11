import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { guardarMiPerfil } from '../lib/api';
import { mensajeDeError } from '../lib/errores';
import type { Perfil } from '../lib/tipos';
import { nombrePublico, normalizarNombre, validarNombre } from '../lib/validacion';
import { Aviso, Boton, Campo } from './ui';

export function FormularioPerfil({
  inicial,
  textoBoton = 'Guardar',
  onGuardado,
}: {
  inicial?: Pick<Perfil, 'nombre' | 'apellidos'> | null;
  textoBoton?: string;
  onGuardado?: (p: Perfil) => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [apellidos, setApellidos] = useState(inicial?.apellidos ?? '');
  const [errores, setErrores] = useState<{ nombre?: string | null; apellidos?: string | null }>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const nuevos = { nombre: validarNombre(nombre, 'nombre'), apellidos: validarNombre(apellidos, 'apellidos') };
    setErrores(nuevos);
    setError(null);
    if (nuevos.nombre || nuevos.apellidos) return;
    setOcupado(true);
    try {
      const p = await guardarMiPerfil(normalizarNombre(nombre), normalizarNombre(apellidos));
      queryClient.setQueriesData({ queryKey: ['perfil'] }, p);
      await queryClient.invalidateQueries({ queryKey: ['perfil'] });
      queryClient.invalidateQueries({ queryKey: ['calendario'] });
      onGuardado?.(p);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  }

  const vista = normalizarNombre(nombre) && normalizarNombre(apellidos) ? nombrePublico(nombre, apellidos) : null;

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre"
          autoComplete="given-name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errores.nombre}
          maxLength={50}
          required
        />
        <Campo
          etiqueta="Apellidos"
          autoComplete="family-name"
          value={apellidos}
          onChange={(e) => setApellidos(e.target.value)}
          error={errores.apellidos}
          maxLength={80}
          required
        />
      </div>
      <p className="text-sm text-slate-600">
        En la lista pública aparecerás como{' '}
        <strong className="text-slate-900">{vista ?? 'tu nombre y la inicial de tu apellido'}</strong>. Tu nombre completo
        solo lo ve la organización.
      </p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton type="submit" cargando={ocupado} className="w-full sm:w-auto">
        {textoBoton}
      </Boton>
    </form>
  );
}
