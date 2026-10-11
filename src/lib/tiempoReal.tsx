import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Escucha los cambios de la tabla fechas_bingo (cada reserva o cancelación
 * actualiza su fecha) y refresca los datos al instante. Si el tiempo real
 * no está disponible, las consultas se refrescan periódicamente y al volver
 * a la pestaña (ver intervaloRefresco).
 */
const Contexto = createContext(false);

export function ProveedorTiempoReal({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel('cambios-fechas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechas_bingo' }, () => {
        // Agrupa ráfagas de eventos (p. ej. cancelar una fecha con 3 reservas)
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['calendario'] });
          queryClient.invalidateQueries({ queryKey: ['mis-reservas'] });
          queryClient.invalidateQueries({ queryKey: ['admin'] });
        }, 250);
      })
      .subscribe((estado) => {
        setConectado(estado === 'SUBSCRIBED');
      });

    return () => {
      clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
  }, [queryClient]);

  return <Contexto.Provider value={conectado}>{children}</Contexto.Provider>;
}

export function useTiempoReal(): boolean {
  return useContext(Contexto);
}

/** Con tiempo real basta un refresco de seguridad cada 2 min; sin él, cada 30 s. */
export function intervaloRefresco(tiempoReal: boolean): number {
  return tiempoReal ? 120_000 : 30_000;
}
