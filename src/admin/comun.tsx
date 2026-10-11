import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificar } from '../components/Notificaciones';
import { traducirError, type ErrorApp } from '../lib/errores';

/** Ejecuta una acción de administración: estado de carga, error legible y refresco de datos. */
export function useAccion() {
  const queryClient = useQueryClient();
  const notificar = useNotificar();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorApp | null>(null);

  async function ejecutar<T>(fn: () => Promise<T>, mensajeExito?: string | ((r: T) => string)): Promise<T | null> {
    setOcupado(true);
    setError(null);
    try {
      const r = await fn();
      if (mensajeExito) notificar(typeof mensajeExito === 'function' ? mensajeExito(r) : mensajeExito);
      return r;
    } catch (e) {
      setError(traducirError(e));
      return null;
    } finally {
      setOcupado(false);
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['calendario'] });
      queryClient.invalidateQueries({ queryKey: ['mis-reservas'] });
    }
  }

  return { ocupado, error, setError, ejecutar };
}

export function Selector({
  etiqueta,
  children,
  className = '',
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {etiqueta}
      </label>
      <select id={id} className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base shadow-sm" {...resto}>
        {children}
      </select>
    </div>
  );
}

export function Filtros<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex rounded-lg bg-white p-1 ring-1 ring-marino-200">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onCambio(o.valor)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold ${valor === o.valor ? 'bg-marino-900 text-white' : 'text-marino-600 hover:bg-marino-100'}`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Casilla({ etiqueta, checked, onChange }: { etiqueta: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-fucsia-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{etiqueta}</span>
    </label>
  );
}
