<?php
// ============================================================
// API GET /api/productos.php
// Lee el catalogo desde PostgreSQL (Supabase). Solo acepta GET.
// Filtros: ?categoria=papeles&calidad=2&marca=1&buscar=acuarela
// Cada producto trae marca, calidad, categoria e imagenes[] (1:N).
// ============================================================
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  json_out(['ok' => false, 'error' => 'Solo se permite GET en este endpoint.'], 405);
}

try {
  $pdo = db();

  $where = ['p.activo = 1'];
  $params = [];

  // Filtro por categoria (slug): papeles, cuadernos, pinturas, pinceles, lapices
  if (!empty($_GET['categoria'])) {
    $where[] = 'c.slug = LOWER(:cat)';
    $params[':cat'] = trim($_GET['categoria']);
  }

  // Filtro por calidad: 1=Escolar 2=Artistica 3=Profesional
  if (!empty($_GET['calidad'])) {
    $where[] = 'p.calidad_id = :cal';
    $params[':cal'] = (int)$_GET['calidad'];
  }

  // Filtro por marca (?marca=2)
  if (!empty($_GET['marca'])) {
    $where[] = 'p.marca_id = :mar';
    $params[':mar'] = (int)$_GET['marca'];
  }

  // Buscador (nombre + descripcion + detalle de venta + marca)
  // ILIKE = busqueda sin distinguir mayusculas/minusculas en PostgreSQL.
  if (!empty($_GET['buscar'])) {
    $where[] = '(p.nombre ILIKE :q1 OR p.descripcion ILIKE :q2 OR p.detalle_venta ILIKE :q3)';
    $params[':q1'] = '%' . trim($_GET['buscar']) . '%';
    $params[':q2'] = '%' . trim($_GET['buscar']) . '%';
    $params[':q3'] = '%' . trim($_GET['buscar']) . '%';
  }

  $sql = "SELECT p.id, p.nombre, p.descripcion, p.detalle_venta, p.contenido,
                 p.cantidad, p.unidad, p.precio, p.stock, p.imagen, p.destacado,
                 c.slug AS categoria_slug, c.nombre AS categoria,
                 k.id AS calidad_id, k.nombre AS calidad, k.descripcion AS calidad_desc, k.color AS calidad_color,
                 m.nombre AS marca,
                 g.valor AS gramaje, d.codigo AS dureza, tc.nombre AS cerda, tp.nombre AS tipo_pintura
          FROM productos p
          JOIN categorias c ON c.id = p.categoria_id
          JOIN calidades k ON k.id = p.calidad_id
          LEFT JOIN marcas m ON m.id = p.marca_id
          LEFT JOIN gramajes g ON g.id = p.gramaje_id
          LEFT JOIN durezas d ON d.id = p.dureza_id
          LEFT JOIN tipos_cerda tc ON tc.id = p.cerda_id
          LEFT JOIN tipos_pintura tp ON tp.id = p.tipo_pintura_id
          WHERE " . implode(' AND ', $where) . "
          ORDER BY c.id, p.id";

  $stmt = $pdo->prepare($sql);   // consulta preparada: evita inyeccion SQL
  $stmt->execute($params);
  $items = $stmt->fetchAll();

  // Imagenes 1:N (escalable: mañana agregas mas fotos sin tocar codigo)
  $imgStmt = $pdo->query('SELECT producto_id, url FROM producto_imagenes ORDER BY producto_id, es_principal DESC, orden');
  $imgMap = [];
  foreach ($imgStmt->fetchAll() as $row) {
    $imgMap[(int)$row['producto_id']][] = $row['url'];
  }

  // Resenas: promedio + conteo + recientes (para la ficha del producto)
  $promMap = [];
  foreach ($pdo->query('SELECT producto_id, AVG(puntaje) AS prom, COUNT(*) AS n FROM resenas GROUP BY producto_id')->fetchAll() as $row) {
    $promMap[(int)$row['producto_id']] = ['promedio' => round((float)$row['prom'], 1), 'n' => (int)$row['n']];
  }
  $resMap = [];
  foreach ($pdo->query('SELECT producto_id, cliente_nombre, puntaje, comentario FROM resenas ORDER BY creado_en DESC LIMIT 60')->fetchAll() as $row) {
    $resMap[(int)$row['producto_id']][] = ['cliente_nombre' => $row['cliente_nombre'], 'puntaje' => (int)$row['puntaje'], 'comentario' => $row['comentario']];
  }

  foreach ($items as &$it) {
    $it['id'] = (int)$it['id'];
    $it['calidad_id'] = (int)$it['calidad_id'];
    $it['destacado'] = (int)$it['destacado'];
    $it['precio'] = (float)$it['precio'];
    $it['stock'] = (int)$it['stock'];
    $it['cantidad'] = (int)$it['cantidad'];
    $it['gramaje'] = $it['gramaje'] !== null ? (int)$it['gramaje'] : null;
    $it['imagenes'] = $imgMap[(int)$it['id']] ?? [$it['imagen']];
    $pid = (int)$it['id'];
    $it['promedio'] = $promMap[$pid]['promedio'] ?? 0;
    $it['nresenas'] = $promMap[$pid]['n'] ?? 0;
    $it['resenas'] = $resMap[$pid] ?? [];
  }
  unset($it);

  // Listas para filtros del frontend (crecen solas al agregar datos)
  $calidades = $pdo->query('SELECT id, nombre, descripcion FROM calidades ORDER BY nivel')->fetchAll();
  $marcas = $pdo->query('SELECT id, nombre FROM marcas ORDER BY nombre')->fetchAll();

  json_out(['ok' => true, 'total' => count($items), 'calidades' => $calidades, 'marcas' => $marcas, 'productos' => $items]);
} catch (Throwable $e) {
  $error = ['ok' => false, 'error' => 'Sin conexion a la base de datos PostgreSQL. Revisa la configuracion de Supabase e importa database.sql.'];
  if (APP_DEBUG) $error['detalle'] = $e->getMessage();
  json_out($error, 500);
}
