import express from 'express';
import session from 'express-session';
import multer from 'multer';
import {
  APP_DEBUG,
  APP_ENV,
  PORT,
  PUBLIC_DIR,
  SESSION_MAX_AGE,
  SESSION_NAME,
  SESSION_SECRET,
  SESSION_SECURE
} from './src/env.js';
import { pool, query } from './src/db.js';
import { PgSessionStore } from './src/session-store.js';
import authRoutes from './src/routes/auth.js';
import catalogRoutes from './src/routes/catalog.js';
import paymentRoutes from './src/routes/payment.js';
import adminRoutes from './src/routes/admin.js';
import analyticsRoutes from './src/routes/analytics.js';
import { asyncHandler } from './src/utils.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: SESSION_NAME,
    secret: SESSION_SECRET,
    store: new PgSessionStore({ ttlSegundos: Math.floor(SESSION_MAX_AGE / 1000) }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: SESSION_SECURE,
      maxAge: SESSION_MAX_AGE,
      path: '/'
    }
  })
);

// Compatibilidad con las rutas .php que usaba la version anterior.
// El backend es 100% Node.js: estas URLs solo se reescriben internamente.
const aliasPhp = new Map([
  ['/api/health.php', '/api/health'],
  ['/api/sesion.php', '/api/sesion'],
  ['/api/login.php', '/api/login'],
  ['/api/logout.php', '/api/logout'],
  ['/api/cuenta.php', '/api/cuenta'],
  ['/api/registro-cliente.php', '/api/registro-cliente'],
  ['/api/login-cliente.php', '/api/login-cliente'],
  ['/api/mis-pedidos.php', '/api/mis-pedidos'],
  ['/api/productos.php', '/api/productos'],
  ['/api/pedido.php', '/api/pedido'],
  ['/api/chatbot.php', '/api/chatbot'],
  ['/api/pagar-pedido.php', '/api/pagar-pedido'],
  ['/api/admin-productos.php', '/api/admin-productos'],
  ['/api/admin-pedidos.php', '/api/admin-pedidos'],
  ['/api/admin-cotizaciones.php', '/api/admin-cotizaciones'],
  ['/api/admin-imagen.php', '/api/admin-imagen'],
  ['/registrar-evento.php', '/api/eventos'],
  ['/obtener-analitica.php', '/api/analitica'],
  ['/obtener-pedidos.php', '/api/pedidos'],
  ['/reiniciar-analitica.php', '/api/analitica/reiniciar']
]);

app.use((req, res, next) => {
  const destino = aliasPhp.get(req.path);
  if (destino) {
    const queryString = req.url.includes('?')
      ? req.url.slice(req.url.indexOf('?'))
      : '';
    req.url = destino + queryString;
  }
  next();
});

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'postgresql', entorno: APP_ENV });
    } catch (error) {
      const salida = { ok: false, db: 'error' };
      if (APP_DEBUG) salida.detalle = error.message;
      res.status(503).json(salida);
    }
  })
);

app.use('/api', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api', paymentRoutes);
app.use('/api', adminRoutes);
app.use('/api', analyticsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint no encontrado.' });
});

// Archivos estaticos: HTML, CSS, JS, imagenes de public/
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    maxAge: APP_ENV === 'production' ? '1h' : 0
  })
);

app.use((req, res) => {
  res.status(404).send('No encontrado');
});

// Manejo central de errores (incluye subidas demasiado grandes).
app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      ok: false,
      error:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'La foto debe pesar hasta 2 MB.'
          : 'Archivo inválido.'
    });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ ok: false, error: 'Cuerpo JSON inválido.' });
    return;
  }

  console.error('[server]', error);
  const salida = { ok: false, error: 'Error interno del servidor.' };
  if (APP_DEBUG) salida.detalle = error.message;
  res.status(500).json(salida);
});

const server = app.listen(PORT, () => {
  console.log(`TIA OLEO 4 - Node.js escuchando en http://localhost:${PORT}`);
  console.log(`Entorno: ${APP_ENV}` + (APP_DEBUG ? ' (debug activo)' : ''));
});

async function apagar() {
  console.log('Cerrando servidor...');
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
