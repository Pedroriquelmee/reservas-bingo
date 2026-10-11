import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { EstadoFecha } from '../lib/tipos';

// ---------- Botón ----------
type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const estilosBoton: Record<Variante, string> = {
  primario: 'bg-fucsia-700 text-white hover:bg-fucsia-800 disabled:bg-slate-300 disabled:text-slate-600',
  secundario: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-100 disabled:text-slate-400',
  peligro: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-300 disabled:text-slate-600',
  fantasma: 'text-slate-700 hover:bg-slate-200/70 disabled:text-slate-400',
};

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
  tamano?: 'normal' | 'pequeno';
}

export function Boton({ variante = 'primario', cargando = false, tamano = 'normal', className = '', children, disabled, ...resto }: PropsBoton) {
  const tam = tamano === 'pequeno' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-[15px]';
  return (
    <button
      type="button"
      {...resto}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${tam} ${estilosBoton[variante]} ${className}`}
    >
      {cargando && <Rueda />}
      {children}
    </button>
  );
}

export function Rueda({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Campo de formulario ----------
interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  error?: string | null;
  ayuda?: ReactNode;
}

export function Campo({ etiqueta, error, ayuda, id, className = '', ...resto }: PropsCampo) {
  const generado = useId();
  const idCampo = id ?? generado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  return (
    <div className={className}>
      <label htmlFor={idCampo} className="mb-1 block text-sm font-medium text-slate-800">
        {etiqueta}
      </label>
      <input
        id={idCampo}
        aria-invalid={!!error || undefined}
        aria-describedby={[ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined}
        className={`block min-h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-900 shadow-sm placeholder:text-slate-400 ${
          error ? 'border-red-500' : 'border-slate-300'
        }`}
        {...resto}
      />
      {ayuda && !error && (
        <p id={idAyuda} className="mt-1 text-sm text-slate-600">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- Insignia de estado ----------
export function InsigniaEstado({ estado }: { estado: EstadoFecha }) {
  const config = {
    abierta: { texto: 'Disponible', clase: 'bg-emerald-50 text-emerald-800 ring-emerald-600/30' },
    completa: { texto: 'COMPLETO', clase: 'bg-marino-900 text-white ring-marino-900' },
    cancelada: { texto: 'Cancelado', clase: 'bg-slate-200 text-slate-700 ring-slate-400/40' },
  }[estado];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ring-1 ring-inset ${config.clase}`}>
      {config.texto}
    </span>
  );
}

// ---------- Indicador visual de plazas ----------
export function Plazas({ ocupadas, total, cancelada = false }: { ocupadas: number; total: number; cancelada?: boolean }) {
  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 flex-1 rounded-full ${
            cancelada ? 'bg-slate-200' : i < ocupadas ? (ocupadas >= total ? 'bg-marino-800' : 'bg-fucsia-500') : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

// ---------- Mensajes ----------
type TipoAviso = 'info' | 'exito' | 'error' | 'atencion';

const estilosAviso: Record<TipoAviso, string> = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  exito: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  error: 'bg-red-50 text-red-900 ring-red-200',
  atencion: 'bg-amber-50 text-amber-900 ring-amber-200',
};

export function Aviso({ tipo = 'info', titulo, children, className = '' }: { tipo?: TipoAviso; titulo?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl p-4 text-sm ring-1 ring-inset ${estilosAviso[tipo]} ${className}`}>
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div className={titulo ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-slate-600" role="status">
      <Rueda className="h-5 w-5" />
      <span>{texto}</span>
    </div>
  );
}

// ---------- Diálogo modal accesible (elemento <dialog> nativo) ----------
interface PropsDialogo {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  /** Impide cerrar con Esc o clic fuera (p. ej. mientras se guarda) */
  bloqueado?: boolean;
  ancho?: 'normal' | 'ancho';
}

export function Dialogo({ abierto, onCerrar, titulo, children, bloqueado = false, ancho = 'normal' }: PropsDialogo) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        if (!bloqueado) onCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !bloqueado) onCerrar();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain ${ancho === 'ancho' ? 'max-w-2xl' : 'max-w-md'} rounded-2xl bg-white p-0 text-slate-900 shadow-2xl`}
    >
      {abierto && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={idTitulo} className="text-lg font-bold leading-snug">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={onCerrar}
              disabled={bloqueado}
              className="-m-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Diálogo de confirmación genérico */
export function Confirmacion({
  abierto,
  titulo,
  children,
  textoConfirmar,
  variante = 'primario',
  cargando,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  variante?: 'primario' | 'peligro';
  cargando?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={titulo} bloqueado={cargando}>
      <div className="space-y-4 text-[15px] text-slate-700">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Boton variante="secundario" onClick={onCerrar} disabled={cargando}>
          Volver
        </Boton>
        <Boton variante={variante} onClick={onConfirmar} cargando={cargando}>
          {textoConfirmar}
        </Boton>
      </div>
    </Dialogo>
  );
}
