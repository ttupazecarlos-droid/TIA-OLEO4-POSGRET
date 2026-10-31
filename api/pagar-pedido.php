<?php
// TIA OLEO 4 - Sesion 7: cobrar pedido pendiente -> pagado (sandbox propio, sin cuenta real)
// POST {pedido_id, numero_tarjeta} -> valida Luhn + tarjetas Stripe test -> actualiza pedidos + pagos
// Pagar exige cuenta: el pedido queda atado a quien lo creo y nadie paga el pedido de otro.
require_once __DIR__ . '/cliente-auth.php';
header('Content-Type: application/json; charset=utf-8');
$yo = requerir_cuenta();

function luhn($num) {
  if (!preg_match('/^\d{13,19}$/', $num)) return false;
  $sum = 0; $alt = false;
  for ($i = strlen($num) - 1; $i >= 0; $i--) {
    $d = (int)$num[$i];
    if ($alt) { $d *= 2; if ($d > 9) $d -= 9; }
    $sum += $d; $alt = !$alt;
  }
  return $sum % 10 === 0;
}

$MAP = [
  '4242424242424242' => 'exito',
  '4000000000000002' => 'rechazada',
  '4000000000009995' => 'fondos_insuficientes',
];
$MSG = [
  'numero_invalido' => 'El número de tarjeta no es válido (no pasa Luhn).',
  'rechazada' => 'Tu banco rechazó la operación (tarjeta de prueba).',
  'fondos_insuficientes' => 'Fondos insuficientes (tarjeta de prueba).',
];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['exito' => false, 'mensaje' => 'Solo POST.'], 405);
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_out(['exito' => false, 'mensaje' => 'Cuerpo JSON inválido.'], 400);
$pedidoId = (int)($body['pedido_id'] ?? 0);
$tarjeta = preg_replace('/\s+/', '', (string)($body['numero_tarjeta'] ?? ''));
if ($pedidoId <= 0) json_out(['exito' => false, 'mensaje' => 'Pedido inválido.'], 400);

try {
  $pdo = db();
  $stmt = $pdo->prepare('SELECT id, usuario_id, total, estado FROM pedidos WHERE id = ?');
  $stmt->execute([$pedidoId]);
  $ped = $stmt->fetch();
  if (!$ped) json_out(['exito' => false, 'mensaje' => 'Pedido no existe.'], 404);
  // El pedido es de quien lo creo: un invitado lo reclama al pagar, nadie paga el de otro (salvo admin)
  if (empty($ped['usuario_id'])) {
    $pdo->prepare('UPDATE pedidos SET usuario_id = ? WHERE id = ?')->execute([(int)$yo['id'], $pedidoId]);
    $ped['usuario_id'] = $yo['id'];
  } elseif ((int)$ped['usuario_id'] !== (int)$yo['id'] && ($yo['rol'] ?? '') !== 'administrador') {
    json_out(['exito' => false, 'motivo' => 'cuenta', 'mensaje' => 'Ese pedido es de otra cuenta. Inicia sesión con la cuenta que lo creó.'], 403);
  }
  if ($ped['estado'] === 'pagado') json_out(['exito' => true, 'transaccion_id' => 'ya-pagado', 'pedido' => $ped]);
  if ($ped['estado'] !== 'pendiente') json_out(['exito' => false, 'motivo' => 'estado', 'mensaje' => 'Solo se puede pagar un pedido pendiente (actual: ' . $ped['estado'] . ').'], 400);

  if (!luhn($tarjeta)) json_out(['exito' => false, 'motivo' => 'numero_invalido', 'mensaje' => $MSG['numero_invalido']]);
  $esc = $MAP[$tarjeta] ?? 'exito';
  if ($esc !== 'exito') {
    $pdo->prepare('INSERT INTO pagos (pedido_id, metodo, estado, total) VALUES (?, ?, ?, ?)
                   ON CONFLICT (pedido_id) DO UPDATE SET estado = EXCLUDED.estado, total = EXCLUDED.total')
        ->execute([$pedidoId, 'Tarjeta (sandbox)', 'Rechazado', (float)$ped['total']]);
    json_out(['exito' => false, 'motivo' => $esc, 'mensaje' => $MSG[$esc]]);
  }

  $trans = 'sim_' . base_convert((string)time(), 10, 36) . substr(bin2hex(random_bytes(3)), 0, 4);
  $pdo->beginTransaction();
  $pdo->prepare('UPDATE pedidos SET estado = ? WHERE id = ?')->execute(['pagado', $pedidoId]);
  $pdo->prepare('INSERT INTO pagos (pedido_id, metodo, estado, transaccion_id, total) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (pedido_id) DO UPDATE
                 SET metodo = EXCLUDED.metodo, estado = EXCLUDED.estado,
                     transaccion_id = EXCLUDED.transaccion_id, total = EXCLUDED.total')
      ->execute([$pedidoId, 'Tarjeta (sandbox)', 'Pagado', $trans, (float)$ped['total']]);
  $pdo->prepare('INSERT INTO pedido_historial (pedido_id, estado_anterior, estado_nuevo, comentario) VALUES (?, ?, ?, ?)')
      ->execute([$pedidoId, 'pendiente', 'pagado', 'Pago sandbox ' . $trans]);
  $pdo->prepare('INSERT INTO eventos_analitica (tipo_evento, datos_json, pagina) VALUES (?, ?, ?)')
      ->execute(['pedido_generado', json_encode(['total' => (float)$ped['total']], JSON_UNESCAPED_UNICODE), 'demo-pasarela-pago.html']);
  $pdo->commit();

  json_out(['exito' => true, 'transaccion_id' => $trans, 'pedido' => ['id' => $pedidoId, 'total' => (float)$ped['total'], 'estado' => 'pagado']]);
} catch (Throwable $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_out(['exito' => false, 'mensaje' => 'Error al procesar el pago.'], 500);
}
