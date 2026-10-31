<?php
// ============================================================
// Admin: cotizaciones para clientes (requiere sesion admin)
// GET  -> ultimas 50 con sus lineas
// POST {cliente_nombre, cliente_telefono, items:[{id,cantidad}]}
//      -> crea cotizacion con precios reales de la BD
// POST {id, estado} -> cambia pendiente/aprobada/rechazada
// ============================================================
require_once __DIR__ . '/admin-auth.php';
$admin = requerir_admin();
$pdo = db();
$ESTADOS = ['pendiente', 'aprobada', 'rechazada'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  try {
    $cots = $pdo->query("SELECT id, cliente_nombre, cliente_telefono, total, estado, to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS creado_en FROM cotizaciones ORDER BY id DESC LIMIT 50")->fetchAll();
    $items = $pdo->query('SELECT i.cotizacion_id, i.cantidad, i.precio_unitario, i.subtotal, p.nombre FROM cotizacion_items i JOIN productos p ON p.id = i.producto_id ORDER BY i.cotizacion_id DESC')->fetchAll();
    $map = [];
    foreach ($items as $it) {
      $map[(int)$it['cotizacion_id']][] = [
        'texto' => (int)$it['cantidad'] . 'x ' . $it['nombre'],
        'precio' => (float)$it['precio_unitario'],
        'subtotal' => (float)$it['subtotal']
      ];
    }
    foreach ($cots as &$c) {
      $c['items'] = $map[(int)$c['id']] ?? [];
      $c['total'] = (float)$c['total'];
    }
    unset($c);
    json_out(['ok' => true, 'total' => count($cots), 'estados' => $ESTADOS, 'cotizaciones' => $cots]);
  } catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Error de BD.'], 500);
  }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) json_out(['ok' => false, 'error' => 'JSON inválido.'], 400);

  // Cambio de estado
  if (isset($body['estado']) && !isset($body['items'])) {
    $id = (int)($body['id'] ?? 0);
    $estado = trim($body['estado'] ?? '');
    if ($id <= 0 || !in_array($estado, $ESTADOS, true)) {
      json_out(['ok' => false, 'error' => 'Estado inválido.'], 400);
    }
    $pdo->prepare('UPDATE cotizaciones SET estado = ? WHERE id = ?')->execute([$estado, $id]);
    json_out(['ok' => true, 'mensaje' => 'Cotización #' . $id . ' → ' . $estado]);
  }

  // Nueva cotizacion
  $nombre = trim($body['cliente_nombre'] ?? '');
  $tel = trim($body['cliente_telefono'] ?? '');
  $items = $body['items'] ?? [];
  if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 120) {
    json_out(['ok' => false, 'error' => 'Nombre del cliente inválido.'], 400);
  }
  if ($tel !== '' && !preg_match('/^[0-9+\s-]{6,20}$/', $tel)) {
    json_out(['ok' => false, 'error' => 'Teléfono inválido.'], 400);
  }
  if (!is_array($items) || !count($items) || count($items) > 50) {
    json_out(['ok' => false, 'error' => 'Agrega al menos un producto.'], 400);
  }
  try {
    $ids = [];
    foreach ($items as $it) {
      $pid = (int)($it['id'] ?? 0);
      $cant = (int)($it['cantidad'] ?? 0);
      if ($pid <= 0 || $cant <= 0 || $cant > 99) {
        json_out(['ok' => false, 'error' => 'Cantidad inválida.'], 400);
      }
      $ids[$pid] = $cant;
    }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT id, nombre, precio FROM productos WHERE id IN ($ph) AND activo = 1");
    $stmt->execute(array_keys($ids));
    $rows = $stmt->fetchAll();
    if (count($rows) !== count($ids)) {
      json_out(['ok' => false, 'error' => 'Un producto ya no existe.'], 400);
    }
    $total = 0.0;
    $lineas = [];
    foreach ($rows as $r) {
      $sub = round((float)$r['precio'] * $ids[(int)$r['id']], 2);
      $total += $sub;
      $lineas[] = ['producto_id' => (int)$r['id'], 'nombre' => $r['nombre'], 'cantidad' => $ids[(int)$r['id']], 'precio' => (float)$r['precio'], 'subtotal' => $sub];
    }
    $total = round($total, 2);

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('INSERT INTO cotizaciones (usuario_id, cliente_nombre, cliente_telefono, subtotal, total) VALUES (?, ?, ?, ?, ?) RETURNING id');
    $stmt->execute([$admin['id'], $nombre, $tel, $total, $total]);
    $cotId = (int)$stmt->fetchColumn();
    $stmtItem = $pdo->prepare('INSERT INTO cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
    foreach ($lineas as $l) {
      $stmtItem->execute([$cotId, $l['producto_id'], $l['cantidad'], $l['precio'], $l['subtotal']]);
    }
    $pdo->commit();
    json_out(['ok' => true, 'cotizacion_id' => $cotId, 'total' => $total, 'lineas' => $lineas, 'mensaje' => 'Cotización #' . $cotId . ' guardada.']);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['ok' => false, 'error' => 'No se pudo guardar.'], 500);
  }
}

json_out(['ok' => false, 'error' => 'Método no permitido.'], 405);
