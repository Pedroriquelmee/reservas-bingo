// Traduce los errores de la API (códigos lanzados por la base de datos,
// fallos de red...) a mensajes comprensibles. Nunca muestra detalles
// técnicos al usuario.

const MENSAJES: Record<string, string> = {
  NO_AUTENTICADO: 'Tu sesión ha caducado. Vuelve a identificarte.',
  NO_AUTORIZADO: 'No tienes permisos para hacer esto.',
  PERFIL_INCOMPLETO: 'Antes de reservar, indica tu nombre y apellidos.',
  FECHA_NO_ENCONTRADA: 'Esa fecha ya no existe. Actualiza la página.',
  FECHA_CANCELADA: 'Este domingo se ha cancelado. Consulta otras fechas.',
  FECHA_PASADA: 'Esa fecha ya ha pasado.',
  FECHA_COMPLETA: 'Este domingo ya tiene las tres plazas ocupadas. Puedes consultar otras fechas disponibles.',
  YA_RESERVADO: 'Ya tienes plaza en este domingo.',
  PARTICIPANTE_BLOQUEADO: 'Tu cuenta está desactivada. Habla con la persona que organiza el bingo.',
  PARTICIPANTE_NO_ENCONTRADO: 'No se ha encontrado a esa persona.',
  RESERVA_NO_ENCONTRADA: 'No se ha encontrado esa reserva.',
  RESERVA_YA_CANCELADA: 'Esa reserva ya estaba cancelada.',
  FECHA_DUPLICADA: 'Ya existe un bingo en ese día.',
  FECHA_YA_CANCELADA: 'Esa fecha ya estaba cancelada.',
  FECHA_NO_CANCELADA: 'Esa fecha no está cancelada.',
  FECHA_CON_RESERVAS: 'No se puede eliminar una fecha que ha tenido reservas. Cancélala en su lugar.',
  RESERVAS_AFECTADAS: 'Esta fecha tiene reservas. Confirma la cancelación.',
  ULTIMO_ADMIN: 'Debe quedar al menos un administrador.',
  SIN_CUENTA: 'Solo puede ser administrador alguien con cuenta activa.',
  NO_PUEDES_BLOQUEARTE: 'No puedes desactivar tu propia cuenta de administración.',
  DATOS_INVALIDOS: 'Revisa los datos introducidos.',
  REINTENTAR: 'Los datos han cambiado mientras tanto. Inténtalo de nuevo.',
};

const MENSAJE_RED =
  'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo. ' +
  'Si estabas reservando, revisa la lista antes de repetir: la reserva solo cuenta si aparece en ella.';

export class ErrorApp extends Error {
  constructor(
    public codigo: string,
    public mensaje: string,
    public detalle?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
  }
}

interface ErrorCrudo {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
  name?: string;
}

export function traducirError(e: unknown): ErrorApp {
  if (e instanceof ErrorApp) return e;
  const err = (e ?? {}) as ErrorCrudo;
  const msg = err.message ?? '';

  if (/^[A-Z_]+$/.test(msg) && MENSAJES[msg]) {
    return new ErrorApp(msg, MENSAJES[msg], err.details ?? undefined);
  }
  if (err.code === '42501' || /permission denied/i.test(msg)) {
    return new ErrorApp('NO_AUTORIZADO', MENSAJES.NO_AUTORIZADO);
  }
  if (err.code === 'PGRST301' || /JWT/i.test(msg)) {
    return new ErrorApp('NO_AUTENTICADO', MENSAJES.NO_AUTENTICADO);
  }
  if (
    err.name === 'TypeError' ||
    err.name === 'AuthRetryableFetchError' ||
    /fetch|network|Load failed|NetworkError|timeout/i.test(msg) ||
    (typeof err.status === 'number' && err.status >= 500)
  ) {
    return new ErrorApp('SIN_CONEXION', MENSAJE_RED);
  }
  // Error inesperado: se registra en consola sin datos personales y se
  // muestra un mensaje genérico.
  console.error('[reservas] error inesperado', err.code ?? '', msg.slice(0, 120));
  return new ErrorApp('DESCONOCIDO', 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos minutos.');
}

export function mensajeDeError(e: unknown): string {
  return traducirError(e).mensaje;
}

/** Errores de inicio de sesión (Supabase Auth). */
export function traducirErrorAuth(e: unknown): string {
  const err = (e ?? {}) as ErrorCrudo & { code?: string };
  const msg = (err.message ?? '').toLowerCase();
  const code = err.code ?? '';
  if (code === 'over_email_send_rate_limit' || /rate limit|too many|seconds/.test(msg) || err.status === 429) {
    return 'Has pedido varios códigos seguidos. Espera un minuto antes de pedir otro.';
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || /email address|invalid format/.test(msg)) {
    return 'El correo electrónico no es válido.';
  }
  if (code === 'otp_expired' || /expired|invalid|not found/.test(msg)) {
    return 'El código o el enlace no es válido o ha caducado. Pide uno nuevo.';
  }
  if (code === 'signup_disabled' || /signups not allowed/.test(msg)) {
    return 'El registro de nuevas cuentas está desactivado.';
  }
  return traducirError(e).mensaje;
}
