import { formatoCorto } from '../lib/fechas';
import type { EntradaHistorial } from '../lib/tipos';

/** Genera y descarga un CSV compatible con Excel en español (separador ; y BOM UTF-8). */
export function descargarCsv(nombreArchivo: string, cabecera: string[], filas: (string | number | null)[][]): void {
  const escapar = (v: string | number | null) => {
    const t = v === null || v === undefined ? '' : String(v);
    // Evita que Excel interprete el contenido como fórmula (inyección CSV)
    const seguro = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  const texto = [cabecera, ...filas].map((f) => f.map(escapar).join(';')).join('\r\n');
  const blob = new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const f = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatoCorto(v) : String(v ?? ''));

/** Texto legible para cada entrada del historial. */
export function describirEntrada(e: EntradaHistorial): string {
  const d = e.detalles as Record<string, any>;
  const quien = d.participante ? String(d.participante) : 'una persona';
  switch (e.accion) {
    case 'reserva_creada':
      return d.por_admin ? `Reserva para ${quien} el ${f(d.fecha)} (plaza ${d.plaza})` : `${quien} reservó el ${f(d.fecha)} (plaza ${d.plaza})`;
    case 'reserva_cancelada':
      return `Cancelada la reserva de ${quien} del ${f(d.fecha)}${d.motivo ? ` · ${d.motivo}` : ''}`;
    case 'reserva_movida':
      return `Reserva de ${quien} movida del ${f(d.desde)} al ${f(d.hasta)}`;
    case 'fecha_creada':
      return `Nueva fecha: ${f(d.fecha)}`;
    case 'fecha_editada':
      return d.fecha_anterior !== d.fecha ? `Fecha cambiada del ${f(d.fecha_anterior)} al ${f(d.fecha)}` : `Notas editadas del ${f(d.fecha)}`;
    case 'fecha_cancelada':
      return `Cancelado el ${f(d.fecha)}${d.motivo ? ` · ${d.motivo}` : ''}${d.reservas_afectadas ? ` (${d.reservas_afectadas} reservas afectadas)` : ''}`;
    case 'fecha_reabierta':
      return `Reabierto el ${f(d.fecha)}`;
    case 'fecha_eliminada':
      return `Eliminada la fecha ${f(d.fecha)}`;
    case 'fechas_generadas': {
      const n = Array.isArray(d.creadas) ? d.creadas.length : 0;
      return `${d.automatica ? 'Generación automática' : 'Generadas'}: ${n} fecha${n === 1 ? '' : 's'}${n ? ` (${(d.creadas as string[]).map(f).join(', ')})` : ''}`;
    }
    case 'perfil_creado':
      return `Nueva cuenta: ${quien}`;
    case 'perfil_actualizado':
      return d.antes ? `Cambio de nombre: ${d.antes} → ${d.despues}` : 'Datos de perfil actualizados';
    case 'participante_creado':
      return `Añadida persona sin cuenta: ${quien}`;
    case 'participante_editado':
      return d.activo_antes !== d.activo ? `${d.despues} ${d.activo ? 'reactivado/a' : 'desactivado/a'}` : `Editado: ${d.antes} → ${d.despues}`;
    case 'rol_cambiado':
      return `${quien}: ${d.despues === 'admin' ? 'ahora es administrador/a' : 'deja de ser administrador/a'}`;
    case 'cuenta_eliminada':
      return 'Una persona eliminó su cuenta';
    case 'configuracion_actualizada':
      return `Ajustes de generación: ${d.generacion_automatica ? 'automática activada' : 'automática desactivada'}, cada ${d.intervalo_dias} días`;
    default:
      return e.accion;
  }
}
