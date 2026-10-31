<?php
// POST /api/registro-cliente.php {nombre, email, password, telefono?} -> crea cuenta cliente y abre sesion
require_once __DIR__ . '/cliente-auth.php';
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['ok' => false, 'error' => 'Solo POST.'], 405);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_out(['ok' => false, 'error' => 'Cuerpo JSON inválido.'], 400);
$nombre = trim($body['nombre'] ?? '');
$email = strtolower(trim($body['email'] ?? ''));
$clave = (string)($body['password'] ?? '');
$tel = trim($body['telefono'] ?? '');

if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 120) json_out(['ok' => false, 'error' => 'Nombre inválido (3-120).'], 400);
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 150) json_out(['ok' => false, 'error' => 'Correo inválido.'], 400);
if (mb_strlen($clave) < 4) json_out(['ok' => false, 'error' => 'La clave debe tener al menos 4 caracteres.'], 400);
if ($tel !== '' && !preg_match('/^[0-9+\s-]{6,20}$/', $tel)) json_out(['ok' => false, 'error' => 'Teléfono inválido.'], 400);

try {
  $pdo = db();
  $ex = $pdo->prepare('SELECT id FROM usuarios WHERE LOWER(email) = ?');
  $ex->execute([$email]);
  if ($ex->fetch()) json_out(['ok' => false, 'error' => 'Ese correo ya tiene cuenta. Inicia sesión.'], 409);
  $rol = (int)($pdo->query("SELECT id FROM roles WHERE nombre = 'cliente'")->fetchColumn() ?: 2);
  $stmt = $pdo->prepare('INSERT INTO usuarios (rol_id, nombre, telefono, email, password_hash) VALUES (?, ?, ?, ?, ?) RETURNING id');
  $stmt->execute([$rol, $nombre, $tel, $email, password_hash($clave, PASSWORD_DEFAULT)]);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$stmt->fetchColumn();
  json_out(['ok' => true, 'nombre' => $nombre]);
} catch (Throwable $e) {
  json_out(['ok' => false, 'error' => 'No se pudo crear la cuenta.'], 500);
}
