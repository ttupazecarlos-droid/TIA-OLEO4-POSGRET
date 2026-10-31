<?php
// ============================================================
// TIA OLEO 4 - Supabase Storage (opcional)
// ------------------------------------------------------------
// Si defines SUPABASE_URL + SUPABASE_SERVICE_KEY, las fotos que
// sube el admin se guardan en un bucket publico de Supabase y en
// la BD se guarda la URL publica. Si no, se usa la carpeta img/.
//
// Variables:
//   SUPABASE_URL=https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role o sb_secret_...>
//   SUPABASE_BUCKET=productos
//
// IMPORTANTE: la service key es secreta. Solo se usa en el
// servidor (nunca en HTML/JS).
// ============================================================

function supabase_configurado(): bool
{
    return env_valor('SUPABASE_URL') !== '' && env_valor('SUPABASE_SERVICE_KEY') !== '';
}

function supabase_url_base(): string
{
    return rtrim(env_valor('SUPABASE_URL'), '/');
}

function supabase_bucket(): string
{
    return trim(env_valor('SUPABASE_BUCKET', 'productos'), '/');
}

function supabase_storage_url_publica(string $nombre): string
{
    return supabase_url_base()
        . '/storage/v1/object/public/'
        . rawurlencode(supabase_bucket()) . '/'
        . rawurlencode($nombre);
}

/**
 * Ejecuta una peticion HTTP contra la API de Storage.
 * @throws RuntimeException si falla la conexion o la respuesta no es 2xx
 */
function supabase_storage_solicitud(string $metodo, string $ruta, ?string $cuerpo = null, array $cabeceras = []): string
{
    $key = env_valor('SUPABASE_SERVICE_KEY');
    $url = supabase_url_base() . $ruta;

    $http = array_merge([
        'Authorization: Bearer ' . $key,
        'apikey: ' . $key,
    ], $cabeceras);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_HTTPHEADER     => $http,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 45,
    ]);
    if ($cuerpo !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
    }

    $respuesta = curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($respuesta === false) {
        throw new RuntimeException('No se pudo conectar con Supabase Storage: ' . $error);
    }
    if ($codigo < 200 || $codigo >= 300) {
        throw new RuntimeException('Supabase Storage respondio HTTP ' . $codigo . ': ' . substr((string)$respuesta, 0, 300));
    }
    return (string)$respuesta;
}

/**
 * Sube un archivo local al bucket configurado.
 * @return string URL publica del objeto
 */
function supabase_storage_subir(string $archivo, string $nombre, string $mime): string
{
    $contenido = file_get_contents($archivo);
    if ($contenido === false) {
        throw new RuntimeException('No se pudo leer la foto temporal.');
    }

    supabase_storage_solicitud(
        'POST',
        '/storage/v1/object/' . rawurlencode(supabase_bucket()) . '/' . rawurlencode($nombre),
        $contenido,
        [
            'Content-Type: ' . $mime,
            'x-upsert: true',
            'Cache-Control: no-cache',
        ]
    );

    return supabase_storage_url_publica($nombre);
}

/**
 * Borra un objeto a partir de su URL publica de Supabase.
 * Devuelve false si la URL no pertenece al bucket configurado.
 */
function supabase_storage_eliminar_url(string $url): bool
{
    if (!supabase_configurado()) {
        return false;
    }

    $prefijo = supabase_url_base()
        . '/storage/v1/object/public/'
        . rawurlencode(supabase_bucket()) . '/';

    if (strpos($url, $prefijo) !== 0) {
        return false;
    }

    $nombre = rawurldecode(substr($url, strlen($prefijo)));
    if ($nombre === '' || strpos($nombre, '..') !== false) {
        return false;
    }

    try {
        supabase_storage_solicitud(
            'DELETE',
            '/storage/v1/object/' . rawurlencode(supabase_bucket()) . '/' . rawurlencode($nombre)
        );
        return true;
    } catch (Throwable $e) {
        return false;
    }
}
