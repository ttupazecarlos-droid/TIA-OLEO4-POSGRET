<?php
// ============================================================
// Admin: pedidos de clientes (requiere sesion admin)
// GET  -> ultimos 50 con su detalle
// POST {id, estado} -> cambia estado + lo anota en el historial
// ============================================================
require_once __DIR__ . '/admin-auth.php';
$admin = requerir_admin();
$pdo = db();
$ESTADOS = ['pendiente', 'pagado', 'confirmado', 'entregado', 'anulado'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  try {
    $peds = $pdo->query("SELECT id, cliente_nombre, cliente_telefono, cliente_direccion, subtotal, total, estado, to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS creado_en FROM pedidos ORDER BY id DESC LIMIT 50")->fetchAll();
    $items = $pdo->query('SELECT i.pedido_id, i.cantidad, i.precio_unitario, p.nombre FROM pedido_items i JOIN productos p ON p.id = i.producto_id ORDER BY i.pedido_id DESC')->fetchAll();
    $map = [];
    foreach ($items as $it) {
      $map[(int)$it['pedido_id']][] = (int)$it['cantidad'] . 'x ' . $it['nombre'] . ' (S/ ' . number_format((float)$it['precio_unitario'], 2) . ')';
    }
    foreach ($peds as &$p) {
      $p['detalle'] = implode(', ', $map[(int)$p['id']] ?? []);
      $p['subtotal'] = (float)$p['subtotal'];
      $p['total'] = (float)$p['total'];
    }
    unset($p);
    json_out(['ok' => true, 'total' => count($peds), 'estados' => $ESTADOS, 'pedidos' => $peds]);
  } catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Error de BD.'], 500);
  }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) json_out(['ok' => false, 'error' => 'JSON inválido.'], 400);
  $id = (int)($body['id'] ?? 0);
  $estado = trim($body['estado'] ?? '');
  if ($id <= 0 || !in_array($estado, $ESTADOS, true)) {
    json_out(['ok' => false, 'error' => 'Estado inválido.'], 400);
  }
  try {
    $stmt = $pdo->prepare('SELECT estado FROM pedidos WHERE id = ?');
    $stmt->execute([$id]);
    $anterior = $stmt->fetchColumn();
    if ($anterior === false) json_out(['ok' => false, 'error' => 'Pedido no existe.'], 404);
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE pedidos SET estado = ? WHERE id = ?')->execute([$estado, $id]);
    $pdo->prepare('INSERT INTO pedido_historial (pedido_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?)')
        ->execute([$id, $anterior, $estado, 'Cambio por ' . $admin['nombre']]);
    $pdo->commit();
    json_out(['ok' => true, 'mensaje' => 'Pedido #' . $id . ' → ' . $estado]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['ok' => false, 'error' => 'No se pudo guardar.'], 500);
  }
}

json_out(['ok' => false, 'error' => 'Método no permitido.'], 405);
