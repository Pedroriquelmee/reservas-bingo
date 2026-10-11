export type EstadoFecha = 'abierta' | 'completa' | 'cancelada';
export type EstadoReserva = 'activa' | 'cancelada';
export type Rol = 'participante' | 'admin';

export interface FechaPublica {
  id: string;
  fecha: string;
  estado: EstadoFecha;
  notas: string | null;
  motivo_cancelacion: string | null;
  plazas_totales: number;
  ocupadas: number;
  participantes: { nombre: string; plaza: number }[];
  mi_reserva_id: string | null;
}

export interface Perfil {
  id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
}

export interface MiReserva {
  id: string;
  estado: EstadoReserva;
  plaza: number;
  creada_en: string;
  cancelada_en: string | null;
  motivo_cancelacion: string | null;
  fecha: {
    id: string;
    fecha: string;
    estado: EstadoFecha;
    notas: string | null;
    motivo_cancelacion: string | null;
  };
}

export interface ParticipanteResumen {
  id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
  tiene_cuenta?: boolean;
}

export interface AdminFecha {
  id: string;
  fecha: string;
  estado: EstadoFecha;
  notas: string | null;
  motivo_cancelacion: string | null;
  cancelada_en: string | null;
  actualizado_en: string;
  plazas_totales: number;
  ocupadas: number;
  total_reservas_historicas: number;
  reservas: { id: string; plaza: number; creada_en: string; participante: ParticipanteResumen }[];
}

export interface AdminReserva {
  id: string;
  estado: EstadoReserva;
  plaza: number;
  creada_en: string;
  cancelada_en: string | null;
  motivo_cancelacion: string | null;
  fecha: { id: string; fecha: string; estado: EstadoFecha };
  participante: ParticipanteResumen;
}

export interface AdminParticipante extends ParticipanteResumen {
  rol: Rol;
  activo: boolean;
  tiene_cuenta: boolean;
  creado_en: string;
  reservas_futuras: number;
  reservas_totales: number;
}

export interface EntradaHistorial {
  id: number;
  ocurrido_en: string;
  accion: string;
  actor: string | null;
  fecha: string | null;
  detalles: Record<string, unknown>;
}

export interface Estadisticas {
  fechas_programadas: number;
  fechas_completas: number;
  fechas_canceladas_futuras: number;
  fechas_pasadas: number;
  plazas_totales_futuras: number;
  plazas_ocupadas_futuras: number;
  reservas_realizadas: number;
  reservas_activas: number;
  cancelaciones: number;
  participantes_activos: number;
  administradores: number;
  proxima_fecha: { id: string; fecha: string; estado: EstadoFecha; ocupadas: number } | null;
}

export interface Configuracion {
  generacion_automatica: boolean;
  intervalo_dias: number;
  fecha_referencia: string | null;
  fechas_futuras_minimas: number;
  actualizado_en: string;
  generadas?: string[];
}

export interface ResultadoGeneracion {
  creadas: string[];
  omitidas: string[];
  simulacion: boolean;
}
