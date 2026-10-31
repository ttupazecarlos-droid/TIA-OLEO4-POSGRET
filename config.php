<?php
// ============================================================
// TIA OLEO 4 - Configuracion central (PostgreSQL / Supabase)
// ------------------------------------------------------------
// La conexion se toma de variables de entorno o del archivo .env
// (ver .env.example). Usa PDO + consultas preparadas.
//
// Produccion (Supabase): usa la cadena "Session pooler" (puerto
// 5432) para que las sentencias preparadas funcionen sin problemas.
// ============================================================

// ------------------------------------------------------------
// 1. Carga sencilla de .env (sin dependencias externas)
// ------------------------------------------------------------
function cargar_env(string $ruta): void
{
    if (!is_file($ruta) || !is_readable($ruta)) {
        return;
    }
    $lineas = file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lineas === false) {
        return;
    }
    foreach ($lineas as $linea) {
        $linea = trim($linea);
        // Quita BOM UTF-8 que algunos editores de Windows agregan al inicio
        $linea = preg_replace('/^\xEF\xBB\xBF/', '', $linea);
        if ($linea === '' || $linea[0] === '#') {
            continue;
        }
        if (strpos($linea, 'export ') === 0) {
            $linea = substr($linea, 7);
        }
        $pos = strpos($linea, '=');
        if ($pos === false) {
            continue;
        }
        $clave = trim(substr($linea, 0, $pos));
        $valor = trim(substr($linea, $pos + 1));
        if ($clave === '') {
            continue;
        }
        $largo = strlen($valor);
        if ($largo >= 2) {
            $primero = $valor[0];
            $ultimo = $valor[$largo - 1];
            if (($primero === '"' && $ultimo === '"') || ($primero === "'" && $ultimo === "'")) {
                $valor = substr($valor, 1, -1);
            }
        }
        // Las variables reales del hosting tienen prioridad sobre .env
        if (getenv($clave) === false && !isset($_ENV[$clave]) && !isset($_SERVER[$clave])) {
            putenv($clave . '=' . $valor);
            $_ENV[$clave] = $valor;
            $_SERVER[$clave] = $valor;
        }
    }
}

cargar_env(__DIR__ . '/.env');

function env_valor(string $clave, string $porDefecto = ''): string
{
    $valor = getenv($clave);
    if ($valor === false) {
        // Algunos hostings solo exponen las variables en $_ENV/$_SERVER.
        $valor = $_ENV[$clave] ?? $_SERVER[$clave] ?? false;
    }
    return $valor === false ? $porDefecto : (string)$valor;
}

// ------------------------------------------------------------
// 2. Constantes de la aplicacion
// ------------------------------------------------------------
define('APP_ENV', env_valor('APP_ENV', 'local'));
define('APP_DEBUG', filter_var(
    env_valor('APP_DEBUG', APP_ENV === 'production' ? '0' : '1'),
    FILTER_VALIDATE_BOOLEAN
));

define('DB_HOST', env_valor('DB_HOST', '127.0.0.1'));
define('DB_PORT', env_valor('DB_PORT', '5432'));
define('DB_NAME', env_valor('DB_NAME', 'tia_oleo4'));
define('DB_USER', env_valor('DB_USER', 'postgres'));
define('DB_PASS', env_valor('DB_PASS', 'postgres'));
define('DB_SSLMODE', env_valor('DB_SSLMODE', 'prefer'));

define('SESSION_DRIVER', strtolower(env_valor('SESSION_DRIVER', 'db')));

// ------------------------------------------------------------
// 3. Conexion PDO a PostgreSQL
// ------------------------------------------------------------
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'pgsql:host=' . DB_HOST
        . ';port=' . DB_PORT
        . ';dbname=' . DB_NAME
        . ';sslmode=' . DB_SSLMODE;

    $opts = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ];

    $pdo = new PDO($dsn, DB_USER, DB_PASS, $opts);
    // Supabase guarda timestamptz; trabajamos siempre en UTC.
    $pdo->exec("SET TIME ZONE 'UTC'");
    return $pdo;
}

// ------------------------------------------------------------
// 4. Respuesta JSON estandar
// ------------------------------------------------------------
function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ------------------------------------------------------------
// 5. Sesiones persistentes en PostgreSQL
//    (sobreviven a reinicios/redeploys del hosting)
// ------------------------------------------------------------
class SesionPostgres implements SessionHandlerInterface
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function open(string $path, string $name): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        try {
            $vida = (int)ini_get('session.gc_maxlifetime');
            $stmt = $this->pdo->prepare('SELECT data FROM sesiones WHERE id = ? AND last_activity >= ?');
            $stmt->execute([$id, time() - $vida]);
            $data = $stmt->fetchColumn();
            $this->pdo->prepare('UPDATE sesiones SET last_activity = ? WHERE id = ?')
                ->execute([time(), $id]);
            return $data === false ? '' : (string)$data;
        } catch (Throwable $e) {
            return '';
        }
    }

    public function write(string $id, string $data): bool
    {
        try {
            $this->pdo->prepare(
                'INSERT INTO sesiones (id, data, last_activity) VALUES (?, ?, ?)
                 ON CONFLICT (id) DO UPDATE
                 SET data = EXCLUDED.data, last_activity = EXCLUDED.last_activity'
            )->execute([$id, $data, time()]);
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    public function destroy(string $id): bool
    {
        try {
            $this->pdo->prepare('DELETE FROM sesiones WHERE id = ?')->execute([$id]);
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    public function gc(int $max_lifetime): int|false
    {
        try {
            $stmt = $this->pdo->prepare('DELETE FROM sesiones WHERE last_activity < ?');
            $stmt->execute([time() - $max_lifetime]);
            return $stmt->rowCount();
        } catch (Throwable $e) {
            return false;
        }
    }
}

function iniciar_sesion(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    if (SESSION_DRIVER === 'db') {
        try {
            session_set_save_handler(new SesionPostgres(db()), true);
        } catch (Throwable $e) {
            // Si la BD no responde, PHP usara sesiones de archivo.
        }
    }

    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443');

    $segura = env_valor('SESSION_SECURE', $https ? '1' : '0') === '1';

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    session_name(env_valor('SESSION_NAME', 'tiaoleo_sess'));
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $segura,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}
