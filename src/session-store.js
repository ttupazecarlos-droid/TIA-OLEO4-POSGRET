import session from 'express-session';
import { pool } from './db.js';

/**
 * Guarda las sesiones en la tabla PostgreSQL "sesiones" que ya usa
 * el esquema del proyecto (id, data, last_activity). El contenido se
 * serializa como JSON porque ahora el backend es Node.js.
 */
export class PgSessionStore extends session.Store {
  constructor({ ttlSegundos = 86400 } = {}) {
    super();
    this.ttl = ttlSegundos;

    this.gcTimer = setInterval(() => {
      this.gc().catch(() => {});
    }, 15 * 60 * 1000);
    this.gcTimer.unref?.();
  }

  async get(sid, callback) {
    try {
      const limite = Math.floor(Date.now() / 1000) - this.ttl;
      const { rows } = await pool.query(
        'SELECT data FROM sesiones WHERE id = $1 AND last_activity >= $2',
        [sid, limite]
      );
      if (!rows.length) {
        callback(null, null);
        return;
      }

      // Mantiene viva la sesión mientras el usuario navega.
      await pool.query(
        'UPDATE sesiones SET last_activity = $1 WHERE id = $2',
        [Math.floor(Date.now() / 1000), sid]
      );

      try {
        callback(null, JSON.parse(rows[0].data));
      } catch {
        await pool.query('DELETE FROM sesiones WHERE id = $1', [sid]);
        callback(null, null);
      }
    } catch (error) {
      callback(error);
    }
  }

  async set(sid, sesion, callback) {
    try {
      const ahora = Math.floor(Date.now() / 1000);
      await pool.query(
        `INSERT INTO sesiones (id, data, last_activity)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, last_activity = EXCLUDED.last_activity`,
        [sid, JSON.stringify(sesion), ahora]
      );
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  async destroy(sid, callback) {
    try {
      await pool.query('DELETE FROM sesiones WHERE id = $1', [sid]);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  async touch(sid, sesion, callback) {
    try {
      await pool.query(
        'UPDATE sesiones SET last_activity = $1 WHERE id = $2',
        [Math.floor(Date.now() / 1000), sid]
      );
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  async gc() {
    const limite = Math.floor(Date.now() / 1000) - this.ttl;
    await pool.query('DELETE FROM sesiones WHERE last_activity < $1', [limite]);
  }
}
