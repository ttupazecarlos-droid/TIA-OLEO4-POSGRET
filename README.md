# Tía Óleo 4 — Node.js + PostgreSQL + Supabase

Tienda y panel de administración migrados a **Node.js + Express** con base de
datos **PostgreSQL** (local o Supabase). El frontend sigue siendo HTML/CSS/JS.

> **El proyecto activo es 100% Node.js.** Los archivos PHP y los duplicados de
> la versión anterior fueron eliminados; el servidor solo sirve `public/`.

---

## 1. Arquitectura

| Parte | Tecnología |
|---|---|
| Servidor HTTP | Node.js + Express |
| Base de datos | PostgreSQL 16 (local) / Supabase |
| Sesiones | PostgreSQL, tabla `sesiones` |
| Contraseñas | bcrypt (`bcryptjs`, compatible con hashes `$2y$` de PHP) |
| Fotos | `public/img` o Supabase Storage |
| Frontend | `public/` (HTML, CSS, JS) |
| Migración de datos | `scripts/migrar-mysql-a-postgres.mjs` |

Rutas principales:

```text
GET  /api/health
GET  /api/productos
POST /api/pedido
POST /api/pagar-pedido
POST /api/chatbot
POST /api/eventos
GET  /api/analitica
GET  /api/pedidos
GET  /api/admin-productos
POST /api/admin-productos
GET  /api/admin-pedidos
GET  /api/admin-cotizaciones
GET  /api/admin-imagen
POST /api/admin-imagen
```

Las URLs antiguas terminadas en `.php` siguen funcionando como alias internos
en Express, pero el backend ya no interpreta PHP.

---

## 2. Requisitos

- **Node.js 20 o superior** y npm.
- **PostgreSQL 16** local, o una cuenta de [Supabase](https://supabase.com).
- Opcional: Docker Desktop.

Comprueba las versiones:

```bash
node -v
npm -v
```

---

## 3. Levantar el proyecto en local con npm

### 3.1 Crear la base de datos

Con PostgreSQL instalado y el servicio iniciado en `127.0.0.1:5432`:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\createdb.exe' -U postgres -h 127.0.0.1 tia_oleo4
$env:PGPASSWORD='postgres'
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -U postgres -h 127.0.0.1 `
    -d tia_oleo4 -v ON_ERROR_STOP=1 -f database.sql
```

`database.sql` crea las tablas, catálogos, los 37 productos iniciales y el
usuario administrador.

### 3.2 Configurar `.env`

Copia el ejemplo local y ajusta la contraseña si es necesario:

```powershell
Copy-Item .env.local.example .env
```

Para PostgreSQL local:

```env
APP_ENV=local
APP_DEBUG=1
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=tia_oleo4
DB_USER=postgres
DB_PASS=postgres
DB_SSLMODE=disable
SESSION_SECURE=0
```

Genera un secreto de sesión propio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

y pégalo en `SESSION_SECRET`.

### 3.3 Instalar y arrancar

```bash
npm install
npm start
```

Para desarrollo con recarga automática:

```bash
npm run dev
```

Abre:

- Tienda: <http://localhost:3000>
- Admin: <http://localhost:3000/admin.html>
- Panel de control: <http://localhost:3000/panel-control.html>
- Health: <http://localhost:3000/api/health>

Respuesta esperada del health:

```json
{"ok":true,"db":"postgresql","entorno":"local"}
```

---

## 4. Migrar datos desde la versión MySQL/MariaDB

Si ya tienes datos en MySQL (usuarios, pedidos, pagos, kardex, analítica),
ejecuta una sola vez:

```bash
npm run db:migrate
```

El script lee por defecto `127.0.0.1:3306/tia_oleo4` con usuario `root` sin
clave (configuración típica de XAMPP). Puedes cambiarlo en `.env`:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=tia_oleo4
MYSQL_USER=root
MYSQL_PASS=
```

Conserva los IDs y las fechas, actualiza el stock y reinicia las secuencias.
Todo corre dentro de una transacción: si algo falla, no deja datos a medias.

> El script reemplaza las tablas de datos de PostgreSQL por las de MySQL.
> Úsalo solo en la migración inicial y guarda un respaldo si ya creaste datos
> nuevos en PostgreSQL.

---

## 5. Crear la base de datos en Supabase

1. Supabase → **New project**.
2. Abre **SQL Editor → New query**.
3. Pega **todo** el contenido de `database.sql` y pulsa **Run**.
4. Verifica en **Table Editor** que aparezcan las 24 tablas y los 37 productos.

`database.sql` es **PostgreSQL/Supabase**, no MySQL. Crea también las tablas
`sesiones`, `pagos` y `eventos_analitica`, activa **RLS** en todas las tablas y
deja los `GRANT` explícitos que Supabase exige desde 2026 para la Data API.

El backend se conecta con el usuario `postgres` (bypass RLS); la
`anon`/`publishable key` pública no puede leer ni escribir las tablas. La
aplicación nunca usa esa clave en el navegador.

---

## 6. Conexión a Supabase (Session Pooler)

En Supabase: **Project Settings → Database → Connection string → Session
pooler** (puerto **5432**).

```env
DB_HOST=aws-0-region-1.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.TU_PROJECT_REF
DB_PASS=TU_PASSWORD
DB_SSLMODE=require
```

> Usa el **Session pooler (5432)**, no el Transaction pooler (6543), para evitar
> problemas con sentencias preparadas.

---

## 7. Variables de entorno

Copia `.env.example` como `.env` y completa los datos:

```bash
cp .env.example .env
```

En Render/Railway **no subas `.env`**: configura las variables en el panel.

| Variable | Ejemplo | Para qué |
|---|---|---|
| `APP_ENV` | `production` | Entorno |
| `APP_DEBUG` | `0` | `1` muestra errores detallados (solo local) |
| `PORT` | `3000` | Puerto HTTP |
| `APP_URL` | `https://midominio.com` | URL pública |
| `DB_HOST` | `aws-0-...pooler.supabase.com` | Host PostgreSQL |
| `DB_PORT` | `5432` | Puerto |
| `DB_NAME` | `postgres` | Base de datos |
| `DB_USER` | `postgres.abcdefgh` | Usuario |
| `DB_PASS` | `...` | Contraseña |
| `DB_SSLMODE` | `require` | SSL en Supabase |
| `DB_POOL_MAX` | `10` | Conexiones del pool |
| `SESSION_NAME` | `tiaoleo_sess` | Cookie de sesión |
| `SESSION_SECRET` | `...` | Firma de la cookie |
| `SESSION_SECURE` | `1` | Solo HTTPS (producción) |
| `SESSION_MAX_AGE` | `86400` | Duración en segundos |
| `SUPABASE_URL` | `https://ref.supabase.co` | Storage (opcional) |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | Storage (secreta, backend) |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Solo proyectos antiguos (legacy) |
| `SUPABASE_BUCKET` | `productos` | Bucket público de fotos |

---

## 8. Fotos de productos

Si `SUPABASE_URL` y `SUPABASE_SECRET_KEY` están vacíos, las fotos subidas desde
el admin se guardan en `public/img/` y se sirven como `img/...`. En local
funciona sin configuración adicional.

En producción el disco puede ser efímero. Para conservar las fotos:

1. Supabase → **Storage → New bucket**.
2. Nombre: `productos`, marca **Public bucket**.
3. Supabase → **Project Settings → API Keys → Publishable and secret API keys**.
4. Copia la **secret key** (`sb_secret_...`). No uses la publishable key.
5. Configura `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y `SUPABASE_BUCKET`.

### Claves nuevas de Supabase (noviembre 2025)

Supabase dejó de entregar las claves legacy `anon` y `service_role` en los
proyectos nuevos (y en los restaurados desde el 1 de noviembre de 2025). Ahora
se usan:

| Clave nueva | Formato | Dónde se usa |
|---|---|---|
| Publishable | `sb_publishable_...` | Navegador, reemplaza a `anon` |
| Secret | `sb_secret_...` | Solo backend, reemplaza a `service_role` |

Este proyecto **no usa la publishable key en el navegador**: el frontend habla
con la API de Node y Node habla directo con PostgreSQL. La secret key solo se
usa para Supabase Storage y se envía en la cabecera `apikey` (las claves nuevas
no son JWT, por eso no deben mandarse como `Authorization: Bearer`).

`src/supabase.js` acepta `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_KEY` y
`SUPABASE_SERVICE_ROLE_KEY`, así que también funciona con proyectos antiguos.

---

## 9. Desplegar

### Render

El archivo `render.yaml` ya define un servicio Node:

- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`

También puedes crear el servicio manualmente con runtime **Node**, esas mismas
órdenes y las variables de la sección 7.

### Railway

1. **New Project → Deploy from GitHub repo**.
2. Railway detecta Node por `package.json`.
3. Agrega las variables de entorno.
4. Genera un dominio y abre `/api/health`.

### Docker

```bash
docker build -t tia-oleo4 .
docker run -d --name tia-oleo4 -p 3000:3000 --env-file .env tia-oleo4
```

### Docker Compose (PostgreSQL + app)

```bash
docker compose up --build
```

- Tienda: <http://localhost:3000>
- Admin: <http://localhost:3000/admin.html>
- Health: <http://localhost:3000/api/health>

Para recrear la base de datos desde cero:

```bash
docker compose down -v
docker compose up --build
```

---

## 10. Acceso al panel

Credenciales iniciales:

```text
Correo: admin@tiaoleo.pe
Clave:  admin123
```

**Cámbiala antes de publicar.** Genera un hash bcrypt:

```bash
node -e "console.log(require('bcryptjs').hashSync('TuNuevaClaveSegura', 10))"
```

Y actualiza en PostgreSQL/Supabase:

```sql
UPDATE usuarios
   SET password_hash = 'PEGA_AQUI_EL_HASH'
 WHERE email = 'admin@tiaoleo.pe';
```

---

## 11. Estructura del proyecto

```text
server.js                 Entrada Express, sesiones, alias y estáticos
src/
  env.js                  Carga de .env y configuración
  db.js                   Pool PostgreSQL y transacciones
  session-store.js        Sesiones en la tabla sesiones
  auth.js                 bcrypt y middlewares de acceso
  supabase.js             Subida/borrado de fotos en Storage
  utils.js                Helpers (Luhn, imágenes, errores)
  routes/
    auth.js               Login, cuentas y mis pedidos
    catalog.js            Productos, pedidos y chatbot
    payment.js            Pago sandbox
    admin.js              Inventario, pedidos, cotizaciones y fotos
    analytics.js          Eventos y panel de analítica
public/                   Frontend servido por Express
  img/                    Fotos de productos
scripts/
  migrar-mysql-a-postgres.mjs
database.sql              Esquema y datos iniciales de PostgreSQL
```

Tablas principales:

- Catálogos: `roles`, `calidades`, `categorias`, `marcas`, `proveedores`,
  `gramajes`, `durezas`, `tipos_cerda`, `tipos_pintura`.
- Usuarios: `usuarios`.
- Catálogo: `productos`, `producto_imagenes`, `resenas`.
- Ventas: `pedidos`, `pedido_items`, `pedido_historial`, `pagos`,
  `cotizaciones`, `cotizacion_items`.
- Inventario: `inventario_movimientos`.
- Analítica: `eventos_analitica`, `chatbot_consultas`.
- Configuración: `config_tienda`.
- Sesiones: `sesiones`.

---

## 12. Solución de problemas

| Error | Causa / solución |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL no está iniciado o el puerto es distinto. |
| `password authentication failed` | Revisa `DB_USER` / `DB_PASS`. En Supabase el usuario es `postgres.<project-ref>`. |
| `prepared statement "..." does not exist` | Estás usando el Transaction pooler (6543). Cambia al Session pooler (5432). |
| `relation "productos" does not exist` | No ejecutaste `database.sql`. |
| La sesión no se mantiene | En HTTP pon `SESSION_SECURE=0`; en HTTPS `SESSION_SECURE=1`. |
| `EADDRINUSE :3000` | Otro proceso usa el puerto. Cambia `PORT` en `.env` o detén el proceso. |
| Error 500 sin detalle | Pon `APP_DEBUG=1` temporalmente y revisa la consola de Node. |
| Las fotos desaparecen al redeploy | Configura Supabase Storage (sección 8) o un volumen persistente. |
| No carga el catálogo | Abre `/api/health` y revisa la conexión a PostgreSQL. |
| `Invalid JWT` al subir fotos | Estás usando una `sb_secret_...` como `Authorization: Bearer`. Usa `SUPABASE_SECRET_KEY`; el código ya la manda en `apikey`. |
| `permission denied for table` en Supabase | Vuelve a ejecutar `database.sql`: incluye RLS y los `GRANT` explícitos. La app igual usa conexión directa. |

---

## 13. Seguridad antes de publicar

- Cambia la clave del administrador.
- Usa `APP_DEBUG=0`, `APP_ENV=production` y `SESSION_SECURE=1`.
- No subas `.env` a GitHub (ya está en `.gitignore`).
- Nunca expongas `SUPABASE_SECRET_KEY` ni `SUPABASE_SERVICE_KEY` en HTML/JS.
- Usa claves nuevas de Supabase (`sb_secret_...`), no las legacy `eyJ...`.
- Mantén RLS activado en Supabase y los `GRANT` explícitos de `database.sql`.
- El servidor solo sirve `public/`; el código de `src/`, `.env` y
  `database.sql` no es accesible por HTTP.
- El pago es un **sandbox educativo** (tarjetas de prueba); no procesa dinero
  real.
- Revisa los términos y la política de privacidad del sitio.
