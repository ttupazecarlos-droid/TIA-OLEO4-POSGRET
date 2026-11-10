import { APP_DEBUG } from './env.js';

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function responderError(res, status, mensaje, extra = {}) {
  res.status(status).json({ ok: false, error: mensaje, ...extra });
}

export function errorBd(res, error, mensaje = 'Error de BD.') {
  const salida = { ok: false, error: mensaje };
  if (APP_DEBUG) salida.detalle = error?.message || String(error);
  res.status(500).json(salida);
}

export function limpiarTarjeta(numero) {
  return String(numero || '').replace(/\s+/g, '');
}

export function validarLuhn(numero) {
  const n = limpiarTarjeta(numero);
  if (!/^\d{13,19}$/.test(n)) return false;

  let suma = 0;
  let alterno = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let digito = Number(n[i]);
    if (alterno) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
    alterno = !alterno;
  }
  return suma % 10 === 0;
}

/**
 * Detecta JPG, PNG y WebP por los bytes del archivo (no por el nombre).
 * Devuelve { mime, extension } o null.
 */
export function detectarImagen(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

export function jsonSeguro(texto, porDefecto = {}) {
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === 'object' ? valor : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function limitarTexto(valor, maximo) {
  return String(valor ?? '').trim().slice(0, maximo);
}
