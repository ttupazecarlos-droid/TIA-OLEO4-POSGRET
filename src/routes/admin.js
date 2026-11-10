import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { query, withTransaction } from '../db.js';
import { requerirAdmin } from '../auth.js';
import { IMG_DIR } from '../env.js';
import {
  supabaseConfigurado,
  supabaseEliminarUrl,
  supabaseSubir
} from '../supabase.js';
import {
  asyncHandler,
  detectarImagen,
  errorBd
} from '../utils.js';

const router = Router();
router.use(
  [
    '/admin-productos',
    '/admin-pedidos',
    '/admin-cotizaciones',
    '/admin-imagen'
  ],
  requerirAdmin
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const ESTADOS_PEDIDO = ['pendiente', 'pagado', 'confirmado', 'entregado', 'anulado'];
const ESTADOS_COTIZACION = ['pendiente', 'aprobada', 'rechazada'];

function fk(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function entero(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isInteger(n) ? n : porDefecto;
}

function mapaProducto(p) {
  return {
    ...p,
    id: Number(p.id),
    precio: Number(p.precio),
    stock: Number(p.stock),
    cantidad: Number(p.cantidad),
    destacado: Number(p.destacado),
    activo: Number(p.activo),
    categoria_id: p.categoria_id === null ? 0 : Number(p.categoria_id),
    calidad_id: p.calidad_id === null ? 0 : Number(p.calidad_id),
    marca_id: p.marca_id === null ? 0 : Number(p.marca_id),
    proveedor_id: p.proveedor_id === null ? 0 : Number(p.proveedor_id),
    gramaje_id: p.gramaje_id === null ? 0 : Number(p.gramaje_id),
    dureza_id: p.dureza_id === null ? 0 : Number(p.dureza_id),
    cerda_id: p.cerda_id === null ? 0 : Number(p.cerda_id),
    tipo_pintura_id: p.tipo_pintura_id === null ? 0 : Number(p.tipo_pintura_id)
  };
}

async function existe(cliente, tabla, id) {
  if (id === null) return true;
  const permitidas = [
    'categorias',
    'calidades',
    'marcas',
    'proveedores',
    'gramajes',
    'durezas',
    'tipos_cerda',
    'tipos_pintura'
  ];
  if (!permitidas.includes(tabla)) return false;
  const { rowCount } = await cliente.query(
    `SELECT 1 FROM ${tabla} WHERE id = $1`,
    [id]
  );
  return rowCount > 0;
}

async function sincronizarPrincipal(cliente, productoId) {
  const { rows } = await cliente.query(
    'SELECT url FROM producto_imagenes WHERE producto_id = $1 AND es_principal = 1 LIMIT 1',
    [productoId]
  );
  await cliente.query('UPDATE productos SET imagen = $1 WHERE id = $2', [
    rows[0]?.url ?? '',
    productoId
  ]);
}

function validarProducto(body) {
  const nombre = String(body.nombre ?? '').trim();
  const descripcion = String(body.descripcion ?? '').trim();
  const detalle = String(body.detalle_venta ?? '').trim();
  const contenido = String(body.contenido ?? '').trim();
  const unidad = String(body.unidad ?? 'unidad').trim();
  const categoriaId = Number(body.categoria_id ?? 0);
  const calidadId = Number(body.calidad_id ?? 0);
  const cantidad = Number(body.cantidad ?? 1);
  const precio = Number(body.precio);
  const stock = Number(body.stock);

  if (nombre.length < 3 || nombre.length > 150) {
    return { error: 'Nombre inválido (3-150).' };
  }
  if (!descripcion || !detalle || !contenido || !unidad) {
    return {
      error: 'Completa descripción, detalle de venta, contenido y unidad.'
    };
  }
  if (!Number.isInteger(categoriaId) || categoriaId <= 0 || !Number.isInteger(calidadId) || calidadId <= 0) {
    return { error: 'Elige categoría y calidad.' };
  }
  if (
    !Number.isInteger(cantidad) ||
    cantidad < 1 ||
    cantidad > 9999 ||
    !Number.isFinite(stock) ||
    stock < 0 ||
    stock > 9999
  ) {
    return { error: 'Cantidad/stock inválidos.' };
  }
  if (!Number.isFinite(precio) || precio <= 0 || precio > 99999) {
    return { error: 'Precio inválido.' };
  }

  return {
    datos: {
      nombre,
      descripcion,
      detalle,
      contenido,
      unidad,
      categoriaId,
      calidadId,
      marcaId: fk(body.marca_id),
      proveedorId: fk(body.proveedor_id),
      gramajeId: fk(body.gramaje_id),
      durezaId: fk(body.dureza_id),
      cerdaId: fk(body.cerda_id),
      tipoPinturaId: fk(body.tipo_pintura_id),
      cantidad,
      precio: Math.round(precio * 100) / 100,
      stock: Math.trunc(stock)
    }
  };
}

// ---------------- Productos ----------------
router.get(
  '/admin-productos',
  asyncHandler(async (req, res) => {
    if (req.query.id) {
      const id = Number(req.query.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'ID inválido.' });
        return;
      }
      try {
        const { rows } = await query('SELECT * FROM productos WHERE id = $1', [
          id
        ]);
        if (!rows.length) {
          res.status(404).json({ ok: false, error: 'Producto no existe.' });
          return;
        }
        res.json({ ok: true, producto: mapaProducto(rows[0]) });
      } catch (error) {
        errorBd(res, error);
      }
      return;
    }

    try {
      const where = ['p.activo IN (0,1)'];
      const params = [];

      if (req.query.buscar) {
        const patron = '%' + String(req.query.buscar).trim() + '%';
        params.push(patron, patron);
        where.push(
          `(p.nombre ILIKE $${params.length - 1} OR p.descripcion ILIKE $${params.length})`
        );
      }
      if (req.query.categoria) {
        params.push(String(req.query.categoria).trim());
        where.push(`c.slug = LOWER($${params.length})`);
      }

      const { rows } = await query(
        `SELECT p.id, p.nombre, p.precio, p.stock, p.activo, p.imagen, p.destacado,
                p.descripcion, p.detalle_venta, p.contenido, p.cantidad, p.unidad,
                p.categoria_id, p.calidad_id, p.marca_id, p.proveedor_id,
                p.gramaje_id, p.dureza_id, p.cerda_id, p.tipo_pintura_id,
                c.nombre AS categoria, m.nombre AS marca,
                g.valor AS gramaje, d.codigo AS dureza
           FROM productos p
           JOIN categorias c ON c.id = p.categoria_id
           LEFT JOIN marcas m ON m.id = p.marca_id
           LEFT JOIN gramajes g ON g.id = p.gramaje_id
           LEFT JOIN durezas d ON d.id = p.dureza_id
          WHERE ${where.join(' AND ')}
          ORDER BY c.id, p.id`,
        params
      );

      const productos = rows.map((r) => ({
        ...r,
        precio: Number(r.precio),
        stock: Number(r.stock)
      }));

      const [cats, categorias, calidades, marcas, proveedores, gramajes, durezas, cerdas, tipos] =
        await Promise.all([
          query('SELECT slug, nombre FROM categorias ORDER BY id'),
          query('SELECT id, nombre FROM categorias ORDER BY id'),
          query('SELECT id, nombre FROM calidades ORDER BY nivel'),
          query('SELECT id, nombre FROM marcas ORDER BY nombre'),
          query('SELECT id, nombre FROM proveedores ORDER BY nombre'),
          query('SELECT id, valor FROM gramajes ORDER BY valor'),
          query('SELECT id, codigo FROM durezas ORDER BY id'),
          query('SELECT id, nombre FROM tipos_cerda ORDER BY id'),
          query('SELECT id, nombre FROM tipos_pintura ORDER BY id')
        ]);

      res.json({
        ok: true,
        total: productos.length,
        categorias: cats.rows,
        productos,
        listas: {
          categorias: categorias.rows,
          calidades: calidades.rows,
          marcas: marcas.rows,
          proveedores: proveedores.rows,
          gramajes: gramajes.rows,
          durezas: durezas.rows,
          cerdas: cerdas.rows,
          tipos_pintura: tipos.rows
        }
      });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

router.post(
  '/admin-productos',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    if (body.accion === 'actualizar') {
      const id = Number(body.id ?? 0);
      const validacion = validarProducto(body);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ ok: false, error: 'ID inválido.' });
        return;
      }
      if (validacion.error) {
        res.status(400).json({ ok: false, error: validacion.error });
        return;
      }

      const d = validacion.datos;
      const destacado = body.destacado ? 1 : 0;
      const activo = body.activo === undefined ? 1 : body.activo ? 1 : 0;

      try {
        const antes = await query('SELECT stock FROM productos WHERE id = $1', [id]);
        if (!antes.rows.length) {
          res.status(404).json({ ok: false, error: 'Producto no existe.' });
          return;
        }
        const stockAntes = Number(antes.rows[0].stock);

        await withTransaction(async (cliente) => {
          for (const [tabla, valor] of Object.entries({
            categorias: d.categoriaId,
            calidades: d.calidadId,
            marcas: d.marcaId,
            proveedores: d.proveedorId,
            gramajes: d.gramajeId,
            durezas: d.durezaId,
            tipos_cerda: d.cerdaId,
            tipos_pintura: d.tipoPinturaId
          })) {
            if (!(await existe(cliente, tabla, valor))) {
              throw new Error(`Valor inválido en ${tabla}.`);
            }
          }

          await cliente.query(
            `UPDATE productos
                SET categoria_id = $1, calidad_id = $2, marca_id = $3,
                    proveedor_id = $4, gramaje_id = $5, dureza_id = $6,
                    cerda_id = $7, tipo_pintura_id = $8, nombre = $9,
                    descripcion = $10, detalle_venta = $11, contenido = $12,
                    cantidad = $13, unidad = $14, precio = $15, stock = $16,
                    destacado = $17, activo = $18
              WHERE id = $19`,
            [
              d.categoriaId,
              d.calidadId,
              d.marcaId,
              d.proveedorId,
              d.gramajeId,
              d.durezaId,
              d.cerdaId,
              d.tipoPinturaId,
              d.nombre,
              d.descripcion,
              d.detalle,
              d.contenido,
              d.cantidad,
              d.unidad,
              d.precio,
              d.stock,
              destacado,
              activo,
              id
            ]
          );

          if (d.stock !== stockAntes) {
            await cliente.query(
              `INSERT INTO inventario_movimientos
                 (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo)
               VALUES ($1, 'ajuste', $2, $3, $4, $5)`,
              [
                id,
                Math.abs(d.stock - stockAntes),
                stockAntes,
                d.stock,
                'Edición de producto (' + req.admin.nombre + ')'
              ]
            );
          }
        });

        res.json({ ok: true, mensaje: `Producto #${id} actualizado.` });
      } catch (error) {
        if (error.message?.startsWith('Valor inválido')) {
          res.status(400).json({ ok: false, error: error.message });
          return;
        }
        res.status(500).json({ ok: false, error: 'No se pudo actualizar.' });
      }
      return;
    }

    if (body.accion === 'crear') {
      const validacion = validarProducto(body);
      if (validacion.error) {
        res.status(400).json({ ok: false, error: validacion.error });
        return;
      }
      const d = validacion.datos;
      const imagen = String(body.imagen ?? '').trim();
      const destacado = body.destacado ? 1 : 0;

      try {
        const nuevoId = await withTransaction(async (cliente) => {
          for (const [tabla, valor] of Object.entries({
            categorias: d.categoriaId,
            calidades: d.calidadId,
            marcas: d.marcaId,
            proveedores: d.proveedorId,
            gramajes: d.gramajeId,
            durezas: d.durezaId,
            tipos_cerda: d.cerdaId,
            tipos_pintura: d.tipoPinturaId
          })) {
            if (!(await existe(cliente, tabla, valor))) {
              throw new Error(`Valor inválido en ${tabla}.`);
            }
          }

          const insert = await cliente.query(
            `INSERT INTO productos
               (categoria_id, calidad_id, marca_id, proveedor_id, gramaje_id,
                dureza_id, cerda_id, tipo_pintura_id, nombre, descripcion,
                detalle_venta, contenido, cantidad, unidad, precio, stock,
                imagen, destacado)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             RETURNING id`,
            [
              d.categoriaId,
              d.calidadId,
              d.marcaId,
              d.proveedorId,
              d.gramajeId,
              d.durezaId,
              d.cerdaId,
              d.tipoPinturaId,
              d.nombre,
              d.descripcion,
              d.detalle,
              d.contenido,
              d.cantidad,
              d.unidad,
              d.precio,
              d.stock,
              imagen,
              destacado
            ]
          );
          const id = Number(insert.rows[0].id);

          await cliente.query(
            `INSERT INTO inventario_movimientos
               (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo)
             VALUES ($1, 'entrada', $2, 0, $3, $4)`,
            [id, d.stock, d.stock, 'Carga inicial (admin ' + req.admin.nombre + ')']
          );

          if (imagen !== '') {
            await cliente.query(
              `INSERT INTO producto_imagenes (producto_id, url, es_principal, orden)
               VALUES ($1, $2, 1, 0)`,
              [id, imagen]
            );
          }
          return id;
        });

        res.json({
          ok: true,
          producto_id: nuevoId,
          mensaje: `Producto #${nuevoId} creado.`
        });
      } catch (error) {
        if (error.message?.startsWith('Valor inválido')) {
          res.status(400).json({ ok: false, error: error.message });
          return;
        }
        res.status(500).json({ ok: false, error: 'No se pudo crear.' });
      }
      return;
    }

    // Actualización rápida de stock/precio
    const id = Number(body.id ?? 0);
    const stock = Number(body.stock);
    const precio = Number(body.precio);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(stock) || stock < 0 || stock > 9999) {
      res.status(400).json({ ok: false, error: 'Stock inválido (0-9999).' });
      return;
    }
    if (!Number.isFinite(precio) || precio <= 0 || precio > 99999) {
      res.status(400).json({ ok: false, error: 'Precio inválido.' });
      return;
    }

    try {
      const antes = await query('SELECT stock FROM productos WHERE id = $1', [id]);
      if (!antes.rows.length) {
        res.status(404).json({ ok: false, error: 'Producto no existe.' });
        return;
      }
      const stockAntes = Number(antes.rows[0].stock);

      await withTransaction(async (cliente) => {
        await cliente.query('UPDATE productos SET stock = $1, precio = $2 WHERE id = $3', [
          Math.trunc(stock),
          Math.round(precio * 100) / 100,
          id
        ]);
        if (Math.trunc(stock) !== stockAntes) {
          await cliente.query(
            `INSERT INTO inventario_movimientos
               (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo)
             VALUES ($1, 'ajuste', $2, $3, $4, $5)`,
            [
              id,
              Math.abs(Math.trunc(stock) - stockAntes),
              stockAntes,
              Math.trunc(stock),
              'Ajuste manual (' + req.admin.nombre + ')'
            ]
          );
        }
      });

      res.json({ ok: true, mensaje: 'Inventario actualizado.' });
    } catch {
      res.status(500).json({ ok: false, error: 'No se pudo guardar.' });
    }
  })
);

// ---------------- Pedidos ----------------
router.get(
  '/admin-pedidos',
  asyncHandler(async (req, res) => {
    try {
      const pedidos = await query(
        `SELECT id, cliente_nombre, cliente_telefono, cliente_direccion,
                subtotal, total, estado,
                to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creado_en
           FROM pedidos
          ORDER BY id DESC
          LIMIT 50`
      );
      const items = await query(
        `SELECT i.pedido_id, i.cantidad, i.precio_unitario, p.nombre
           FROM pedido_items i
           JOIN productos p ON p.id = i.producto_id
          ORDER BY i.pedido_id DESC`
      );

      const mapa = new Map();
      for (const it of items.rows) {
        const id = Number(it.pedido_id);
        if (!mapa.has(id)) mapa.set(id, []);
        mapa.get(id).push(
          `${Number(it.cantidad)}x ${it.nombre} (S/ ${Number(it.precio_unitario).toFixed(2)})`
        );
      }

      const salida = pedidos.rows.map((p) => ({
        ...p,
        detalle: (mapa.get(Number(p.id)) ?? []).join(', '),
        subtotal: Number(p.subtotal),
        total: Number(p.total)
      }));

      res.json({
        ok: true,
        total: salida.length,
        estados: ESTADOS_PEDIDO,
        pedidos: salida
      });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

router.post(
  '/admin-pedidos',
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id ?? 0);
    const estado = String(req.body?.estado ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || !ESTADOS_PEDIDO.includes(estado)) {
      res.status(400).json({ ok: false, error: 'Estado inválido.' });
      return;
    }

    try {
      const anterior = await query('SELECT estado FROM pedidos WHERE id = $1', [id]);
      if (!anterior.rows.length) {
        res.status(404).json({ ok: false, error: 'Pedido no existe.' });
        return;
      }

      await withTransaction(async (cliente) => {
        await cliente.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [
          estado,
          id
        ]);
        await cliente.query(
          `INSERT INTO pedido_historial
             (pedido_id, estado_anterior, estado_nuevo, comentario)
           VALUES ($1, $2, $3, $4)`,
          [id, anterior.rows[0].estado, estado, 'Cambio por ' + req.admin.nombre]
        );
      });

      res.json({ ok: true, mensaje: `Pedido #${id} → ${estado}` });
    } catch {
      res.status(500).json({ ok: false, error: 'No se pudo guardar.' });
    }
  })
);

// ---------------- Cotizaciones ----------------
router.get(
  '/admin-cotizaciones',
  asyncHandler(async (req, res) => {
    try {
      const cotizaciones = await query(
        `SELECT id, cliente_nombre, cliente_telefono, total, estado,
                to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creado_en
           FROM cotizaciones
          ORDER BY id DESC
          LIMIT 50`
      );
      const items = await query(
        `SELECT i.cotizacion_id, i.cantidad, i.precio_unitario, i.subtotal, p.nombre
           FROM cotizacion_items i
           JOIN productos p ON p.id = i.producto_id
          ORDER BY i.cotizacion_id DESC`
      );

      const mapa = new Map();
      for (const it of items.rows) {
        const id = Number(it.cotizacion_id);
        if (!mapa.has(id)) mapa.set(id, []);
        mapa.get(id).push({
          texto: `${Number(it.cantidad)}x ${it.nombre}`,
          precio: Number(it.precio_unitario),
          subtotal: Number(it.subtotal)
        });
      }

      const salida = cotizaciones.rows.map((c) => ({
        ...c,
        items: mapa.get(Number(c.id)) ?? [],
        total: Number(c.total)
      }));

      res.json({
        ok: true,
        total: salida.length,
        estados: ESTADOS_COTIZACION,
        cotizaciones: salida
      });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

router.post(
  '/admin-cotizaciones',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    if (body.estado && !body.items) {
      const id = Number(body.id ?? 0);
      const estado = String(body.estado).trim();
      if (!Number.isInteger(id) || id <= 0 || !ESTADOS_COTIZACION.includes(estado)) {
        res.status(400).json({ ok: false, error: 'Estado inválido.' });
        return;
      }
      await query('UPDATE cotizaciones SET estado = $1 WHERE id = $2', [
        estado,
        id
      ]);
      res.json({ ok: true, mensaje: `Cotización #${id} → ${estado}` });
      return;
    }

    const nombre = String(body.cliente_nombre ?? '').trim();
    const telefono = String(body.cliente_telefono ?? '').trim();
    const items = body.items;

    if (nombre.length < 3 || nombre.length > 120) {
      res.status(400).json({ ok: false, error: 'Nombre del cliente inválido.' });
      return;
    }
    if (telefono !== '' && !/^[0-9+\s-]{6,20}$/.test(telefono)) {
      res.status(400).json({ ok: false, error: 'Teléfono inválido.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      res.status(400).json({ ok: false, error: 'Agrega al menos un producto.' });
      return;
    }

    try {
      const cantidades = new Map();
      for (const it of items) {
        const pid = Number(it?.id ?? 0);
        const cant = Number(it?.cantidad ?? 0);
        if (
          !Number.isInteger(pid) ||
          pid <= 0 ||
          !Number.isInteger(cant) ||
          cant <= 0 ||
          cant > 99
        ) {
          res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
          return;
        }
        cantidades.set(pid, cant);
      }

      const ids = [...cantidades.keys()];
      const productos = await query(
        `SELECT id, nombre, precio
           FROM productos
          WHERE id = ANY($1::int[]) AND activo = 1`,
        [ids]
      );
      if (productos.rows.length !== ids.length) {
        res.status(400).json({ ok: false, error: 'Un producto ya no existe.' });
        return;
      }

      let total = 0;
      const lineas = [];
      for (const prod of productos.rows) {
        const id = Number(prod.id);
        const cantidad = cantidades.get(id);
        const precio = Number(prod.precio);
        const subtotal = Math.round(precio * cantidad * 100) / 100;
        total += subtotal;
        lineas.push({
          producto_id: id,
          nombre: prod.nombre,
          cantidad,
          precio,
          subtotal
        });
      }
      total = Math.round(total * 100) / 100;

      const cotizacionId = await withTransaction(async (cliente) => {
        const insert = await cliente.query(
          `INSERT INTO cotizaciones
             (usuario_id, cliente_nombre, cliente_telefono, subtotal, total)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [Number(req.admin.id), nombre, telefono, total, total]
        );
        const id = Number(insert.rows[0].id);

        for (const linea of lineas) {
          await cliente.query(
            `INSERT INTO cotizacion_items
               (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, linea.producto_id, linea.cantidad, linea.precio, linea.subtotal]
          );
        }
        return id;
      });

      res.json({
        ok: true,
        cotizacion_id: cotizacionId,
        total,
        lineas,
        mensaje: `Cotización #${cotizacionId} guardada.`
      });
    } catch {
      res.status(500).json({ ok: false, error: 'No se pudo guardar.' });
    }
  })
);

// ---------------- Imágenes ----------------
router.get(
  '/admin-imagen',
  asyncHandler(async (req, res) => {
    const productoId = Number(req.query.producto_id ?? 0);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      res.status(400).json({ ok: false, error: 'Producto inválido.' });
      return;
    }
    const { rows } = await query(
      `SELECT id, url, es_principal
         FROM producto_imagenes
        WHERE producto_id = $1
        ORDER BY es_principal DESC, orden, id`,
      [productoId]
    );
    res.json({ ok: true, imagenes: rows });
  })
);

router.post(
  '/admin-imagen',
  upload.single('foto'),
  asyncHandler(async (req, res) => {
    if (req.file) {
      const productoId = Number(req.body?.producto_id ?? 0);
      if (!Number.isInteger(productoId) || productoId <= 0) {
        res.status(400).json({ ok: false, error: 'Producto inválido.' });
        return;
      }

      const producto = await query('SELECT 1 FROM productos WHERE id = $1', [
        productoId
      ]);
      if (!producto.rows.length) {
        res.status(404).json({ ok: false, error: 'Producto no existe.' });
        return;
      }

      const tipo = detectarImagen(req.file.buffer);
      if (!tipo) {
        res.status(400).json({ ok: false, error: 'Solo JPG, PNG o WebP.' });
        return;
      }

      const nombre = `p${productoId}_${randomBytes(4).toString('hex')}.${tipo.extension}`;
      let rutaLocal = '';
      let urlPublica = '';

      try {
        if (supabaseConfigurado()) {
          urlPublica = await supabaseSubir(req.file.buffer, nombre, tipo.mime);
        } else {
          await fs.mkdir(IMG_DIR, { recursive: true });
          rutaLocal = path.join(IMG_DIR, nombre);
          await fs.writeFile(rutaLocal, req.file.buffer);
          urlPublica = 'img/' + nombre;
        }

        const imagenId = await withTransaction(async (cliente) => {
          await cliente.query(
            'UPDATE producto_imagenes SET es_principal = 0 WHERE producto_id = $1',
            [productoId]
          );
          const insert = await cliente.query(
            `INSERT INTO producto_imagenes (producto_id, url, es_principal, orden)
             VALUES ($1, $2, 1, 0)
             RETURNING id`,
            [productoId, urlPublica]
          );
          await sincronizarPrincipal(cliente, productoId);
          return Number(insert.rows[0].id);
        });

        res.json({
          ok: true,
          imagen_id: imagenId,
          url: urlPublica,
          mensaje: 'Foto subida y marcada como principal.'
        });
      } catch (error) {
        if (rutaLocal) await fs.unlink(rutaLocal).catch(() => {});
        if (urlPublica && supabaseConfigurado()) {
          await supabaseEliminarUrl(urlPublica);
        }
        errorBd(res, error, 'No se pudo registrar.');
      }
      return;
    }

    const accion = String(req.body?.accion ?? '');
    const imagenId = Number(req.body?.imagen_id ?? 0);
    if (!Number.isInteger(imagenId) || imagenId <= 0) {
      res.status(404).json({ ok: false, error: 'Foto no existe.' });
      return;
    }

    const fila = await query(
      'SELECT id, producto_id, url, es_principal FROM producto_imagenes WHERE id = $1',
      [imagenId]
    );
    if (!fila.rows.length) {
      res.status(404).json({ ok: false, error: 'Foto no existe.' });
      return;
    }
    const imagen = fila.rows[0];
    const productoId = Number(imagen.producto_id);

    if (accion === 'principal') {
      await withTransaction(async (cliente) => {
        await cliente.query(
          'UPDATE producto_imagenes SET es_principal = 0 WHERE producto_id = $1',
          [productoId]
        );
        await cliente.query(
          'UPDATE producto_imagenes SET es_principal = 1 WHERE id = $1',
          [imagenId]
        );
        await sincronizarPrincipal(cliente, productoId);
      });
      res.json({ ok: true, mensaje: 'Foto principal actualizada.' });
      return;
    }

    if (accion === 'eliminar') {
      await withTransaction(async (cliente) => {
        await cliente.query('DELETE FROM producto_imagenes WHERE id = $1', [imagenId]);
        await sincronizarPrincipal(cliente, productoId);
      });

      const url = String(imagen.url);
      if (!(await supabaseEliminarUrl(url))) {
        const nombre = path.basename(url);
        const ruta = path.resolve(IMG_DIR, nombre);
        if (ruta.startsWith(path.resolve(IMG_DIR) + path.sep)) {
          await fs.unlink(ruta).catch(() => {});
        }
      }
      res.json({ ok: true, mensaje: 'Foto eliminada.' });
      return;
    }

    res.status(400).json({ ok: false, error: 'Acción inválida.' });
  })
);

export default router;
