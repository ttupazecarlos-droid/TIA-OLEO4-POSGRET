<?php
// GET /api/sesion.php -> dice si hay admin logueado (para mostrar login o panel)
require_once __DIR__ . '/admin-auth.php';

$u = admin_actual();
if (!$u) json_out(['ok' => false], 401);
json_out(['ok' => true, 'nombre' => $u['nombre'], 'email' => $u['email']]);
