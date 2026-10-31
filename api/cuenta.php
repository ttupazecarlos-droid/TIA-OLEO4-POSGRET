<?php
// GET /api/cuenta.php -> sesion actual (para mostrar "Hola, ..." y bloquear el pago sin cuenta)
require_once __DIR__ . '/cliente-auth.php';
header('Content-Type: application/json; charset=utf-8');
$u = cliente_actual();
if (!$u) json_out(['ok' => false], 401);
json_out(['ok' => true, 'id' => (int)$u['id'], 'nombre' => $u['nombre'], 'email' => $u['email'],
  'telefono' => $u['telefono'] ?? '', 'direccion' => $u['direccion'] ?? '', 'rol' => $u['rol']]);
