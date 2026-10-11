// Validación en el navegador. La base de datos aplica las mismas reglas:
// esto solo sirve para avisar antes y con mensajes claros.

const PATRON_NOMBRE = /^[A-Za-zÀ-ÖØ-öø-ÿªº' .·’-]+$/;

export function normalizarNombre(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ');
}

export function validarNombre(valor: string, campo: 'nombre' | 'apellidos'): string | null {
  const v = normalizarNombre(valor);
  const max = campo === 'nombre' ? 50 : 80;
  const etiqueta = campo === 'nombre' ? 'El nombre' : 'Los apellidos';
  if (v.length < 2) return `${etiqueta} debe${campo === 'nombre' ? '' : 'n'} tener al menos 2 letras.`;
  if (v.length > max) return `${etiqueta} no puede${campo === 'nombre' ? '' : 'n'} superar ${max} caracteres.`;
  if (!PATRON_NOMBRE.test(v)) return `${etiqueta} solo puede${campo === 'nombre' ? '' : 'n'} contener letras, espacios, guiones y apóstrofos.`;
  return null;
}

export function validarEmail(valor: string): string | null {
  const v = valor.trim();
  if (!v) return 'Escribe tu correo electrónico.';
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'El correo electrónico no parece válido.';
  return null;
}

export function limpiarCodigo(valor: string): string {
  return valor.replace(/\D/g, '').slice(0, 10);
}

export function validarCodigo(valor: string): string | null {
  const v = limpiarCodigo(valor);
  if (v.length < 6) return 'El código tiene al menos 6 cifras.';
  return null;
}

export function validarNotas(valor: string): string | null {
  return valor.trim().length > 200 ? 'Máximo 200 caracteres.' : null;
}

/** Cómo aparecerá públicamente un nombre (igual que _nombre_publico en SQL). */
export function nombrePublico(nombre: string, apellidos: string): string {
  const n = normalizarNombre(nombre);
  const inicial = normalizarNombre(apellidos).charAt(0).toUpperCase();
  return inicial ? `${n} ${inicial}.` : n;
}
