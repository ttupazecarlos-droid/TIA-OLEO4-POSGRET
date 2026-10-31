<?php
// TIA OLEO 4 - Motor analitica: registra eventos en PostgreSQL.
// Vincula index.html + panel-control.html (tabla eventos_analitica).
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) json_out(['ok' => false], 400);
    $tipo = mb_substr(trim($body['tipo_evento'] ?? ''), 0, 60);
    $datos = $body['datos'] ?? [];
    $pagina = mb_substr(trim($body['pagina'] ?? ''), 0, 80);
    if ($tipo === '') {
        json_out(['ok' => false], 400);
    }

    $datosJson = mb_substr(json_encode($datos, JSON_UNESCAPED_UNICODE) ?: '{}', 0, 1000);
    $stmt = db()->prepare('INSERT INTO eventos_analitica (tipo_evento, datos_json, pagina) VALUES (?, ?, ?)');
    $stmt->execute([$tipo, $datosJson, $pagina]);
    json_out(['ok' => true]);
} catch (Throwable $e) {
    $error = ['ok' => false, 'error' => 'Error de BD.'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 500);
}
