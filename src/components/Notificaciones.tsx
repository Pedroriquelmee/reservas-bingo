import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tipo = 'exito' | 'error' | 'info';
interface Notificacion {
  id: number;
  tipo: Tipo;
  texto: string;
}

const Contexto = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

let contador = 0;

export function ProveedorNotificaciones({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Notificacion[]>([]);

  const notificar = useCallback((texto: string, tipo: Tipo = 'exito') => {
    const id = ++contador;
    setLista((l) => [...l.slice(-2), { id, tipo, texto }]);
    setTimeout(() => setLista((l) => l.filter((n) => n.id !== id)), tipo === 'error' ? 8000 : 5000);
  }, []);

  const estilos: Record<Tipo, string> = {
    exito: 'bg-marino-900 text-white',
    error: 'bg-red-800 text-white',
    info: 'bg-slate-800 text-white',
  };

  return (
    <Contexto.Provider value={notificar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {lista.map((n) => (
          <div
            key={n.id}
            role={n.tipo === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-[15px] font-medium shadow-lg ${estilos[n.tipo]}`}
          >
            {n.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useNotificar() {
  return useContext(Contexto);
}
