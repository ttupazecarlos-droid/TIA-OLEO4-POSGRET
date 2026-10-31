<?php
// TIA OLEO 4 - Pedidos reales para panel-control.html (solo admin)
require_once __DIR__ . '/api/admin-auth.php';
requerir_admin();
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = db();
    $filas = $pdo->query(
        'SELECT p.id, p.cliente_nombre, p.total, p.estado, g.estado AS pago_estado, g.transaccion_id
           FROM pedidos p
           LEFT JOIN pagos g ON g.pedido_id = p.id
          ORDER BY p.id DESC
          LIMIT 50'
    )->fetchAll();

    $out = array_map(function ($p) {
        $pagado = $p['estado'] === 'pagado' || $p['pago_estado'] === 'Pagado';
        return [
            'id' => (int)$p['id'],
            'cliente_nombre' => $p['cliente_nombre'],
            'total' => (float)$p['total'],
            'estado' => $p['estado'] === 'pagado' ? 'Pagado' : $p['estado'],
            'pago_estado' => $pagado ? 'Pagado' : ($p['pago_estado'] ?: 'Pendiente'),
            'transaccion_id' => $p['transaccion_id'] ?: '—',
        ];
    }, $filas);

    json_out(['ok' => true, 'pedidos' => $out]);
} catch (Throwable $e) {
    $error = ['ok' => false, 'mensaje' => 'Error de BD.'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 500);
}
