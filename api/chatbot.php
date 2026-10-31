<?php
// ============================================================
// API /api/chatbot.php
// POST: guarda lo que preguntan al chatbot (analitica para
//       saber que palabra se usa mas y mejorar respuestas).
// GET:  devuelve el ranking de palabras (para el admin).
// ============================================================
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');

try {
  $pdo = db();

  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) json_out(['ok' => false], 400);
    $mensaje = mb_substr(trim($body['mensaje'] ?? ''), 0, 200);
    $clave = mb_substr(trim($body['palabra_clave'] ?? 'sin-coincidencia'), 0, 60);
    if ($mensaje === '') json_out(['ok' => false], 400);
    $stmt = $pdo->prepare('INSERT INTO chatbot_consultas (palabra_clave, mensaje) VALUES (?, ?)');
    $stmt->execute([$clave ?: 'sin-coincidencia', $mensaje]);
    json_out(['ok' => true]);
  }

  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Ranking interno: solo administrador
    require_once __DIR__ . '/admin-auth.php';
    requerir_admin();
    $rows = $pdo->query("SELECT palabra_clave, COUNT(*)::int AS veces FROM chatbot_consultas GROUP BY palabra_clave ORDER BY veces DESC LIMIT 20")->fetchAll();
    json_out(['ok' => true, 'ranking' => $rows]);
  }

  json_out(['ok' => false, 'error' => 'Método no permitido.'], 405);
} catch (Throwable $e) {
  $error = ['ok' => false, 'error' => 'Error de BD.'];
  if (APP_DEBUG) $error['detalle'] = $e->getMessage();
  json_out($error, 500);
}
