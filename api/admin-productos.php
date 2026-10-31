<?php
// ============================================================
// Admin: inventario de productos (requiere sesion admin)
// GET  ?buscar=&categoria=  -> lista + listas de todas las tablas
// GET  ?id=                 -> un producto con todos sus campos
// POST {id, stock, precio}  -> actualiza + registra AJUSTE en kardex
// POST {accion:'crear', ...}      -> nuevo producto + ENTRADA en kardex
// POST {accion:'actualizar', id, ...} -> edita toda la info + AJUSTE si cambia stock
// ============================================================
require_once __DIR__ . '/admin-auth.php';
$admin = requerir_admin();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  // ---- Un solo producto con todos los campos (para el modal Editar) ----
  if (!empty($_GET['id'])) {
    try {
      $stmt = $pdo->prepare('SELECT * FROM productos WHERE id = ?');
      $stmt->execute([(int)$_GET['id']]);
      $p = $stmt->fetch();
      if (!$p) json_out(['ok' => false, 'error' => 'Producto no existe.'], 404);
      $p['id'] = (int)$p['id'];
      $p['precio'] = (float)$p['precio'];
      $p['stock'] = (int)$p['stock'];
      $p['cantidad'] = (int)$p['cantidad'];
      $p['destacado'] = (int)$p['destacado'];
      $p['activo'] = (int)$p['activo'];
      foreach (['categoria_id','calidad_id','marca_id','proveedor_id','gramaje_id','dureza_id','cerda_id','tipo_pintura_id'] as $k) {
        $p[$k] = $p[$k] === null ? 0 : (int)$p[$k];
      }
      json_out(['ok' => true, 'producto' => $p]);
    } catch (Throwable $e) {
      json_out(['ok' => false, 'error' => 'Error de BD.'], 500);
    }
  }
  $where = ['p.activo IN (0,1)'];
  $params = [];
  if (!empty($_GET['buscar'])) {
    $where[] = '(p.nombre ILIKE :q1 OR p.descripcion ILIKE :q2)';
    $params[':q1'] = '%' . trim($_GET['buscar']) . '%';
    $params[':q2'] = '%' . trim($_GET['buscar']) . '%';
  }
  if (!empty($_GET['categoria'])) {
    $where[] = 'c.slug = LOWER(:cat)';
    $params[':cat'] = trim($_GET['categoria']);
  }
  $sql = "SELECT p.id, p.nombre, p.precio, p.stock, p.activo, p.imagen, p.destacado,
                 p.descripcion, p.detalle_venta, p.contenido, p.cantidad, p.unidad,
                 p.categoria_id, p.calidad_id, p.marca_id, p.proveedor_id,
                 p.gramaje_id, p.dureza_id, p.cerda_id, p.tipo_pintura_id,
                  c.nombre AS categoria, m.nombre AS marca,
                  g.valor AS gramaje, d.codigo AS dureza
           FROM productos p
          JOIN categorias c ON c.id = p.categoria_id
          LEFT JOIN marcas m ON m.id = p.marca_id
          LEFT JOIN gramajes g ON g.id = p.gramaje_id
          LEFT JOIN durezas d ON d.id = p.dureza_id
          WHERE " . implode(' AND ', $where) . " ORDER BY c.id, p.id";
  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
      $r['precio'] = (float)$r['precio'];
      $r['stock'] = (int)$r['stock'];
    }
    unset($r);
    $cats = $pdo->query('SELECT slug, nombre FROM categorias ORDER BY id')->fetchAll();
    // Listas de todas las tablas relacionadas (para el formulario de nuevo producto)
    $listas = [
      'categorias' => $pdo->query('SELECT id, nombre FROM categorias ORDER BY id')->fetchAll(),
      'calidades' => $pdo->query('SELECT id, nombre FROM calidades ORDER BY nivel')->fetchAll(),
      'marcas' => $pdo->query('SELECT id, nombre FROM marcas ORDER BY nombre')->fetchAll(),
      'proveedores' => $pdo->query('SELECT id, nombre FROM proveedores ORDER BY nombre')->fetchAll(),
      'gramajes' => $pdo->query('SELECT id, valor FROM gramajes ORDER BY valor')->fetchAll(),
      'durezas' => $pdo->query('SELECT id, codigo FROM durezas ORDER BY id')->fetchAll(),
      'cerdas' => $pdo->query('SELECT id, nombre FROM tipos_cerda ORDER BY id')->fetchAll(),
      'tipos_pintura' => $pdo->query('SELECT id, nombre FROM tipos_pintura ORDER BY id')->fetchAll()
    ];
    json_out(['ok' => true, 'total' => count($rows), 'categorias' => $cats, 'productos' => $rows, 'listas' => $listas]);
  } catch (Throwable $e) {
    json_out(['ok' => false, 'error' => 'Error de BD.'], 500);
  }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $body = json_decode(file_get_contents('php://input'), true);
  if (!is_array($body)) json_out(['ok' => false, 'error' => 'JSON inválido.'], 400);

  // ---- Editar toda la info de un producto existente ----
  if (($body['accion'] ?? '') === 'actualizar') {
    $id = (int)($body['id'] ?? 0);
    $nombre = trim($body['nombre'] ?? '');
    $descripcion = trim($body['descripcion'] ?? '');
    $detalle = trim($body['detalle_venta'] ?? '');
    $contenido = trim($body['contenido'] ?? '');
    $unidad = trim($body['unidad'] ?? 'unidad');
    $cat = (int)($body['categoria_id'] ?? 0);
    $cal = (int)($body['calidad_id'] ?? 0);
    $marca = (int)($body['marca_id'] ?? 0) ?: null;
    $prov = (int)($body['proveedor_id'] ?? 0) ?: null;
    $gram = (int)($body['gramaje_id'] ?? 0) ?: null;
    $dur = (int)($body['dureza_id'] ?? 0) ?: null;
    $cer = (int)($body['cerda_id'] ?? 0) ?: null;
    $tp = (int)($body['tipo_pintura_id'] ?? 0) ?: null;
    $cant = (int)($body['cantidad'] ?? 1);
    $precio = $body['precio'] ?? null;
    $stock = $body['stock'] ?? null;
    $dest = !empty($body['destacado']) ? 1 : 0;
    $activo = isset($body['activo']) ? (!empty($body['activo']) ? 1 : 0) : 1;

    if ($id <= 0) json_out(['ok' => false, 'error' => 'ID inválido.'], 400);
    if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 150) {
      json_out(['ok' => false, 'error' => 'Nombre inválido (3-150).'], 400);
    }
    if ($descripcion === '' || $detalle === '' || $contenido === '' || $unidad === '') {
      json_out(['ok' => false, 'error' => 'Completa descripción, detalle de venta, contenido y unidad.'], 400);
    }
    if ($cat <= 0 || $cal <= 0) {
      json_out(['ok' => false, 'error' => 'Elige categoría y calidad.'], 400);
    }
    if ($cant < 1 || $cant > 9999 || !is_numeric($stock) || (int)$stock < 0 || (int)$stock > 9999) {
      json_out(['ok' => false, 'error' => 'Cantidad/stock inválidos.'], 400);
    }
    if (!is_numeric($precio) || (float)$precio <= 0 || (float)$precio > 99999) {
      json_out(['ok' => false, 'error' => 'Precio inválido.'], 400);
    }
    try {
      $existe = function (string $tabla, $id) use ($pdo): bool {
        if ($id === null) return true;
        $s = $pdo->prepare("SELECT 1 FROM $tabla WHERE id = ?");
        $s->execute([$id]);
        return (bool)$s->fetchColumn();
      };
      foreach (['categorias' => $cat, 'calidades' => $cal, 'marcas' => $marca,
        'proveedores' => $prov, 'gramajes' => $gram, 'durezas' => $dur,
        'tipos_cerda' => $cer, 'tipos_pintura' => $tp] as $tabla => $val) {
        if (!$existe($tabla, $val)) json_out(['ok' => false, 'error' => "Valor inválido en $tabla."], 400);
      }
      $s = $pdo->prepare('SELECT stock FROM productos WHERE id = ?');
      $s->execute([$id]);
      $antes = $s->fetchColumn();
      if ($antes === false) json_out(['ok' => false, 'error' => 'Producto no existe.'], 404);

      $pdo->beginTransaction();
      $pdo->prepare('UPDATE productos SET categoria_id=?, calidad_id=?, marca_id=?, proveedor_id=?, gramaje_id=?, dureza_id=?, cerda_id=?, tipo_pintura_id=?, nombre=?, descripcion=?, detalle_venta=?, contenido=?, cantidad=?, unidad=?, precio=?, stock=?, destacado=?, activo=? WHERE id=?')
          ->execute([$cat, $cal, $marca, $prov, $gram, $dur, $cer, $tp, $nombre, $descripcion, $detalle, $contenido, $cant, $unidad, round((float)$precio, 2), (int)$stock, $dest, $activo, $id]);
      if ((int)$stock !== (int)$antes) {
        $pdo->prepare("INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo) VALUES (?, 'ajuste', ?, ?, ?, ?)")
            ->execute([$id, abs((int)$stock - (int)$antes), (int)$antes, (int)$stock, 'Edición de producto (' . $admin['nombre'] . ')']);
      }
      $pdo->commit();
      json_out(['ok' => true, 'mensaje' => 'Producto #' . $id . ' actualizado.']);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      json_out(['ok' => false, 'error' => 'No se pudo actualizar.'], 500);
    }
  }

  // ---- Crear producto nuevo (todas las tablas relacionadas) ----
  if (($body['accion'] ?? '') === 'crear') {
    $nombre = trim($body['nombre'] ?? '');
    $descripcion = trim($body['descripcion'] ?? '');
    $detalle = trim($body['detalle_venta'] ?? '');
    $contenido = trim($body['contenido'] ?? '');
    $unidad = trim($body['unidad'] ?? 'unidad');
    $cat = (int)($body['categoria_id'] ?? 0);
    $cal = (int)($body['calidad_id'] ?? 0);
    $marca = (int)($body['marca_id'] ?? 0) ?: null;
    $prov = (int)($body['proveedor_id'] ?? 0) ?: null;
    $gram = (int)($body['gramaje_id'] ?? 0) ?: null;
    $dur = (int)($body['dureza_id'] ?? 0) ?: null;
    $cer = (int)($body['cerda_id'] ?? 0) ?: null;
    $tp = (int)($body['tipo_pintura_id'] ?? 0) ?: null;
    $cant = (int)($body['cantidad'] ?? 1);
    $precio = $body['precio'] ?? null;
    $stock = $body['stock'] ?? null;
    $imagen = trim($body['imagen'] ?? '');
    $dest = !empty($body['destacado']) ? 1 : 0;

    if (mb_strlen($nombre) < 3 || mb_strlen($nombre) > 150) {
      json_out(['ok' => false, 'error' => 'Nombre inválido (3-150).'], 400);
    }
    if ($descripcion === '' || $detalle === '' || $contenido === '' || $unidad === '') {
      json_out(['ok' => false, 'error' => 'Completa descripción, detalle de venta, contenido y unidad.'], 400);
    }
    if ($cat <= 0 || $cal <= 0) {
      json_out(['ok' => false, 'error' => 'Elige categoría y calidad.'], 400);
    }
    if ($cant < 1 || $cant > 9999 || !is_numeric($stock) || (int)$stock < 0 || (int)$stock > 9999) {
      json_out(['ok' => false, 'error' => 'Cantidad/stock inválidos.'], 400);
    }
    if (!is_numeric($precio) || (float)$precio <= 0 || (float)$precio > 99999) {
      json_out(['ok' => false, 'error' => 'Precio inválido.'], 400);
    }
    try {
      // Verifica que cada FK exista en su tabla
      $existe = function (string $tabla, $id) use ($pdo): bool {
        if ($id === null) return true;
        $s = $pdo->prepare("SELECT 1 FROM $tabla WHERE id = ?");
        $s->execute([$id]);
        return (bool)$s->fetchColumn();
      };
      $chequeos = ['categorias' => $cat, 'calidades' => $cal, 'marcas' => $marca,
        'proveedores' => $prov, 'gramajes' => $gram, 'durezas' => $dur,
        'tipos_cerda' => $cer, 'tipos_pintura' => $tp];
      foreach ($chequeos as $tabla => $id) {
        if (!$existe($tabla, $id)) json_out(['ok' => false, 'error' => "Valor inválido en $tabla."], 400);
      }

      $pdo->beginTransaction();
      $stmt = $pdo->prepare('INSERT INTO productos (categoria_id, calidad_id, marca_id, proveedor_id, gramaje_id, dureza_id, cerda_id, tipo_pintura_id, nombre, descripcion, detalle_venta, contenido, cantidad, unidad, precio, stock, imagen, destacado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
      $stmt->execute([$cat, $cal, $marca, $prov, $gram, $dur, $cer, $tp, $nombre, $descripcion, $detalle, $contenido, $cant, $unidad, round((float)$precio, 2), (int)$stock, $imagen, $dest]);
      $nuevoId = (int)$stmt->fetchColumn();
      // Kárdex: carga inicial + foto principal si hay
      $pdo->prepare("INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo) VALUES (?, 'entrada', ?, 0, ?, ?)")
          ->execute([$nuevoId, (int)$stock, (int)$stock, 'Carga inicial (admin ' . $admin['nombre'] . ')']);
      if ($imagen !== '') {
        $pdo->prepare('INSERT INTO producto_imagenes (producto_id, url, es_principal, orden) VALUES (?, ?, 1, 0)')
            ->execute([$nuevoId, $imagen]);
      }
      $pdo->commit();
      json_out(['ok' => true, 'producto_id' => $nuevoId, 'mensaje' => 'Producto #' . $nuevoId . ' creado.']);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      json_out(['ok' => false, 'error' => 'No se pudo crear.'], 500);
    }
  }

  // ---- Actualizar stock/precio existente ----
  $id = (int)($body['id'] ?? 0);
  $stock = $body['stock'] ?? null;
  $precio = $body['precio'] ?? null;
  if ($id <= 0 || !is_numeric($stock) || (int)$stock < 0 || (int)$stock > 9999) {
    json_out(['ok' => false, 'error' => 'Stock inválido (0-9999).'], 400);
  }
  if (!is_numeric($precio) || (float)$precio <= 0 || (float)$precio > 99999) {
    json_out(['ok' => false, 'error' => 'Precio inválido.'], 400);
  }
  try {
    $stmt = $pdo->prepare('SELECT stock FROM productos WHERE id = ?');
    $stmt->execute([$id]);
    $antes = $stmt->fetchColumn();
    if ($antes === false) json_out(['ok' => false, 'error' => 'Producto no existe.'], 404);

    $pdo->beginTransaction();
    $pdo->prepare('UPDATE productos SET stock = ?, precio = ? WHERE id = ?')
        ->execute([(int)$stock, round((float)$precio, 2), $id]);
    if ((int)$stock !== (int)$antes) {
      $pdo->prepare("INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_antes, stock_despues, motivo) VALUES (?, 'ajuste', ?, ?, ?, ?)")
          ->execute([$id, abs((int)$stock - (int)$antes), (int)$antes, (int)$stock, 'Ajuste manual (' . $admin['nombre'] . ')']);
    }
    $pdo->commit();
    json_out(['ok' => true, 'mensaje' => 'Inventario actualizado.']);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_out(['ok' => false, 'error' => 'No se pudo guardar.'], 500);
  }
}

json_out(['ok' => false, 'error' => 'Método no permitido.'], 405);
