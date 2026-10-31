// ============================================================
// EL PUENTE DIGITAL — E-business & E-commerce
// ------------------------------------------------------------
// Este archivo actua como "puente" entre la tienda Tia Óleo 4
// y una API externa de tipo de cambio. Su unica funcion es
// obtener las tasas de cambio del dia (Soles -> otras monedas)
// y devolverlas como un objeto JavaScript.
//
// API utilizada: open.er-api.com (Exchange Rate API - Open Access)
// Documentacion: https://www.exchangerate-api.com/docs/free
//
// No requiere API Key ni autenticacion. Es gratuita y publica.
// La funcion obtenerTasasDeCambio() es llamada por script.js
// cuando el usuario quiere convertir precios a otra moneda.
// ============================================================

// URL de la API: trae las tasas de cambio usando el Sol (PEN) como base
const API_TIPO_CAMBIO = "https://open.er-api.com/v6/latest/PEN";

/**
 * Obtiene las tasas de cambio actuales desde la API externa.
 *
 * Flujo:
 * 1. Hace un fetch (peticion HTTP) a la URL de la API
 * 2. Valida que la respuesta sea exitosa (status 200)
 * 3. Parsea el JSON y verifica que el campo "result" sea "success"
 * 4. Devuelve el objeto "rates" con las tasas de cambio
 *
 * Ejemplo de lo que devuelve:
 * { USD: 0.27, EUR: 0.25, MXN: 5.42, JPY: 40.12, ... }
 *
 * @returns {Promise<Object>} Objeto con codigos de moneda como claves
 *                            y tasas de cambio como valores numericos
 * @throws {Error} Si la API responde con error o no devuelve tasas validas
 */
async function obtenerTasasDeCambio() {
  // Paso 1: Hacer la peticion HTTP a la API
  const respuesta = await fetch(API_TIPO_CAMBIO);

  // Paso 2: Verificar que la respuesta sea exitosa
  if (!respuesta.ok) {
    throw new Error(`La API respondió con error: ${respuesta.status}`);
  }

  // Paso 3: Convertir la respuesta a formato JSON
  const datos = await respuesta.json();

  // Paso 4: Verificar que la API devolvio datos validos
  if (datos.result !== "success") {
    throw new Error("La API no devolvió tasas de cambio válidas.");
  }

  // Paso 5: Devolver solo el objeto con las tasas
  return datos.rates;
}
