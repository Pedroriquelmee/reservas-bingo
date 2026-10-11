// Comodidades por navegador (nunca datos de reservas: esos viven en la base
// de datos). localStorage puede fallar en modo privado, así que todo va
// protegido.
const CLAVE_PENDIENTE = 'bingo:reserva-pendiente';

export function guardarReservaPendiente(fechaId: string): void {
  try {
    localStorage.setItem(CLAVE_PENDIENTE, JSON.stringify({ fechaId, hasta: Date.now() + 2 * 3600_000 }));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function leerReservaPendiente(): string | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PENDIENTE);
    if (!crudo) return null;
    const { fechaId, hasta } = JSON.parse(crudo) as { fechaId: string; hasta: number };
    if (Date.now() > hasta) {
      localStorage.removeItem(CLAVE_PENDIENTE);
      return null;
    }
    return fechaId;
  } catch {
    return null;
  }
}

export function borrarReservaPendiente(): void {
  try {
    localStorage.removeItem(CLAVE_PENDIENTE);
  } catch {
    /* nada */
  }
}
