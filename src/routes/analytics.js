import { Router } from 'express';
import { query } from '../db.js';
import { requerirAdmin } from '../auth.js';
import { APP_DEBUG } from '../env.js';
import {
  asyncHandler,
  errorBd,
  jsonSeguro,
  limitarTexto
} from '../utils.js';

const router = Router();

// POST /api/eventos (publico: lo llama motor-analitica.js)
router.post(
  '/eventos',
  asyncHandler(async (req, res) => {
    try {
      const tipo = limitarTexto(req.body?.tipo_evento, 60);
      const pagina = limitarTexto(req.body?.pagina, 80);
      const datos = req.body?.datos ?? {};
      if (tipo === '') {
        res.status(400).json({ ok: false });
        return;
      }

      const datosJson = JSON.stringify(datos).slice(0, 1000);
      await query(
        'INSERT INTO eventos_analitica (tipo_evento, datos_json, pagina) VALUES ($1, $2, $3)',
        [tipo, datosJson, pagina]
      );
      res.json({ ok: true });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

// GET /api/analitica (solo admin)
router.get(
  '/analitica',
  requerirAdmin,
  asyncHandler(async (req, res) => {
    try {
      const { rows: eventos } = await query(
        `SELECT id, tipo_evento, datos_json, pagina,
                to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creado_en
           FROM eventos_analitica
          ORDER BY id ASC`
      );

      let visitas = 0;
      let wsp = 0;
      let precios = 0;
      let busquedas = 0;
      let preguntasChatbot = 0;
      let respuestasChatbot = 0;
      const top = {};

      for (const evento of eventos) {
        const detalle = jsonSeguro(evento.datos_json);
        switch (evento.tipo_evento) {
          case 'visita':
            visitas++;
            break;
          case 'clic_whatsapp': {
            wsp++;
            let nombre = String(detalle.producto ?? 'Consulta general').trim();
            if (nombre.startsWith('ADD:')) nombre = nombre.slice(4).trim();
            if (nombre === '') nombre = 'Consulta general';
            top[nombre] = (top[nombre] ?? 0) + 1;
            break;
          }
          case 'clic_precios_internacionales':
            precios++;
            break;
          case 'busqueda_catalogo':
            busquedas++;
            break;
          case 'chatbot_pregunta':
            preguntasChatbot++;
            if (detalle.tipoRespuesta !== 'sin_respuesta') respuestasChatbot++;
            break;
          default:
            break;
        }
      }

      // El chatbot real vive en chatbot_consultas.
      try {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN palabra_clave = 'sin-coincidencia' THEN 1 ELSE 0 END)::int AS sin
             FROM chatbot_consultas`
        );
        const total = Number(rows[0]?.total ?? 0);
        if (total > 0) {
          preguntasChatbot = total;
          respuestasChatbot = total - Number(rows[0]?.sin ?? 0);
        }
      } catch {
        // Si la tabla no existe se conservan los eventos.
      }

      let totalPedidos = 0;
      let valorTotalPedidos = 0;
      try {
        const { rows } = await query(
          'SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0) AS s FROM pedidos'
        );
        totalPedidos = Number(rows[0]?.n ?? 0);
        valorTotalPedidos = Number(rows[0]?.s ?? 0);
      } catch {
        // Sin tabla de pedidos: quedan en cero.
      }

      const interes = wsp + precios;
      const recientes = [...eventos]
        .reverse()
        .slice(0, 20)
        .map((evento) => ({
          id: Number(evento.id),
          tipo: evento.tipo_evento,
          detalle: jsonSeguro(evento.datos_json),
          pagina: evento.pagina,
          fecha: evento.creado_en
        }));

      res.json({
        ok: true,
        totalVisitas: visitas,
        totalClicsWhatsApp: wsp,
        clicsPrecios: precios,
        busquedas,
        totalPedidos,
        valorTotalPedidos: Math.round(valorTotalPedidos * 100) / 100,
        productosConMasInteres: top,
        tasaConversion:
          Math.round((interes > 0 ? (totalPedidos / interes) * 100 : 0) * 10) / 10,
        preguntasChatbot,
        tasaResolucionChatbot:
          Math.round(
            (preguntasChatbot > 0 ? (respuestasChatbot / preguntasChatbot) * 100 : 0) * 10
          ) / 10,
        eventosRecientes: recientes,
        totalEventos: eventos.length
      });
    } catch (error) {
      const salida = { ok: false, mensaje: 'Error de BD.' };
      if (APP_DEBUG) salida.detalle = error.message;
      res.status(500).json(salida);
    }
  })
);

// POST /api/analitica/reiniciar (solo admin)
router.post(
  '/analitica/reiniciar',
  requerirAdmin,
  asyncHandler(async (req, res) => {
    try {
      await query('DELETE FROM eventos_analitica');
      res.json({ ok: true });
    } catch (error) {
      errorBd(res, error);
    }
  })
);

// GET /api/pedidos (panel de control, solo admin)
router.get(
  '/pedidos',
  requerirAdmin,
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await query(
        `SELECT p.id, p.cliente_nombre, p.total, p.estado,
                g.estado AS pago_estado, g.transaccion_id
           FROM pedidos p
           LEFT JOIN pagos g ON g.pedido_id = p.id
          ORDER BY p.id DESC
          LIMIT 50`
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
    } catch (error) {
      const salida = { ok: false, mensaje: 'Error de BD.' };
      if (APP_DEBUG) salida.detalle = error.message;
      res.status(500).json(salida);
    }
  })
);

export default router;
