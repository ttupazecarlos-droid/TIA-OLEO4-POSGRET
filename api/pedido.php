<?php
// ============================================================
// API POST /api/pedido.php
// Guarda el carrito como PEDIDO en PostgreSQL. Solo acepta POST.
// ------------------------------------------------------------
// POR QUE POST Y NO GET (tu pregunta del informe):
// - GET pone los datos en la URL (?nombre=...&total=...): queda en
//   historial, logs y puede ser visto/alterado en la red
//   (ataque "hombre en el medio").
// - POST manda los datos en el CUERPO de la peticion JSON, no en
//   la URL: no queda en historial ni en logs del servidor.
// - Ademas usamos consultas PREPARADAS (PDO) para que nadie pueda
//   inyectar SQL, y validamos tipos/rangos en el servidor.
// ============================================================
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');
iniciar_sesion();
$uidPedido = isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_out(['ok' => false, 'error' => 'Este endpoint solo acepta POST con JSON.'], 405);
}

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
  json_out(['ok' => false, 'error' => 'Cuerpo JSON invalido.'], 400);
}

$nombre    = trim($body['cliente_nombre'] ?? '');
$telefono  = trim($body['cliente_telefono'] ?? '');
$direccion = trim($body['cliente_direccion'] ?? '');
$metodo    = trim($body['metodo_pago'] ?? 'whatsapp');
$items     = $body['items'] ?? [];

// --- Validaciones del servidor (nunca confies solo en el JS) ---
if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 120) {
  json_out(['ok' => false, 'error' => 'Nombre del cliente invalido (3-120 caracteres).'], 400);
}
if (!preg_match('/^[0-9+\s-]{6,20}$/', $telefono)) {
  json_out(['ok' => false, 'error' => 'Telefono invalido.'], 400);
}
if (!is_array($items) || count($items) === 0 || count($items) > 50) {
  json_out(['ok' => false, 'error' => 'El carrito esta vacio o es muy grande.'], 400);
}

try {
  $pdo = db();

  // Normalizar items: [{id, cantidad}]
  $ids = [];
  foreach ($items as $it) {
    $pid = (int)($it['id'] ?? 0);
    $cant = (int)($it['cantidad'] ?? 0);
    if ($pid <= 0 || $cant <= 0 || $cant > 99) {
      json_out(['ok' => false, 'error' => 'Cantidad invalida en un producto.'], 400);
    }
    $ids[$pid] = $cant; // si se repite, se queda la ultima cantidad
  }

  // Traer precios/stock REALES de la BD (el total se recalcula aqui,
  // no se acepta el total que manda el navegador).
  $ph = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare("SELECT id, precio, stock, nombre FROM productos WHERE id IN ($ph) AND activo = 1");
  $stmt->execute(array_keys($ids));
  $rows = $stmt->fetchAll();

  if (count($rows) !== count($ids)) {
    json_out(['ok' => false, 'error' => 'Un producto ya no existe.'], 400);
  }

  $subtotal = 0.0;
  $lineas = [];
  foreach ($rows as $r) {
    $cant = $ids[(int)$r['id']];
    if ($cant > (int)$r['stock']) {
      json_out(['ok' => false, 'error' => 'Sin stock suficiente: ' . $r['nombre'] . ' (stock: ' . $r['stock'] . ')'], 400);
    }
    $sub = round((float)$r['precio'] * $cant, 2);
    $subtotal += $sub;
    $lineas[] = ['producto_id' => (int)$r['id'], 'cantidad' => $cant, 'precio' => (float)$r['precio'], 'subtotal' => $sub, 'stock_antes' => (int)$r['stock']];
  }
  $subtotal = round($subtotal, 2);
  $descuento = 0.0;
  $total = $subtotal;

  // Guardar pedido + items + kardex + historial en una transaccion
  $pdo->beginTransaction();

  $stmt = $pdo->prepare('INSERT INTO pedidos (usuario_id, cliente_nombre, cliente_telefono, cliente_direccion, subtotal, descuento, total, canal, metodo_pago) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
  $stmt->execute([$uidPedido, $nombre, $telefono, $direccion, $subtotal, $descuento, $total, 'web', $metodo ?: 'whatsapp']);
  $pedidoId = (int)$stmt->fetchColumn();

  $stmtItem = $pdo->prepare('INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
  $stmtStock = $pdo->prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
  $stmtMov = $pdo->prepare("INSERT INTO inventario_movimientos (producto_id, pedido_id, tipo, cantidad, stock_antes, stock_despues, motivo) VALUES (?, ?, 'salida', ?, ?, ?, ?)");
  foreach ($lineas as $l) {
    $stmtItem->execute([$pedidoId, $l['producto_id'], $l['cantidad'], $l['precio'], $l['subtotal']]);
    $stmtStock->execute([$l['cantidad'], $l['producto_id']]);
    $stmtMov->execute([$l['producto_id'], $pedidoId, $l['cantidad'], $l['stock_antes'], $l['stock_antes'] - $l['cantidad'], 'Venta pedido #' . $pedidoId]);
  }

  // Primera entrada del historial de estados
  $pdo->prepare('INSERT INTO pedido_historial (pedido_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?)')
      ->execute([$pedidoId, '', 'pendiente', 'Pedido creado desde la web']);

  $pdo->commit();

  json_out(['ok' => true, 'pedido_id' => $pedidoId, 'subtotal' => $subtotal, 'total' => $total,
            'mensaje' => 'Pedido #' . $pedidoId . ' registrado. Te contactaremos por WhatsApp.']);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_out(['ok' => false, 'error' => 'No se pudo guardar el pedido.', 'detalle' => $e->getMessage()], 500);
}
