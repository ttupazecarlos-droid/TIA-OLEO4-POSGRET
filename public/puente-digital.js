// ============================================================
// EL PUENTE DIGITAL — E-business & E-commerce
// ------------------------------------------------------------
// Este archivo actua como "puente" entre la tienda Tia Óleo 4
// y una API externa de tipo de cambio. Su unica funcion es
// obtener las tasas de cambio del dia (Soles -> otras monedas)
// y devolverlas como un objeto JavaScript.
//
// API principal: Currency-api (fawazahmed0)
//   https://github.com/fawazahmed0/currency-api
//   No requiere API Key. Incluye PEN y 150+ monedas.
//
// API de respaldo: open.er-api.com (Exchange Rate API - Open Access)
//   https://www.exchangerate-api.com/docs/free
//   Se usa solo si la API principal falla.
//
// La funcion obtenerTasasDeCambio() es llamada por script.js
// cuando el usuario quiere convertir precios a otra moneda.
// ============================================================

// API principal: trae las tasas usando el Sol (PEN) como base.
const API_TIPO_CAMBIO =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/pen.json";

// API de respaldo: mismo tipo de tasas con base PEN.
const API_TIPO_CAMBIO_RESPALDO = "https://open.er-api.com/v6/latest/PEN";

/**
 * Normaliza las tasas que devuelve Currency-api.
 * Esa API usa claves en minusculas: { pen: 1, usd: 0.27, mxn: 4.85, ... }.
 *
 * @param {Object} datos Respuesta JSON de Currency-api.
 * @returns {Object} Tasas con codigos en mayusculas y PEN = 1.
 */
function normalizarTasasCurrencyApi(datos) {
  const tasas = datos && datos.pen;
  if (!tasas || typeof tasas !== "object") {
    throw new Error("Currency-api no devolvió tasas válidas.");
  }

  const normalizadas = {};
  for (const [codigo, valor] of Object.entries(tasas)) {
    if (typeof valor === "number" && valor > 0) {
      normalizadas[codigo.toUpperCase()] = valor;
    }
  }

  if (Object.keys(normalizadas).length === 0) {
    throw new Error("Currency-api devolvió una lista de tasas vacía.");
  }

  // La base siempre vale 1 sol.
  normalizadas.PEN = 1;
  return normalizadas;
}

/**
 * Obtiene las tasas de cambio actuales.
 *
 * Flujo:
 * 1. Intenta con Currency-api (principal).
 * 2. Si falla, intenta con open.er-api.com (respaldo).
 * 3. Devuelve un objeto { PEN: 1, USD: 0.27, MXN: 4.85, ... }.
 *
 * @returns {Promise<Object>} Codigos de moneda como claves y tasas como valores.
 * @throws {Error} Si ambas APIs fallan o no devuelven tasas validas.
 */
async function obtenerTasasDeCambio() {
  try {
    const respuesta = await fetch(API_TIPO_CAMBIO);
    if (!respuesta.ok) {
      throw new Error(`Currency-api respondió con error: ${respuesta.status}`);
    }
    const datos = await respuesta.json();
    return normalizarTasasCurrencyApi(datos);
  } catch (errorPrincipal) {
    // Respaldo: open.er-api.com
    try {
      const respuesta = await fetch(API_TIPO_CAMBIO_RESPALDO);
      if (!respuesta.ok) {
        throw new Error(`La API de respaldo respondió con error: ${respuesta.status}`);
      }
      const datos = await respuesta.json();
      if (datos.result !== "success" || !datos.rates) {
        throw new Error("La API de respaldo no devolvió tasas válidas.");
      }
      return datos.rates;
    } catch (errorRespaldo) {
      throw new Error(
        "No se pudieron obtener las tasas de cambio: " +
          errorPrincipal.message +
          " / " +
          errorRespaldo.message
      );
    }
  }
}
