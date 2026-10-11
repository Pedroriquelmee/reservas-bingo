// Utilidades de fechas. Las fechas del bingo son días sin hora ('YYYY-MM-DD'),
// así que se manejan como texto y se interpretan siempre en hora local
// para evitar desfases por zona horaria.

const ZONA = 'Europe/Madrid';

export function parseFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function aIso(fecha: Date): string {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

/** Hoy en Madrid como 'YYYY-MM-DD' (la misma referencia que usa la base de datos). */
export function hoyMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

export function sumarDias(iso: string, dias: number): string {
  const f = parseFecha(iso);
  f.setDate(f.getDate() + dias);
  return aIso(f);
}

export function diasEntre(desde: string, hasta: string): number {
  const ms = parseFecha(hasta).getTime() - parseFecha(desde).getTime();
  return Math.round(ms / 86_400_000);
}

export function esDomingo(iso: string): boolean {
  return parseFecha(iso).getDay() === 0;
}

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "Domingo, 25 de octubre de 2026" */
export function formatoLargo(iso: string): string {
  const texto = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseFecha(iso));
  return capitalizar(texto);
}

/** "domingo 25 de octubre" */
export function formatoMedio(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseFecha(iso));
}

/** "25/10/2026" */
export function formatoCorto(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parseFecha(iso));
}

/** "11/10/2026, 23:45" a partir de un timestamp ISO */
export function formatoMomento(timestamp: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

/** "Hoy", "Mañana", "En 14 días", "Hace 3 días" */
export function relativo(iso: string, hoy: string = hoyMadrid()): string {
  const d = diasEntre(hoy, iso);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d > 1) return `En ${d} días`;
  return `Hace ${-d} días`;
}

/** Fechas de una serie periódica (para la vista previa del generador). */
export function serie(inicio: string, intervalo: number, cantidad: number): string[] {
  return Array.from({ length: cantidad }, (_, i) => sumarDias(inicio, i * intervalo));
}

/** Próximo domingo a partir de hoy (hoy incluido si es domingo). */
export function proximoDomingo(desde: string = hoyMadrid()): string {
  const dia = parseFecha(desde).getDay();
  return sumarDias(desde, (7 - dia) % 7);
}
