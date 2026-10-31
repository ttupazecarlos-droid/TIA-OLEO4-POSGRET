<?php
// TIA OLEO 4 - Reiniciar analitica (boton del panel, solo admin)
require_once __DIR__ . '/api/admin-auth.php';
requerir_admin();
header('Content-Type: application/json; charset=utf-8');

try {
    db()->exec('DELETE FROM eventos_analitica');
    json_out(['ok' => true]);
} catch (Throwable $e) {
    $error = ['ok' => false, 'error' => 'Error de BD.'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 500);
}
