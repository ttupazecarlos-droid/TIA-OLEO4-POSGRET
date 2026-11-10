/* ============================================================
   TIA OLEO 4 - LA TRANSACCION PERFECTA (Sesion 7)
   Sandbox propio adaptado de Codigo/Implementado-Sesion-08/pasarela-pago.js
   ------------------------------------------------------------
   Mismo contrato que una pasarela real (Stripe/MercadoPago):
   formulario -> validacion Luhn -> procesamiento -> webhook que
   actualiza el pedido. Diferencia natural del proyecto:
   el "webhook" vive en api/pagar-pedido y actualiza el pedido
   REAL en PostgreSQL (Supabase), no en localStorage.
   Tarjetas de prueba oficiales Stripe:
   4242 4242 4242 4242 exito | 4000 0000 0000 0002 rechazada |
   4000 0000 0000 9995 fondos insuficientes.
   Cualquier otra tarjeta valida por Luhn se trata como exitosa.
   ============================================================ */
const TARJETAS_DE_PRUEBA_baycodec = {
  "4242424242424242": "exito",
  "4000000000000002": "rechazada",
  "4000000000009995": "fondos_insuficientes"
};
const MENSAJES_RECHAZO_baycodec = {
  numero_invalido: "El número de tarjeta no es válido (no pasa Luhn).",
  rechazada: "Tu banco rechazó la operación (tarjeta de prueba).",
  fondos_insuficientes: "Fondos insuficientes (tarjeta de prueba)."
};
function limpiarNumeroTarjeta_baycodec(n) { return String(n || "").replace(/\s+/g, ""); }
function validarLuhn_baycodec(numero) {
  numero = limpiarNumeroTarjeta_baycodec(numero);
  if (!/^\d{13,19}$/.test(numero)) return false;
  let suma = 0, alt = false;
  for (let i = numero.length - 1; i >= 0; i--) {
    let d = parseInt(numero[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    suma += d; alt = !alt;
  }
  return suma % 10 === 0;
}
function iniciarPago_baycodec(datos) {
  const pedidoId = datos.pedidoId, monto = datos.monto;
  const numero = limpiarNumeroTarjeta_baycodec(datos.numeroTarjeta);
  return new Promise(function(resolve) {
    if (!validarLuhn_baycodec(numero)) {
      try { registrarEvento_baycodec("pago_rechazado", { pedidoId, motivo: "numero_invalido" }); } catch (e) {}
      resolve({ exito: false, motivo: "numero_invalido", mensaje: MENSAJES_RECHAZO_baycodec.numero_invalido });
      return;
    }
    // Latencia de red simulada como un cobro real (~1.5s, igual que el original)
    setTimeout(function() {
      fetch("api/pagar-pedido", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido_id: pedidoId, numero_tarjeta: numero })
      }).then(function(r) { return r.json(); }).then(function(d) {
        if (d.exito) {
          // El servidor ya registro pedido_generado en eventos_analitica;
          // aqui solo se registra pago_exitoso para no duplicar el conteo del panel.
          try { registrarEvento_baycodec("pago_exitoso", { pedidoId, monto, transaccionId: d.transaccion_id }); } catch (e) {}
          resolve({ exito: true, transaccionId: d.transaccion_id, pedido: d.pedido });
        } else {
          try { registrarEvento_baycodec("pago_rechazado", { pedidoId, motivo: d.motivo || "rechazada" }); } catch (e) {}
          resolve({ exito: false, motivo: d.motivo, mensaje: d.mensaje });
        }
      }).catch(function() {
        resolve({ exito: false, motivo: "red", mensaje: "No se pudo conectar al servidor." });
      });
    }, 1500);
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { iniciarPago_baycodec, validarLuhn_baycodec, TARJETAS_DE_PRUEBA_baycodec };
}
