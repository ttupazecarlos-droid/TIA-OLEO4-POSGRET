import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import {
  adminActual,
  requerirCuenta,
  regenerarSesion,
  usuarioActual,
  verificarClave
} from '../auth.js';
import { SESSION_NAME } from '../env.js';
import { asyncHandler } from '../utils.js';

const router = Router();

router.get(
  '/sesion',
  asyncHandler(async (req, res) => {
    const admin = await adminActual(req);
    if (!admin) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, nombre: admin.nombre, email: admin.email });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    const clave = String(req.body?.password ?? '');

    try {
      const { rows } = await query(
        `SELECT u.id, u.nombre, u.password_hash, r.nombre AS rol
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE LOWER(u.email) = $1 AND u.activo = 1`,
        [email]
      );
      const usuario = rows[0];
      if (
        !usuario ||
        usuario.rol !== 'administrador' ||
        !(await verificarClave(clave, usuario.password_hash))
      ) {
        res.status(401).json({ ok: false, error: 'Correo o clave incorrectos.' });
        return;
      }

      await regenerarSesion(req);
      req.session.uid = Number(usuario.id);
      res.json({ ok: true, nombre: usuario.nombre });
    } catch {
      res.status(500).json({ ok: false, error: 'Error de BD.' });
    }
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await new Promise((resolve) => {
      req.session.destroy(() => resolve());
    });
    res.clearCookie(SESSION_NAME, { path: '/' });
    res.json({ ok: true });
  })
);

router.get(
  '/cuenta',
  asyncHandler(async (req, res) => {
    const usuario = await usuarioActual(req);
    if (!usuario) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({
      ok: true,
      id: Number(usuario.id),
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: usuario.telefono ?? '',
      direccion: usuario.direccion ?? '',
      rol: usuario.rol
    });
  })
);

router.post(
  '/registro-cliente',
  asyncHandler(async (req, res) => {
    const nombre = String(req.body?.nombre ?? '').trim();
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    const clave = String(req.body?.password ?? '');
    const telefono = String(req.body?.telefono ?? '').trim();

    if (nombre.length < 3 || nombre.length > 120) {
      res.status(400).json({ ok: false, error: 'Nombre inválido (3-120).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
      res.status(400).json({ ok: false, error: 'Correo inválido.' });
      return;
    }
    if (clave.length < 4) {
      res.status(400).json({
        ok: false,
        error: 'La clave debe tener al menos 4 caracteres.'
      });
      return;
    }
    if (telefono !== '' && !/^[0-9+\s-]{6,20}$/.test(telefono)) {
      res.status(400).json({ ok: false, error: 'Teléfono inválido.' });
      return;
    }

    try {
      const existe = await query(
        'SELECT id FROM usuarios WHERE LOWER(email) = $1',
        [email]
      );
      if (existe.rows.length) {
        res.status(409).json({
          ok: false,
          error: 'Ese correo ya tiene cuenta. Inicia sesión.'
        });
        return;
      }

      const rol = await query(
        "SELECT id FROM roles WHERE nombre = 'cliente'"
      );
      const rolId = Number(rol.rows[0]?.id ?? 2);

      const hash = await bcrypt.hash(clave, 10);

      const insert = await query(
        `INSERT INTO usuarios (rol_id, nombre, telefono, email, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [rolId, nombre, telefono, email, hash]
      );

      await regenerarSesion(req);
      req.session.uid = Number(insert.rows[0].id);
      res.json({ ok: true, nombre });
    } catch {
      res.status(500).json({ ok: false, error: 'No se pudo crear la cuenta.' });
    }
  })
);

router.post(
  '/login-cliente',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email ?? '').toLowerCase().trim();
    const clave = String(req.body?.password ?? '');

    try {
      const { rows } = await query(
        `SELECT u.id, u.nombre, u.password_hash, r.nombre AS rol
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
          WHERE LOWER(u.email) = $1 AND u.activo = 1`,
        [email]
      );
      const usuario = rows[0];
      if (!usuario || !(await verificarClave(clave, usuario.password_hash))) {
        res.status(401).json({ ok: false, error: 'Correo o clave incorrectos.' });
        return;
      }

      await regenerarSesion(req);
      req.session.uid = Number(usuario.id);
      res.json({ ok: true, nombre: usuario.nombre, rol: usuario.rol });
    } catch {
      res.status(500).json({ ok: false, error: 'Error de BD.' });
    }
  })
);

router.get(
  '/mis-pedidos',
  requerirCuenta,
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT p.id, p.cliente_nombre, p.total, p.estado,
                g.estado AS pago_estado, g.transaccion_id
           FROM pedidos p
           LEFT JOIN pagos g ON g.pedido_id = p.id
          WHERE p.usuario_id = $1
          ORDER BY p.id DESC
          LIMIT 50`,
        [Number(req.usuario.id)]
      );

      const pedidos = rows.map((p) => {
        const pagado = p.estado === 'pagado' || p.pago_estado === 'Pagado';
        return {
          id: Number(p.id),
          cliente_nombre: p.cliente_nombre,
          total: Number(p.total),
          estado: p.estado === 'pagado' ? 'Pagado' : p.estado,
          pago_estado: pagado ? 'Pagado' : p.pago_estado || 'Pendiente',
          transaccion_id: p.transaccion_id || '—'
        };
      });

      res.json({ ok: true, pedidos });
    } catch {
      res.status(500).json({ ok: false });
    }
  })
);

export default router;
