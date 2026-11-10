import pg from 'pg';
import { env } from './env.js';

const { Pool, types } = pg;

// PostgreSQL devuelve NUMERIC como texto; la app trabaja con numeros.
types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

const sslmode = env('DB_SSLMODE', 'prefer').toLowerCase();
let ssl = false;
if (sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
  ssl = { rejectUnauthorized: sslmode === 'verify-full' };
}

export const pool = new Pool({
  host: env('DB_HOST', '127.0.0.1'),
  port: Number(env('DB_PORT', '5432')),
  database: env('DB_NAME', 'tia_oleo4'),
  user: env('DB_USER', 'postgres'),
  password: env('DB_PASS', 'postgres'),
  ssl,
  max: Number(env('DB_POOL_MAX', '10')),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('[db] Error en conexion inactiva:', error.message);
});

export function query(texto, params = []) {
  return pool.query(texto, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexion pudo haberse cerrado; se propaga el error original.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function cerrarPool() {
  await pool.end();
}
