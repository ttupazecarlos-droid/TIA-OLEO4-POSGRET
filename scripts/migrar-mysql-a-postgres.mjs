// ============================================================
// Migra los datos de la version MySQL/MariaDB a PostgreSQL.
//
// Uso:
//   npm run db:migrate
//
// Variables (por defecto, las de XAMPP):
//   MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 MYSQL_DB=tia_oleo4
//   MYSQL_USER=root    MYSQL_PASS=
//
// Reemplaza las tablas de datos de PostgreSQL. Conserva IDs y fechas,
// actualiza el stock y reinicia las secuencias.
// ============================================================
import mysql from 'mysql2/promise';
import { pool } from '../src/db.js';
import { env } from '../src/env.js';

const TABLAS = [
  'roles',
  'usuarios',
  'calidades',
  'categorias',
  'marcas',
  'proveedores',
  'gramajes',
  'durezas',
  'tipos_cerda',
  'tipos_pintura',
  'productos',
  'producto_imagenes',
  'pedidos',
  'pedido_items',
  'pedido_historial',
  'pagos',
  'inventario_movimientos',
  'cotizaciones',
  'cotizacion_items',
  'resenas',
  'chatbot_consultas',
  'config_tienda',
  'eventos_analitica'
];

function identificar(nombre, comilla) {
  return comilla + nombre.replaceAll(comilla, comilla + comilla) + comilla;
}

async function columnasMysql(conn, base, tabla) {
  const [filas] = await conn.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position`,
    [base, tabla]
  );
  return filas.map((f) => String(f.column_name ?? f.COLUMN_NAME).toLowerCase());
}

async function columnasPostgres(cliente, tabla) {
  const { rows } = await cliente.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tabla]
  );
  return rows.map((f) => f.column_name.toLowerCase());
}

const myHost = env('MYSQL_HOST', '127.0.0.1');
const myPort = Number(env('MYSQL_PORT', '3306'));
const myDb = env('MYSQL_DB', 'tia_oleo4');
const myUser = env('MYSQL_USER', 'root');
const myPass = env('MYSQL_PASS', '');

let mysqlConn;
let pgClient;

try {
  mysqlConn = await mysql.createConnection({
    host: myHost,
    port: myPort,
    database: myDb,
    user: myUser,
    password: myPass,
    charset: 'utf8mb4',
    dateStrings: true
  });
  pgClient = await pool.connect();
} catch (error) {
  console.error('No se pudo conectar:', error.message);
  process.exit(1);
}

try {
  const [tzRows] = await mysqlConn.query('SELECT @@system_time_zone AS tz');
  let zona = String(tzRows[0]?.tz ?? 'UTC').trim();
  if (!zona || zona.toUpperCase() === 'SYSTEM') zona = 'UTC';

  await pgClient.query("SELECT set_config('TimeZone', $1, false)", [zona]);

  console.log(`Origen : MySQL ${myHost}:${myPort}/${myDb}`);
  console.log(
    `Destino: PostgreSQL ${env('DB_HOST')}:${env('DB_PORT')}/${env('DB_NAME')}`
  );
  console.log(`Zona horaria de las fechas: ${zona}\n`);

  await pgClient.query('BEGIN');

  const lista = TABLAS.map((t) => identificar(t, '"')).join(', ');
  await pgClient.query(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
  await pgClient.query('TRUNCATE TABLE "sesiones"');

  for (const tabla of TABLAS) {
    const colsMy = await columnasMysql(mysqlConn, myDb, tabla);
    let colsPg = await columnasPostgres(pgClient, tabla);

    if (!colsMy.length || !colsPg.length) {
      throw new Error(`La tabla ${tabla} no existe en origen o destino.`);
    }

    const cols = colsMy.filter((c) => colsPg.includes(c));
    if (!cols.length) {
      throw new Error(`La tabla ${tabla} no tiene columnas en comun.`);
    }

    const ignoradas = colsMy.filter((c) => !colsPg.includes(c));
    if (ignoradas.length) {
      console.log(
        `  Aviso: ${tabla} omite columnas que no existen en PostgreSQL: ${ignoradas.join(', ')}`
      );
    }

    const select = `SELECT ${cols
      .map((c) => identificar(c, '`'))
      .join(', ')} FROM ${identificar(tabla, '`')}`;
    const insert = `INSERT INTO ${identificar(tabla, '"')} (${cols
      .map((c) => identificar(c, '"'))
      .join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`;

    const [filas] = await mysqlConn.query(select);
    for (const fila of filas) {
      await pgClient.query(insert, cols.map((c) => fila[c]));
    }
    console.log(`  ${tabla}: ${filas.length} filas`);
    colsPg = null;
  }

  await pgClient.query('COMMIT');

  const { rows: secuencias } = await pgClient.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_default LIKE 'nextval(%'`
  );

  for (const secuencia of secuencias) {
    const tabla = secuencia.table_name;
    const columna = secuencia.column_name;
    await pgClient.query(
      `SELECT setval(
          pg_get_serial_sequence($1, $2),
          COALESCE(MAX(${identificar(columna, '"')}), 1),
          MAX(${identificar(columna, '"')}) IS NOT NULL
        ) FROM ${identificar(tabla, '"')}`,
      [tabla, columna]
    );
  }

  await pgClient.query("SELECT set_config('TimeZone', 'UTC', false)");

  console.log('\nMigracion completada correctamente.');
  console.log('Revisa el panel de administracion para confirmar los datos.');
} catch (error) {
  await pgClient.query('ROLLBACK').catch(() => {});
  console.error('\nERROR:', error.message);
  console.error('No se modifico nada: la migracion se revirtio completa.');
  process.exitCode = 1;
} finally {
  pgClient.release();
  await mysqlConn.end().catch(() => {});
  await pool.end().catch(() => {});
}
