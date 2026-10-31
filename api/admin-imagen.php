<?php
// ============================================================
// Admin: fotos de productos (requiere sesion admin)
// GET  ?producto_id=N -> lista imagenes del producto
// POST multipart {accion:subir, producto_id, foto}
//      -> valida (jpg/png/webp <=2MB, imagen real), guarda en
//         img/ con nombre propio y la deja como principal
// POST JSON {accion:principal, imagen_id} -> cambia la principal
// POST JSON {accion:eliminar, imagen_id}  -> borra fila y archivo
// Tras cada cambio sincroniza productos.imagen con la principal.
// ============================================================
require_once __DIR__ . '/admin-auth.php';
require_once __DIR__ . '/../supabase-storage.php';
$admin = requerir_admin();
$pdo = db();

define('IMG_DIR', __DIR__ . '/../img');
define('IMG_MAX', 2 * 1024 * 1024); // 2 MB
$TIPOS = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

// Mantiene productos.imagen igual a la foto principal
function sincronizar_principal(PDO $pdo, int $pid): void {
  $stmt = $pdo->prepare('SELECT url FROM producto_imagenes WHERE producto_id = ? AND es_principal = 1 LIMIT 1');
  $stmt->execute([$pid]);
  $url = $stmt->fetchColumn();
  $pdo->prepare('UPDATE productos SET imagen = ? WHERE id = ?')->execute([$url === false ? '' : $url, $pid]);
}

function fila_imagen(PDO $pdo, int $imgId): ?array {
  $stmt = $pdo->prepare('SELECT i.id, i.producto_id, i.url, i.es_principal FROM producto_imagenes i WHERE i.id = ?');
  $stmt->execute([$imgId]);
  $r = $stmt->fetch();
  return $r ?: null;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $pid = (int)($_GET['producto_id'] ?? 0);
  if ($pid <= 0) json_out(['ok' => false, 'error' => 'Producto inválido.'], 400);
  $stmt = $pdo->prepare('SELECT id, url, es_principal FROM producto_imagenes WHERE producto_id = ? ORDER BY es_principal DESC, orden, id');
  $stmt->execute([$pid]);
  json_out(['ok' => true, 'imagenes' => $stmt->fetchAll()]);
}

// ---- Subir archivo (multipart) ----
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['foto'])) {
  $pid = (int)($_POST['producto_id'] ?? 0);
  if ($pid <= 0) json_out(['ok' => false, 'error' => 'Producto inválido.'], 400);
  $stmt = $pdo->prepare('SELECT 1 FROM productos WHERE id = ?');
  $stmt->execute([$pid]);
  if (!$stmt->fetchColumn()) json_out(['ok' => false, 'error' => 'Producto no existe.'], 404);

  $f = $_FILES['foto'];
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_out(['ok' => false, 'error' => 'No se recibió el archivo.'], 400);
  }
  if ($f['size'] <= 0 || $f['size'] > IMG_MAX) {
    json_out(['ok' => false, 'error' => 'La foto debe pesar hasta 2 MB.'], 400);
  }
  $info = @getimagesize($f['tmp_name']);
  if ($info === false || !isset($TIPOS[$info['mime']])) {
    json_out(['ok' => false, 'error' => 'Solo JPG, PNG o WebP.'], 400);
  }

  $nombre = 'p' . $pid . '_' . bin2hex(random_bytes(4)) . '.' . $TIPOS[$info['mime']];
  $destino = '';
  $urlPublica = '';

  try {
    if (supabase_configurado()) {
      // Produccion: bucket publico de Supabase Storage
      $urlPublica = supabase_storage_subir($f['tmp_name'], $nombre, $info['mime']);
    } else {
      // Local / hosting con disco persistente
      if (!is_dir(IMG_DIR) || !is_writable(IMG_DIR)) {
        json_out(['ok' => false, 'error' => 'Carpeta img no escribible. Configura SUPABASE_STORAGE o da permisos a img/.'], 500);
      }
      $destino = IMG_DIR . DIRECTORY_SEPARATOR . $nombre;
      if (!move_uploaded_file($f['tmp_name'], $destino)) {
        json_out(['ok' => false, 'error' => 'No se pudo guardar el archivo.'], 500);
      }
      $urlPublica = 'img/' . $nombre;
    }

    $pdo->beginTransaction();
    $pdo->prepare('UPDATE producto_imagenes SET es_principal = 0 WHERE producto_id = ?')->execute([$pid]);
    $stmt = $pdo->prepare('INSERT INTO producto_imagenes (producto_id, url, es_principal, orden) VALUES (?, ?, 1, 0) RETURNING id');
    $stmt->execute([$pid, $urlPublica]);
    $imgId = (int)$stmt->fetchColumn();
    sincronizar_principal($pdo, $pid);
    $pdo->commit();
    json_out(['ok' => true, 'imagen_id' => $imgId, 'url' => $urlPublica, 'mensaje' => 'Foto subida y marcada como principal.']);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    if ($destino !== '' && is_file($destino)) @unlink($destino);
    if ($urlPublica !== '' && supabase_configurado()) supabase_storage_eliminar_url($urlPublica);
    $error = ['ok' => false, 'error' => 'No se pudo registrar.'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 500);
  }
}

// ---- Acciones JSON: principal / eliminar ----
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) json_out(['ok' => false, 'error' => 'Cuerpo JSON inválido.'], 400);
  $accion = $body['accion'] ?? '';
  $imgId = (int)($body['imagen_id'] ?? 0);
  $fila = $imgId > 0 ? fila_imagen($pdo, $imgId) : null;
  if (!$fila) json_out(['ok' => false, 'error' => 'Foto no existe.'], 404);
  $pid = (int)$fila['producto_id'];

  if ($accion === 'principal') {
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE producto_imagenes SET es_principal = 0 WHERE producto_id = ?')->execute([$pid]);
    $pdo->prepare('UPDATE producto_imagenes SET es_principal = 1 WHERE id = ?')->execute([$imgId]);
    sincronizar_principal($pdo, $pid);
    $pdo->commit();
    json_out(['ok' => true, 'mensaje' => 'Foto principal actualizada.']);
  }

  if ($accion === 'eliminar') {
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM producto_imagenes WHERE id = ?')->execute([$imgId]);
    sincronizar_principal($pdo, $pid);
    $pdo->commit();

    $url = (string)$fila['url'];
    // Si vive en Supabase Storage se borra alli; si no, en img/
    if (!supabase_storage_eliminar_url($url)) {
      $ruta = realpath(IMG_DIR . DIRECTORY_SEPARATOR . basename($url));
      $base = realpath(IMG_DIR);
      if ($ruta && $base && strpos($ruta, $base) === 0 && is_file($ruta)) @unlink($ruta);
    }
    json_out(['ok' => true, 'mensaje' => 'Foto eliminada.']);
  }

  json_out(['ok' => false, 'error' => 'Acción inválida.'], 400);
}

json_out(['ok' => false, 'error' => 'Método no permitido.'], 405);
