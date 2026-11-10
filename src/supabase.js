import { env } from './env.js';

/**
 * Supabase cambio sus claves en noviembre de 2025:
 *  - publishable: sb_publishable_...  (reemplaza a "anon")
 *  - secret:      sb_secret_...       (reemplaza a "service_role")
 *
 * Se acepta el nombre nuevo (SUPABASE_SECRET_KEY) y los antiguos
 * (SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY) para no romper
 * proyectos que todavia usan las claves JWT largas.
 */
function claveSupabase() {
  return (
    env('SUPABASE_SECRET_KEY') ||
    env('SUPABASE_SERVICE_KEY') ||
    env('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export function supabaseConfigurado() {
  return env('SUPABASE_URL') !== '' && claveSupabase() !== '';
}

function urlBase() {
  return env('SUPABASE_URL').replace(/\/+$/, '');
}

function bucket() {
  return env('SUPABASE_BUCKET', 'productos').replace(/^\/+|\/+$/g, '');
}

export function supabaseUrlPublica(nombre) {
  return (
    urlBase() +
    '/storage/v1/object/public/' +
    encodeURIComponent(bucket()) +
    '/' +
    encodeURIComponent(nombre)
  );
}

async function solicitud(metodo, ruta, cuerpo = null, cabeceras = {}) {
  const key = claveSupabase();
  const cabecerasClave = { apikey: key };

  // Las claves nuevas sb_secret_... no son JWT. Si se mandan tambien
  // en "Authorization: Bearer", Supabase intenta validarlas como JWT
  // y responde "Invalid JWT". Las claves legacy si lo necesitan.
  if (!key.startsWith('sb_')) {
    cabecerasClave.Authorization = 'Bearer ' + key;
  }

  const respuesta = await fetch(urlBase() + ruta, {
    method: metodo,
    headers: {
      ...cabecerasClave,
      ...cabeceras
    },
    body: cuerpo,
    signal: AbortSignal.timeout(45000)
  });

  const texto = await respuesta.text();
  if (!respuesta.ok) {
    throw new Error(
      'Supabase Storage respondio HTTP ' +
        respuesta.status +
        ': ' +
        texto.slice(0, 300)
    );
  }
  return texto;
}

export async function supabaseSubir(buffer, nombre, mime) {
  await solicitud(
    'POST',
    '/storage/v1/object/' +
      encodeURIComponent(bucket()) +
      '/' +
      encodeURIComponent(nombre),
    buffer,
    {
      'Content-Type': mime,
      'x-upsert': 'true',
      'Cache-Control': 'no-cache'
    }
  );
  return supabaseUrlPublica(nombre);
}

export async function supabaseEliminarUrl(url) {
  if (!supabaseConfigurado()) return false;

  const prefijo =
    urlBase() +
    '/storage/v1/object/public/' +
    encodeURIComponent(bucket()) +
    '/';

  if (!String(url).startsWith(prefijo)) return false;

  const nombre = decodeURIComponent(String(url).slice(prefijo.length));
  if (!nombre || nombre.includes('..')) return false;

  try {
    await solicitud(
      'DELETE',
      '/storage/v1/object/' +
        encodeURIComponent(bucket()) +
        '/' +
        encodeURIComponent(nombre)
    );
    return true;
  } catch {
    return false;
  }
}
