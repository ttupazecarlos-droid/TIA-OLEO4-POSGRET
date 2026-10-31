<?php
// POST /api/login-cliente.php {email, password} -> abre sesion de cliente (o admin que compra)
require_once __DIR__ . '/cliente-auth.php';
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['ok' => false, 'error' => 'Solo POST.'], 405);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_out(['ok' => false, 'error' => 'Cuerpo JSON inválido.'], 400);
$email = strtolower(trim($body['email'] ?? ''));
$clave = (string)($body['password'] ?? '');

try {
  $stmt = db()->prepare('SELECT u.id, u.nombre, u.password_hash, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE LOWER(u.email) = ? AND u.activo = 1');
  $stmt->execute([$email]);
  $u = $stmt->fetch();
  if (!$u || !password_verify($clave, $u['password_hash'])) json_out(['ok' => false, 'error' => 'Correo o clave incorrectos.'], 401);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$u['id'];
  json_out(['ok' => true, 'nombre' => $u['nombre'], 'rol' => $u['rol']]);
} catch (Throwable $e) {
  json_out(['ok' => false, 'error' => 'Error de BD.'], 500);
}
