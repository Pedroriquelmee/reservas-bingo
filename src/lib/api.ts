// Única puerta de entrada a los datos. Todas las operaciones son funciones
// de la base de datos (RPC) que validan permisos en el servidor.
import { supabase } from './supabase';
import { traducirError } from './errores';
import type {
  AdminFecha,
  AdminParticipante,
  AdminReserva,
  Configuracion,
  EntradaHistorial,
  Estadisticas,
  FechaPublica,
  MiReserva,
  Perfil,
  ResultadoGeneracion,
  Rol,
} from './tipos';

async function rpc<T>(funcion: string, args?: Record<string, unknown>): Promise<T> {
  let respuesta;
  try {
    respuesta = await supabase.rpc(funcion, args);
  } catch (e) {
    throw traducirError(e);
  }
  if (respuesta.error) throw traducirError(respuesta.error);
  return respuesta.data as T;
}

// ---------- Público ----------
export const obtenerCalendario = () => rpc<FechaPublica[]>('calendario_publico');

// ---------- Participante ----------
export const obtenerMiPerfil = () => rpc<Perfil | null>('mi_perfil');
export const guardarMiPerfil = (nombre: string, apellidos: string) =>
  rpc<Perfil>('guardar_mi_perfil', { p_nombre: nombre, p_apellidos: apellidos });
export const reservar = (fechaId: string) =>
  rpc<{ id: string; fecha: string; plaza: number }>('reservar', { p_fecha_id: fechaId });
export const cancelarMiReserva = (reservaId: string) =>
  rpc<{ id: string; fecha: string }>('cancelar_mi_reserva', { p_reserva_id: reservaId });
export const obtenerMisReservas = () => rpc<MiReserva[]>('mis_reservas');
export const eliminarMiCuenta = () =>
  rpc<{ reservas_canceladas: number; cuenta_borrada: boolean }>('eliminar_mi_cuenta');

// ---------- Administración ----------
export const admin = {
  calendario: (desde?: string | null, hasta?: string | null) =>
    rpc<AdminFecha[]>('admin_calendario', { p_desde: desde ?? null, p_hasta: hasta ?? null }),
  crearFecha: (fecha: string, notas: string | null) =>
    rpc<{ id: string }>('admin_crear_fecha', { p_fecha: fecha, p_notas: notas }),
  editarFecha: (id: string, fecha: string, notas: string | null) =>
    rpc<{ id: string }>('admin_editar_fecha', { p_id: id, p_fecha: fecha, p_notas: notas }),
  cancelarFecha: (id: string, motivo: string | null, confirmar: boolean) =>
    rpc<{ reservas_canceladas: number }>('admin_cancelar_fecha', { p_id: id, p_motivo: motivo, p_confirmar: confirmar }),
  reabrirFecha: (id: string) => rpc<{ id: string }>('admin_reabrir_fecha', { p_id: id }),
  eliminarFecha: (id: string) => rpc<{ id: string }>('admin_eliminar_fecha', { p_id: id }),
  generarFechas: (inicio: string, intervalo: number, cantidad: number, simular: boolean) =>
    rpc<ResultadoGeneracion>('admin_generar_fechas', {
      p_inicio: inicio,
      p_intervalo: intervalo,
      p_cantidad: cantidad,
      p_simular: simular,
    }),
  asegurarFechasFuturas: () => rpc<{ activa: boolean; creadas: string[] }>('admin_asegurar_fechas_futuras'),
  obtenerConfiguracion: () => rpc<Configuracion>('admin_obtener_configuracion'),
  guardarConfiguracion: (c: Pick<Configuracion, 'generacion_automatica' | 'intervalo_dias' | 'fecha_referencia' | 'fechas_futuras_minimas'>) =>
    rpc<Configuracion>('admin_guardar_configuracion', {
      p_generacion_automatica: c.generacion_automatica,
      p_intervalo_dias: c.intervalo_dias,
      p_fecha_referencia: c.fecha_referencia,
      p_fechas_futuras_minimas: c.fechas_futuras_minimas,
    }),
  reservarPara: (participanteId: string, fechaId: string) =>
    rpc<{ id: string }>('admin_reservar_para', { p_participante_id: participanteId, p_fecha_id: fechaId }),
  cancelarReserva: (reservaId: string, motivo: string | null) =>
    rpc<{ id: string }>('admin_cancelar_reserva', { p_reserva_id: reservaId, p_motivo: motivo }),
  moverReserva: (reservaId: string, nuevaFechaId: string) =>
    rpc<{ id: string }>('admin_mover_reserva', { p_reserva_id: reservaId, p_nueva_fecha_id: nuevaFechaId }),
  listarReservas: (estado: 'activa' | 'cancelada' | null) =>
    rpc<AdminReserva[]>('admin_listar_reservas', { p_estado: estado, p_desde: null, p_hasta: null }),
  listarParticipantes: () => rpc<AdminParticipante[]>('admin_listar_participantes'),
  crearParticipante: (nombre: string, apellidos: string) =>
    rpc<{ id: string }>('admin_crear_participante', { p_nombre: nombre, p_apellidos: apellidos }),
  editarParticipante: (id: string, nombre: string, apellidos: string, activo: boolean) =>
    rpc<{ id: string }>('admin_editar_participante', { p_id: id, p_nombre: nombre, p_apellidos: apellidos, p_activo: activo }),
  cambiarRol: (id: string, rol: Rol) => rpc<{ id: string }>('admin_cambiar_rol', { p_id: id, p_rol: rol }),
  historial: (antesDe: number | null, limite = 100) =>
    rpc<EntradaHistorial[]>('admin_historial', { p_limite: limite, p_antes_de: antesDe }),
  estadisticas: () => rpc<Estadisticas>('admin_estadisticas'),
};
