<?php
// TIA OLEO 4 - Agregado para panel-control.html (solo admin)
// Lee eventos reales de PostgreSQL (tabla eventos_analitica).
require_once __DIR__ . '/api/admin-auth.php';
requerir_admin();
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = db();

    $eventos = $pdo->query("SELECT id, tipo_evento, datos_json, pagina, to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS creado_en FROM eventos_analitica ORDER BY id ASC")->fetchAll();

    $visitas = 0; $wsp = 0; $precios = 0; $busq = 0; $pedidos = 0; $valor = 0.0;
    $top = []; $pregChat = 0; $resChat = 0;

    foreach ($eventos as $e) {
        $d = json_decode($e['datos_json'], true) ?: [];
        switch ($e['tipo_evento']) {
            case 'visita':
                $visitas++;
                break;
            case 'clic_whatsapp':
                $wsp++;
                $n = trim($d['producto'] ?? 'Consulta general');
                if (strpos($n, 'ADD:') === 0) $n = trim(substr($n, 4));
                if ($n === '') $n = 'Consulta general';
                $top[$n] = ($top[$n] ?? 0) + 1;
                break;
            case 'clic_precios_internacionales':
                $precios++;
                break;
            case 'busqueda_catalogo':
                $busq++;
                break;
            case 'chatbot_pregunta':
                $pregChat++;
                if (($d['tipoRespuesta'] ?? '') !== 'sin_respuesta') $resChat++;
                break;
        }
    }

    // Chatbot: la tabla chatbot_consultas es la fuente real
    try {
        $tChat = $pdo->query(
            "SELECT COUNT(*) AS t,
                    SUM(CASE WHEN palabra_clave = 'sin-coincidencia' THEN 1 ELSE 0 END) AS s
               FROM chatbot_consultas"
        )->fetch();
        $tTot = (int)($tChat['t'] ?? 0);
        if ($tTot > 0) {
            $pregChat = $tTot;
            $resChat = $tTot - (int)($tChat['s'] ?? 0);
        }
    } catch (Throwable $e) {}

    // Pedidos y valor: siempre de la tabla real pedidos
    try {
        $reales = $pdo->query('SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS s FROM pedidos')->fetch();
        $pedidos = (int)$reales['n'];
        $valor = (float)$reales['s'];
    } catch (Throwable $e) {}

    $interes = $wsp + $precios;
    arsort($top);
    $rec = array_slice(array_reverse($eventos), 0, 20);
    $rec = array_map(function ($e) {
        return [
            'id' => (int)$e['id'],
            'tipo' => $e['tipo_evento'],
            'detalle' => json_decode($e['datos_json'], true) ?: [],
            'pagina' => $e['pagina'],
            'fecha' => $e['creado_en'],
        ];
    }, $rec);

    json_out([
        'ok' => true,
        'totalVisitas' => $visitas,
        'totalClicsWhatsApp' => $wsp,
        'clicsPrecios' => $precios,
        'busquedas' => $busq,
        'totalPedidos' => $pedidos,
        'valorTotalPedidos' => round($valor, 2),
        'productosConMasInteres' => $top,
        'tasaConversion' => round($interes > 0 ? ($pedidos / $interes) * 100 : 0, 1),
        'preguntasChatbot' => $pregChat,
        'tasaResolucionChatbot' => round($pregChat > 0 ? ($resChat / $pregChat) * 100 : 0, 1),
        'eventosRecientes' => $rec,
        'totalEventos' => count($eventos),
    ]);
} catch (Throwable $e) {
    $error = ['ok' => false, 'mensaje' => 'Error de BD.'];
    if (APP_DEBUG) $error['detalle'] = $e->getMessage();
    json_out($error, 500);
}
