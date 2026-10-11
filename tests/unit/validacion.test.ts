import { describe, expect, it } from 'vitest';
import { destinoSeguro } from '../../src/paginas/Acceso';
import { traducirError, traducirErrorAuth } from '../../src/lib/errores';
import { limpiarCodigo, nombrePublico, normalizarNombre, validarCodigo, validarEmail, validarNombre } from '../../src/lib/validacion';

describe('validación de nombres (mismas reglas que la base de datos)', () => {
  it('acepta nombres españoles habituales', () => {
    for (const n of ['María José', 'Mª Ángeles', "D'Ors", 'Núñez-Peña', 'Lluís Puig·Pujol', 'Iñaki']) {
      expect(validarNombre(n, 'nombre')).toBeNull();
    }
  });

  it('rechaza vacíos, números y símbolos', () => {
    for (const n of ['', ' ', 'A', 'Pedro2', '<script>', 'Ana@', 'x'.repeat(51)]) {
      expect(validarNombre(n, 'nombre')).not.toBeNull();
    }
  });

  it('normaliza espacios y genera el nombre público', () => {
    expect(normalizarNombre('  María   José ')).toBe('María José');
    expect(nombrePublico('Pedro', 'riquelme López')).toBe('Pedro R.');
    expect(nombrePublico('Lucía', 'Ñúñez')).toBe('Lucía Ñ.');
  });
});

describe('correo y código', () => {
  it('valida correos', () => {
    expect(validarEmail('pedro@ejemplo.es')).toBeNull();
    expect(validarEmail('pedro@ejemplo')).not.toBeNull();
    expect(validarEmail('')).not.toBeNull();
  });

  it('limpia y valida el código', () => {
    expect(limpiarCodigo(' 12 34-56 ')).toBe('123456');
    expect(validarCodigo('12345')).not.toBeNull();
    expect(validarCodigo('123456')).toBeNull();
    expect(validarCodigo('12345678')).toBeNull();
  });
});

describe('errores', () => {
  it('traduce los códigos del servidor', () => {
    expect(traducirError({ message: 'FECHA_COMPLETA', code: 'P0001' }).mensaje).toBe(
      'Este domingo ya tiene las tres plazas ocupadas. Puedes consultar otras fechas disponibles.',
    );
    expect(traducirError({ message: 'permission denied for function admin_estadisticas', code: '42501' }).codigo).toBe('NO_AUTORIZADO');
  });

  it('reconoce los fallos de red sin mostrar detalles técnicos', () => {
    const e = traducirError({ name: 'TypeError', message: 'TypeError: Failed to fetch' });
    expect(e.codigo).toBe('SIN_CONEXION');
    expect(e.mensaje).not.toMatch(/fetch|TypeError/);
  });

  it('errores de acceso', () => {
    expect(traducirErrorAuth({ status: 429, code: 'over_email_send_rate_limit', message: 'x' })).toMatch(/Espera un minuto/);
    expect(traducirErrorAuth({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' })).toMatch(/caducado/);
    expect(traducirErrorAuth({ status: 400, code: 'validation_failed', message: 'Unable to validate email address: invalid format' })).toMatch(/correo/);
  });
});

describe('redirecciones', () => {
  it('solo permite destinos internos tras iniciar sesión', () => {
    expect(destinoSeguro('/mis-reservas')).toBe('/mis-reservas');
    expect(destinoSeguro('https://malo.example')).toBe('/');
    expect(destinoSeguro('//malo.example')).toBe('/');
    expect(destinoSeguro(null)).toBe('/');
  });
});
