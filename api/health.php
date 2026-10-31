<?php
// GET /api/health.php -> comprobacion de vida para Railway/Render/Docker
require_once __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');

try {
    db()->query('SELECT 1');
    json_out(['ok' => true, 'db' => 'postgresql', 'entorno' => APP_ENV]);
} catch (Throwable $e) {
    $error = ['ok' => false, 'db' => 'error'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 503);
}
