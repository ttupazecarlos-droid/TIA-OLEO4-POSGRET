<?php
// TIA OLEO 4 - Auth de clientes: reutiliza tabla usuarios (rol cliente).
// El admin usa api/admin-auth.php; aqui basta con estar logueado.
require_once __DIR__ . '/../config.php';
iniciar_sesion();

function cliente_actual(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    try {
        $stmt = db()->prepare(
            'SELECT u.id, u.nombre, u.email, u.telefono, u.direccion, r.nombre AS rol
               FROM usuarios u
               JOIN roles r ON r.id = u.rol_id
              WHERE u.id = ? AND u.activo = 1'
        );
        $stmt->execute([(int)$_SESSION['uid']]);
        $u = $stmt->fetch();
        return $u ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

function requerir_cuenta(): array
{
    $u = cliente_actual();
    if (!$u) {
        json_out(['exito' => false, 'ok' => false, 'error' => 'Debes crear una cuenta e iniciar sesión para pagar.'], 401);
    }
    return $u;
}
