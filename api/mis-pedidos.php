<?php
// GET /api/mis-pedidos.php -> solo los pedidos de mi cuenta (para pagar lo mio, no lo ajeno)
require_once __DIR__ . '/cliente-auth.php';
header('Content-Type: application/json; charset=utf-8');
$yo = requerir_cuenta();
try {
  $stmt = db()->prepare('SELECT p.id, p.cliente_nombre, p.total, p.estado, g.estado AS pago_estado, g.transaccion_id FROM pedidos p LEFT JOIN pagos g ON g.pedido_id = p.id WHERE p.usuario_id = ? ORDER BY p.id DESC LIMIT 50');
  $stmt->execute([(int)$yo['id']]);
  $filas = $stmt->fetchAll();
  $out = array_map(function ($p) {
    $pagado = $p['estado'] === 'pagado' || $p['pago_estado'] === 'Pagado';
    return ['id' => (int)$p['id'], 'cliente_nombre' => $p['cliente_nombre'], 'total' => (float)$p['total'],
      'estado' => $p['estado'] === 'pagado' ? 'Pagado' : $p['estado'],
      'pago_estado' => $pagado ? 'Pagado' : ($p['pago_estado'] ?: 'Pendiente'),
      'transaccion_id' => $p['transaccion_id'] ?: '—'];
  }, $filas);
  json_out(['ok' => true, 'pedidos' => $out]);
} catch (Throwable $e) {
  json_out(['ok' => false], 500);
}
