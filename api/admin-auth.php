<?php
// ============================================================
// Puerta del admin: solo deja pasar a usuarios con rol
// "administrador" y sesion iniciada. Usar al inicio de cada
// endpoint admin:  require_once __DIR__ . '/admin-auth.php';
//                  $admin = requerir_admin();
// ============================================================
require_once __DIR__ . '/../config.php';
iniciar_sesion();

function admin_actual(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    try {
        $stmt = db()->prepare(
            'SELECT u.id, u.nombre, u.email, r.nombre AS rol
               FROM usuarios u
               JOIN roles r ON r.id = u.rol_id
              WHERE u.id = ? AND u.activo = 1'
        );
        $stmt->execute([(int)$_SESSION['uid']]);
        $u = $stmt->fetch();
        return ($u && $u['rol'] === 'administrador') ? $u : null;
    } catch (Throwable $e) {
        return null;
    }
}

function requerir_admin(): array
{
    $u = admin_actual();
    if (!$u) {
        json_out(['ok' => false, 'error' => 'Acceso solo para el administrador. Inicia sesión.'], 401);
    }
    return $u;
}
