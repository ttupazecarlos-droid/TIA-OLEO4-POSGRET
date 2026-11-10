import bcrypt from 'bcryptjs';
import { query } from './db.js';

export function verificarClave(clave, hash) {
  if (typeof hash !== 'string' || hash === '') return Promise.resolve(false);
  // PHP password_hash() usa el prefijo $2y$; bcryptjs entiende $2b$.
  const normalizado = hash.startsWith('$2y$') ? '$2b$' + hash.slice(4) : hash;
  return bcrypt.compare(String(clave), normalizado);
}

export async function usuarioActual(req) {
  const uid = req.session?.uid;
  if (!uid) return null;

  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.telefono, u.direccion, r.nombre AS rol
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
        WHERE u.id = $1 AND u.activo = 1`,
      [Number(uid)]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function adminActual(req) {
  const usuario = await usuarioActual(req);
  return usuario && usuario.rol === 'administrador' ? usuario : null;
}

export async function requerirAdmin(req, res, next) {
  const admin = await adminActual(req);
  if (!admin) {
    res.status(401).json({
      ok: false,
      error: 'Acceso solo para el administrador. Inicia sesión.'
    });
    return;
  }
  req.admin = admin;
  next();
}

export async function requerirCuenta(req, res, next) {
  const usuario = await usuarioActual(req);
  if (!usuario) {
    res.status(401).json({
      exito: false,
      ok: false,
      error: 'Debes crear una cuenta e iniciar sesión para pagar.'
    });
    return;
  }
  req.usuario = usuario;
  next();
}

export function regenerarSesion(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
