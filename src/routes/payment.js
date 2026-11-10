import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { requerirCuenta } from '../auth.js';
import { asyncHandler, limpiarTarjeta, validarLuhn } from '../utils.js';

const router = Router();

const TARJETAS = {
  '4242424242424242': 'exito',
  '4000000000000002': 'rechazada',
  '4000000000009995': 'fondos_insuficientes'
};

const MENSAJES = {
  numero_invalido: 'El número de tarjeta no es válido (no pasa Luhn).',
  rechazada: 'Tu banco rechazó la operación (tarjeta de prueba).',
  fondos_insuficientes: 'Fondos insuficientes (tarjeta de prueba).'
};

// POST /api/pagar-pedido
router.post(
  '/pagar-pedido',
  requerirCuenta,
  asyncHandler(async (req, res) => {
    const pedidoId = Number(req.body?.pedido_id ?? 0);
    const tarjeta = limpiarTarjeta(req.body?.numero_tarjeta);
    const yo = req.usuario;

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      res.status(400).json({ exito: false, mensaje: 'Pedido inválido.' });
      return;
    }

    try {
      const { rows } = await query(
        'SELECT id, usuario_id, total, estado FROM pedidos WHERE id = $1',
        [pedidoId]
      );
      const pedido = rows[0];
      if (!pedido) {
        res.status(404).json({ exito: false, mensaje: 'Pedido no existe.' });
        return;
      }

      if (pedido.usuario_id === null || pedido.usuario_id === undefined) {
        await query('UPDATE pedidos SET usuario_id = $1 WHERE id = $2', [
          Number(yo.id),
          pedidoId
        ]);
        pedido.usuario_id = Number(yo.id);
      } else if (
        Number(pedido.usuario_id) !== Number(yo.id) &&
        yo.rol !== 'administrador'
      ) {
        res.status(403).json({
          exito: false,
          motivo: 'cuenta',
          mensaje:
            'Ese pedido es de otra cuenta. Inicia sesión con la cuenta que lo creó.'
        });
        return;
      }

      if (pedido.estado === 'pagado') {
        res.json({
          exito: true,
          transaccion_id: 'ya-pagado',
          pedido
        });
        return;
      }
      if (pedido.estado !== 'pendiente') {
        res.status(400).json({
          exito: false,
          motivo: 'estado',
          mensaje: `Solo se puede pagar un pedido pendiente (actual: ${pedido.estado}).`
        });
        return;
      }

      if (!validarLuhn(tarjeta)) {
        res.json({
          exito: false,
          motivo: 'numero_invalido',
          mensaje: MENSAJES.numero_invalido
        });
        return;
      }

      const escenario = TARJETAS[tarjeta] ?? 'exito';
      if (escenario !== 'exito') {
        await query(
          `INSERT INTO pagos (pedido_id, metodo, estado, total)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (pedido_id) DO UPDATE
           SET estado = EXCLUDED.estado, total = EXCLUDED.total`,
          [pedidoId, 'Tarjeta (sandbox)', 'Rechazado', Number(pedido.total)]
        );
        res.json({
          exito: false,
          motivo: escenario,
          mensaje: MENSAJES[escenario]
        });
        return;
      }

      const transaccion = 'sim_' + Date.now().toString(36) + randomBytes(3).toString('hex');

      await withTransaction(async (client) => {
        await client.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [
          'pagado',
          pedidoId
        ]);
        await client.query(
          `INSERT INTO pagos (pedido_id, metodo, estado, transaccion_id, total)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (pedido_id) DO UPDATE
           SET metodo = EXCLUDED.metodo,
               estado = EXCLUDED.estado,
               transaccion_id = EXCLUDED.transaccion_id,
               total = EXCLUDED.total`,
          [pedidoId, 'Tarjeta (sandbox)', 'Pagado', transaccion, Number(pedido.total)]
        );
        await client.query(
          `INSERT INTO pedido_historial
             (pedido_id, estado_anterior, estado_nuevo, comentario)
           VALUES ($1, 'pendiente', 'pagado', $2)`,
          [pedidoId, 'Pago sandbox ' + transaccion]
        );
        await client.query(
          `INSERT INTO eventos_analitica (tipo_evento, datos_json, pagina)
           VALUES ($1, $2, $3)`,
          [
            'pedido_generado',
            JSON.stringify({ total: Number(pedido.total) }),
            'demo-pasarela-pago.html'
          ]
        );
      });

      res.json({
        exito: true,
        transaccion_id: transaccion,
        pedido: {
          id: pedidoId,
          total: Number(pedido.total),
          estado: 'pagado'
        }
      });
    } catch (error) {
      res.status(500).json({ exito: false, mensaje: 'Error al procesar el pago.' });
    }
  })
);

export default router;
