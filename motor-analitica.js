/* TIA OLEO 4 - LA TIENDA QUE OBSERVA (Sesion 5) - adaptado de Implementado-Sesion-08/motor-analitica.js
   Vincula index.html (rastreo) con panel-control.html (lectura).
   Guarda en localStorage (tiaoleo-s5-eventos) + servidor (registrar-evento.php -> tabla eventos_analitica).
   Mantiene nombres _baycodec para compatibilidad total con panel-control.html original. */
const ANALITICA_CLAVE_baycodec = "tiaoleo-s5-eventos";

function obtenerEventos_baycodec() {
  try { return JSON.parse(localStorage.getItem(ANALITICA_CLAVE_baycodec) || "[]"); }
  catch (e) { return []; }
}
function registrarEvento_baycodec(tipo, detalle) {
  detalle = detalle || {};
  const eventos = obtenerEventos_baycodec();
  eventos.push({ id: eventos.length + 1, tipo, detalle,
    pagina: (location.pathname.split("/").pop() || "index.html"),
    fecha: new Date().toISOString() });
  localStorage.setItem(ANALITICA_CLAVE_baycodec, JSON.stringify(eventos));
  try {
    fetch("registrar-evento.php", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo_evento: tipo, datos: detalle,
        pagina: location.pathname.split("/").pop() || "index.html" })
    }).catch(function(){});
  } catch (e) {}
}
function trackVisita_baycodec() { registrarEvento_baycodec("visita", {}); }
function reiniciarAnalitica_baycodec() { localStorage.removeItem(ANALITICA_CLAVE_baycodec); }
function calcularResumen_baycodec() {
  const eventos = obtenerEventos_baycodec();
  const wsp = eventos.filter(function(e){ return e.tipo === "clic_whatsapp"; });
  const precios = eventos.filter(function(e){ return e.tipo === "clic_precios_internacionales"; }).length;
  const busq = eventos.filter(function(e){ return e.tipo === "busqueda_catalogo"; }).length;
  const peds = eventos.filter(function(e){ return e.tipo === "pedido_generado"; });
  const top = {};
  wsp.forEach(function(e){ const n = e.detalle.producto || "Consulta general"; top[n] = (top[n] || 0) + 1; });
  const valor = peds.reduce(function(a, e){ return a + (e.detalle.total || 0); }, 0);
  const interes = wsp.length + precios;
  return { totalVisitas: eventos.filter(function(e){ return e.tipo === "visita"; }).length,
    totalClicsWhatsApp: wsp.length, clicsPrecios: precios, busquedas: busq,
    totalPedidos: peds.length, valorTotalPedidos: valor,
    productosConMasInteres: top, tasaConversion: interes > 0 ? (peds.length / interes) * 100 : 0, eventos };
}
// Aliases sin sufijo para TIA-OLEO4
var registrarEvento = registrarEvento_baycodec;

/* --- Vinculacion automatica con las funciones reales de la tienda --- */
(function vincularAnalitica() {
  function envolver(nombre, fn) {
    try {
      const orig = window[nombre];
      if (typeof orig !== "function" || orig.__conAnalitica) return;
      const w = function() { try { return fn.apply(this, [orig].concat([].slice.call(arguments))); } catch (e) { return orig.apply(this, arguments); } };
      w.__conAnalitica = true;
      window[nombre] = w;
    } catch (e) {}
  }
  // 1. Visita (page view)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", trackVisita_baycodec);
  else trackVisita_baycodec();

  // 2. Busquedas del catalogo (debounce propio para no duplicar)
  let tBus = null;
  document.addEventListener("DOMContentLoaded", function() {
    const inp = document.getElementById("inputBusqueda");
    if (inp && !inp.__conAnalitica) {
      inp.__conAnalitica = true;
      inp.addEventListener("input", function() {
        clearTimeout(tBus);
        const q = inp.value.trim();
        tBus = setTimeout(function() {
          if (q.length >= 2) registrarEvento_baycodec("busqueda_catalogo", { texto: q.slice(0, 80) });
        }, 800);
      });
    }
  });

  // 3. Envoltorios (se aplican cuando script.js/tienda.js ya cargaron)
  function aplicarEnvoltorios() {
    envolver("enviarWhatsApp", function(orig, ev, nombre) {
      registrarEvento_baycodec("clic_whatsapp", { producto: nombre || "Consulta general" });
      return orig.apply(this, [].slice.call(arguments, 1));
    });
    envolver("solicitarCotizacionMayorista", function(orig, ev) {
      registrarEvento_baycodec("clic_whatsapp", { producto: "Cotizacion por mayor" });
      return orig.apply(this, [].slice.call(arguments, 1));
    });
    envolver("elegirMoneda", function(orig, codigo) {
      if (codigo && codigo !== "PEN") registrarEvento_baycodec("clic_precios_internacionales", { moneda: codigo });
      return orig.apply(this, [].slice.call(arguments, 1));
    });
    envolver("agregarAlCarrito", function(orig, id) {
      try {
        const p = (typeof catalogoProductos !== "undefined" ? catalogoProductos : []).find(function(x){ return x.id === Number(id); });
        registrarEvento_baycodec("clic_whatsapp", { producto: p ? p.nombre : ("id " + id), accion: "add_carrito" });
      } catch (e) {}
      return orig.apply(this, [].slice.call(arguments, 1));
    });
    // Sin envoltorio de confirmarPedido/pagar: el panel cuenta pedidos desde la tabla real pedidos,
    // no desde eventos (evita duplicar cada clic fallido o cada reintento).
    envolver("pedirPorWhatsApp", function(orig) {
      registrarEvento_baycodec("clic_whatsapp", { producto: "Carrito por WhatsApp" });
      return orig.apply(this, [].slice.call(arguments, 1));
    });
    envolver("registrarChatbot", function(orig, clave, mensaje) {
      registrarEvento_baycodec("chatbot_pregunta", { palabra: clave, tipoRespuesta: clave === "sin-coincidencia" ? "sin_respuesta" : "ok" });
      return orig.apply(this, [].slice.call(arguments, 1));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(aplicarEnvoltorios, 300); });
  else setTimeout(aplicarEnvoltorios, 300);
  setTimeout(aplicarEnvoltorios, 1500); // reintento por si tienda.js tarda
})();
