import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { requerirAdmin } from '../auth.js';
import { asyncHandler, errorBd, limitarTexto } from '../utils.js';

const router = Router();

// GET /api/productos
router.get(
  '/productos',
  asyncHandler(async (req, res) => {
    try {
      const where = ['p.activo = 1'];
      const params = [];

      if (req.query.categoria) {
        params.push(String(req.query.categoria).trim());
        where.push(`c.slug = LOWER($${params.length})`);
      }
      if (req.query.calidad) {
        const calidad = Number(req.query.calidad);
        if (Number.isInteger(calidad) && calidad > 0) {
          params.push(calidad);
          where.push(`p.calidad_id = $${params.length}`);
        }
      }
      if (req.query.marca) {
        const marca = Number(req.query.marca);
        if (Number.isInteger(marca) && marca > 0) {
          params.push(marca);
          where.push(`p.marca_id = $${params.length}`);
        }
      }
      if (req.query.buscar) {
        const patron = '%' + String(req.query.buscar).trim() + '%';
        params.push(patron, patron, patron);
        where.push(
          `(p.nombre ILIKE $${params.length - 2}
            OR p.descripcion ILIKE $${params.length - 1}
            OR p.detalle_venta ILIKE $${params.length})`
        );
      }

      const sql = `
        SELECT p.id, p.nombre, p.descripcion, p.detalle_venta, p.contenido,
               p.cantidad, p.unidad, p.precio, p.stock, p.imagen, p.destacado,
               c.slug AS categoria_slug, c.nombre AS categoria,
               k.id AS calidad_id, k.nombre AS calidad,
               k.descripcion AS calidad_desc, k.color AS calidad_color,
               m.nombre AS marca,
               g.valor AS gramaje, d.codigo AS dureza,
               tc.nombre AS cerda, tp.nombre AS tipo_pintura
          FROM productos p
          JOIN categorias c ON c.id = p.categoria_id
          JOIN calidades k ON k.id = p.calidad_id
          LEFT JOIN marcas m ON m.id = p.marca_id
          LEFT JOIN gramajes g ON g.id = p.gramaje_id
          LEFT JOIN durezas d ON d.id = p.dureza_id
          LEFT JOIN tipos_cerda tc ON tc.id = p.cerda_id
          LEFT JOIN tipos_pintura tp ON tp.id = p.tipo_pintura_id
         WHERE ${where.join(' AND ')}
         ORDER BY c.id, p.id`;

      const { rows } = await query(sql, params);

      const imagenes = await query(
        'SELECT producto_id, url FROM producto_imagenes ORDER BY producto_id, es_principal DESC, orden'
      );
      const imgMap = new Map();
      for (const fila of imagenes.rows) {
        const id = Number(fila.producto_id);
        if (!imgMap.has(id)) imgMap.set(id, []);
        imgMap.get(id).push(fila.url);
      }

      const promedios = await query(
        'SELECT producto_id, AVG(puntaje) AS prom, COUNT(*)::int AS n FROM resenas GROUP BY producto_id'
      );
      const promMap = new Map();
      for (const fila of promedios.rows) {
        promMap.set(Number(fila.producto_id), {
          promedio: Math.round(Number(fila.prom) * 10) / 10,
          n: Number(fila.n)
        });
      }

      const resenas = await query(
        'SELECT producto_id, cliente_nombre, puntaje, comentario FROM resenas ORDER BY creado_en DESC LIMIT 60'
      );
      const resMap = new Map();
      for (const fila of resenas.rows) {
        const id = Number(fila.producto_id);
        if (!resMap.has(id)) resMap.set(id, []);
        resMap.get(id).push({
          cliente_nombre: fila.cliente_nombre,
          puntaje: Number(fila.puntaje),
          comentario: fila.comentario
        });
      }

      const productos = rows.map((p) => {
        const id = Number(p.id);
        const meta = promMap.get(id);
        return {
          ...p,
          id,
          calidad_id: Number(p.calidad_id),
          destacado: Number(p.destacado),
          precio: Number(p.precio),
          stock: Number(p.stock),
          cantidad: Number(p.cantidad),
          gramaje: p.gramaje === null ? null : Number(p.gramaje),
          imagenes: imgMap.get(id) ?? [p.imagen],
          promedio: meta?.promedio ?? 0,
          nresenas: meta?.n ?? 0,
          resenas: resMap.get(id) ?? []
        };
      });

      const calidades = await query(
        'SELECT id, nombre, descripcion FROM calidades ORDER BY nivel'
      );
      const marcas = await query('SELECT id, nombre FROM marcas ORDER BY nombre');

      res.json({
        ok: true,
        total: productos.length,
        calidades: calidades.rows,
        marcas: marcas.rows,
        productos
      });
    } catch (error) {
      errorBd(
        res,
        error,
        'Sin conexion a la base de datos PostgreSQL. Revisa la configuracion e importa database.sql.'
      );
    }
  })
);

// POST /api/pedido
router.post(
  '/pedido',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const nombre = String(body.cliente_nombre ?? '').trim();
    const telefono = String(body.cliente_telefono ?? '').trim();
    const direccion = String(body.cliente_direccion ?? '').trim();
    const metodo = String(body.metodo_pago ?? '').trim() || 'whatsapp';
    const items = body.items;
    const uid = req.session?.uid ? Number(req.session.uid) : null;

    if (nombre.length < 3 || nombre.length > 120) {
      res.status(400).json({
        ok: false,
        error: 'Nombre del cliente invalido (3-120 caracteres).'
      });
      return;
    }
    if (!/^[0-9+\s-]{6,20}$/.test(telefono)) {
      res.status(400).json({ ok: false, error: 'Telefono invalido.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      res.status(400).json({
        ok: false,
        error: 'El carrito esta vacio o es muy grande.'
      });
      return;
    }

    const cantidades = new Map();
    for (const it of items) {
      const pid = Number(it?.id ?? 0);
      const cant = Number(it?.cantidad ?? 0);
      if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(cant) || cant <= 0 || cant > 99) {
        res.status(400).json({
          ok: false,
          error: 'Cantidad invalida en un producto.'
        });
        return;
      }
      cantidades.set(pid, cant);
    }

    try {
      const ids = [...cantidades.keys()];
      const productos = await query(
        `SELECT id, precio, stock, nombre
           FROM productos
          WHERE id = ANY($1::int[]) AND activo = 1`,
        [ids]
      );

      if (productos.rows.length !== ids.length) {
        res.status(400).json({ ok: false, error: 'Un producto ya no existe.' });
        return;
      }

      let subtotal = 0;
      const lineas = [];
      for (const prod of productos.rows) {
        const id = Number(prod.id);
        const cantidad = cantidades.get(id);
        if (cantidad > Number(prod.stock)) {
          res.status(400).json({
            ok: false,
            error: `Sin stock suficiente: ${prod.nombre} (stock: ${prod.stock})`
          });
          return;
        }
        const precio = Number(prod.precio);
        const sub = Math.round(precio * cantidad * 100) / 100;
        subtotal += sub;
        lineas.push({
          producto_id: id,
          cantidad,
          precio,
          subtotal: sub,
          stock_antes: Number(prod.stock)
        });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      const descuento = 0;
      const total = subtotal;

      const pedidoId = await withTransaction(async (client) => {
        const insert = await client.query(
          `INSERT INTO pedidos
             (usuario_id, cliente_nombre, cliente_telefono, cliente_direccion,
              subtotal, descuento, total, canal, metodo_pago)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'web', $8)
           RETURNING id`,
          [uid, nombre, telefono, direccion, subtotal, descuento, total, metodo]
        );
        const id = Number(insert.rows[0].id);

        for (const linea of lineas) {
          await client.query(
            `INSERT INTO pedido_items
               (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, linea.producto_id, linea.cantidad, linea.precio, linea.subtotal]
          );
          await client.query(
            'UPDATE productos SET stock = stock - $1 WHERE id = $2',
            [linea.cantidad, linea.producto_id]
          );
          await client.query(
            `INSERT INTO inventario_movimientos
               (producto_id, pedido_id, tipo, cantidad, stock_antes, stock_despues, motivo)
             VALUES ($1, $2, 'salida', $3, $4, $5, $6)`,
            [
              linea.producto_id,
              id,
              linea.cantidad,
              linea.stock_antes,
              linea.stock_antes - linea.cantidad,
              'Venta pedido #' + id
            ]
          );
        }

        await client.query(
          `INSERT INTO pedido_historial
             (pedido_id, estado_anterior, estado_nuevo, comentario)
           VALUES ($1, '', 'pendiente', 'Pedido creado desde la web')`,
          [id]
        );

        return id;
      });

      res.json({
        ok: true,
        pedido_id: pedidoId,
        subtotal,
        total,
        mensaje: `Pedido #${pedidoId} registrado. Te contactaremos por WhatsApp.`
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: 'No se pudo guardar el pedido.',
        detalle: error.message
      });
    }
  })
);

// POST /api/chatbot (publico) / GET (ranking solo admin)
router.post(
  '/chatbot',
  asyncHandler(async (req, res) => {
    try {
      const mensaje = limitarTexto(req.body?.mensaje, 200);
      const clave =
        limitarTexto(req.body?.palabra_clave, 60) || 'sin-coincidencia';
      if (mensaje === '') {
        res.status(400).json({ ok: false });
        return;
      }
      await query(
        'INSERT INTO chatbot_consultas (palabra_clave, mensaje) VALUES ($1, $2)',
        [clave, mensaje]
      );
      res.json({ ok: true });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

router.get(
  '/chatbot',
  requerirAdmin,
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT palabra_clave, COUNT(*)::int AS veces
           FROM chatbot_consultas
          GROUP BY palabra_clave
          ORDER BY veces DESC
          LIMIT 20`
      );
      res.json({ ok: true, ranking: rows });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

export default router;
