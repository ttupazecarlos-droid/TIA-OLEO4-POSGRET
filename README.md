# Tía Óleo 4 — PostgreSQL + Supabase + despliegue online

Proyecto migrado de **MySQL/MariaDB (XAMPP)** a **PostgreSQL en Supabase**.
El frontend sigue siendo HTML/CSS/JS y el backend PHP usa **PDO pgsql**.

> **Importante:** Supabase aloja la base de datos PostgreSQL y las fotos
> (Storage), pero **no ejecuta PHP**. Por eso el proyecto se publica con el
> `Dockerfile` incluido en Render, Railway o un VPS, y ese servidor se conecta
> a Supabase por el Session Pooler.

---

## 1. Qué se cambió

| Antes (MySQL) | Ahora (PostgreSQL/Supabase) |
|---|---|
| `mysql:host=...` | `pgsql:host=...;sslmode=require` |
| `AUTO_INCREMENT` | `SERIAL` / `BIGSERIAL` |
| `TINYINT(1)` | `SMALLINT` con `CHECK (col IN (0,1))` |
| `ENUM(...)` | `VARCHAR` con `CHECK` |
| `ENGINE=InnoDB`, `utf8mb4` | Eliminado (PostgreSQL maneja todo) |
| `ON DUPLICATE KEY UPDATE` | `ON CONFLICT (...) DO UPDATE` |
| `lastInsertId()` | `INSERT ... RETURNING id` |
| `LIKE` (insensible en MySQL) | `ILIKE` |
| `CREATE TABLE` desde PHP | Tablas creadas en `database.sql` |
| Sesiones en archivos | Sesiones en tabla `sesiones` (persistentes) |
| Fotos en `img/` | Supabase Storage (opcional, con fallback local) |
| `phpMyAdmin` | Supabase SQL Editor |

También se protegieron los endpoints internos (`obtener-analitica.php`,
`obtener-pedidos.php`, `reiniciar-analitica.php`) para que solo los vea el
administrador logueado.

---

## 2. Requisitos

- PHP **8.1 o superior** con extensiones `pdo_pgsql`, `pgsql`, `mbstring`, `curl`.
- Una cuenta gratuita en [Supabase](https://supabase.com).
- Para publicar: una cuenta en [Render](https://render.com) o
  [Railway](https://railway.app) (ambos pueden desplegar el `Dockerfile`).
- Alternativa local: Docker Desktop.

> Si usas hosting compartido, verifica que tenga `pdo_pgsql`. Muchos hostings
> gratuitos solo traen MySQL; en ese caso usa Render/Railway/VPS.

---

## 3. Crear la base de datos en Supabase

1. Entra a Supabase → **New project**.
   - Nombre: `tia-oleo4`
   - Región: la más cercana (por ejemplo `South America (São Paulo)`).
   - Guarda la contraseña de la base de datos.
2. Espera a que el proyecto termine de iniciar.
3. Abre **SQL Editor → New query**.
4. Copia **todo** el contenido de `database.sql` y pulsa **Run**.
5. Verifica en **Table Editor** que aparezcan las 24 tablas y los 37 productos.

`database.sql` también activa **RLS** en todas las tablas. La app PHP se
conecta con el usuario `postgres` (bypass RLS), pero la `anon key` pública de
Supabase **no podrá leer ni escribir** las tablas. Eso es intencional.

---

## 4. Obtener la conexión (Session Pooler)

En Supabase: **Project Settings → Database → Connection string → Session
pooler** (puerto **5432**).

Copia los datos a tu `.env`:

```env
DB_HOST=aws-0-region-1.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.TU_PROJECT_REF
DB_PASS=TU_PASSWORD
DB_SSLMODE=require
```

> **Importante:** usa el **Session pooler (5432)**, no el Transaction pooler
> (6543). El Transaction pooler puede fallar con sentencias preparadas
> (`prepared statement ... does not exist`).
>
> La conexión directa `db.<ref>.supabase.co` solo funciona por IPv6 (o con el
> add-on IPv4). El Session Pooler funciona por IPv4, ideal para PHP hosting.

---

## 5. Configurar variables de entorno

Copia `.env.example` como `.env` y completa los datos:

```bash
cp .env.example .env
```

En Render/Railway **no subas `.env`**: configura las mismas variables en el
panel del servicio.

Variables principales:

| Variable | Ejemplo | Para qué |
|---|---|---|
| `APP_ENV` | `production` | Entorno |
| `APP_DEBUG` | `0` | `1` muestra errores detallados (solo local) |
| `DB_HOST` | `aws-0-...pooler.supabase.com` | Host del pooler |
| `DB_PORT` | `5432` | Session pooler |
| `DB_NAME` | `postgres` | Base de Supabase |
| `DB_USER` | `postgres.abcdefgh` | Usuario del pooler |
| `DB_PASS` | `...` | Contraseña de la BD |
| `DB_SSLMODE` | `require` | SSL obligatorio en Supabase |
| `SESSION_DRIVER` | `db` | Sesiones en PostgreSQL |
| `SESSION_SECURE` | `1` | Solo HTTPS (producción) |
| `SUPABASE_URL` | `https://ref.supabase.co` | Storage (opcional) |
| `SUPABASE_SERVICE_KEY` | `sb_secret_...` | Storage (secreta) |
| `SUPABASE_BUCKET` | `productos` | Bucket público de fotos |

---

## 6. Fotos de productos en Supabase Storage (recomendado)

Si no configuras Storage, las fotos del admin se guardan en `img/`. En
Render/Railway el disco es efímero y se pierden al redeploy, así que en
producción conviene Supabase Storage:

1. Supabase → **Storage → New bucket**.
2. Nombre: `productos`, marca **Public bucket**.
3. Supabase → **Project Settings → API Keys** → copia la **service_role**
   (o una **secret key** `sb_secret_...`).
4. En el hosting configura:
   ```env
   SUPABASE_URL=https://TU_REF.supabase.co
   SUPABASE_SERVICE_KEY=TU_SERVICE_KEY
   SUPABASE_BUCKET=productos
   ```

La service key es secreta: solo se usa en el servidor. La app sube la foto,
guarda la URL pública en `producto_imagenes.url` y borra el objeto cuando se
elimina la foto.

---

## 7. Desplegar a internet

### Opción A: Render (recomendada)

1. Sube el proyecto a un repositorio de GitHub.
2. Render → **New → Web Service** → conecta el repositorio.
3. Configura:
   - **Runtime:** Docker
   - **Plan:** Free
   - **Dockerfile Path:** `./Dockerfile`
   - **Health Check Path:** `/api/health.php`
4. En **Environment** agrega todas las variables del punto 5.
5. **Create Web Service**. Render te dará una URL tipo
   `https://tia-oleo4.onrender.com`.
6. Abre `https://TU-URL/api/health.php` y verifica:
   ```json
   {"ok":true,"db":"postgresql","entorno":"production"}
   ```

El archivo `render.yaml` también permite desplegar como Blueprint.

### Opción B: Railway

1. Railway → **New Project → Deploy from GitHub repo**.
2. Railway detecta el `Dockerfile` automáticamente.
3. En **Variables** agrega las mismas variables del punto 5.
4. En **Settings → Networking → Generate Domain**.
5. Abre `https://TU-URL/api/health.php`.

> Si Railway no detecta el puerto, agrega la variable `PORT=80` (Apache
> escucha en el puerto 80 dentro del contenedor).

### Opción C: VPS / Docker

```bash
docker build -t tia-oleo4 .
docker run -d --name tia-oleo4 -p 80:80 --env-file .env tia-oleo4
```

---

## 8. Probar todo en local con Docker

No necesitas XAMPP ni MySQL:

```bash
docker compose up --build
```

- Tienda: <http://localhost:8080>
- Admin: <http://localhost:8080/admin.html>
- Panel de control: <http://localhost:8080/panel-control.html>
- Health: <http://localhost:8080/api/health.php>

El `docker-compose.yml` levanta PostgreSQL 16 y ejecuta `database.sql`
automáticamente la primera vez.

Si cambias `database.sql` y quieres recrear la BD:

```bash
docker compose down -v
docker compose up --build
```

> Si ejecutas PHP directamente en local (XAMPP, `php -S`, etc.) sobre HTTP,
> usa `SESSION_SECURE=0` en `.env`; si usas HTTPS, déjalo en `1`.

---

## 9. Acceso al panel

Credenciales iniciales del administrador:

```text
Correo: admin@tiaoleo.pe
Clave:  admin123
```

**Cámbiala antes de publicar.** Genera un hash nuevo:

```bash
php -r "echo password_hash('TuNuevaClaveSegura', PASSWORD_DEFAULT), PHP_EOL;"
```

Con Docker:

```bash
docker compose exec app php -r "echo password_hash('TuNuevaClaveSegura', PASSWORD_DEFAULT), PHP_EOL;"
```

Y actualiza en Supabase SQL Editor:

```sql
UPDATE usuarios
   SET password_hash = 'PEGA_AQUI_EL_HASH'
 WHERE email = 'admin@tiaoleo.pe';
```

---

## 10. Estructura de la base de datos

24 tablas:

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

## 11. Solución de problemas

| Error | Causa / solución |
|---|---|
| `could not find driver` | Falta `pdo_pgsql` en PHP. Usa el Dockerfile incluido. |
| `password authentication failed for user "postgres"` | El usuario del pooler debe ser `postgres.<project-ref>`, no `postgres`. |
| `prepared statement "..." does not exist` | Estás usando el Transaction pooler (6543). Cambia a Session pooler (5432). |
| `relation "productos" does not exist` | No ejecutaste `database.sql` en Supabase. |
| `permission denied for table ...` | Conéctate con el usuario `postgres` del pooler. |
| La sesión no se mantiene | En HTTP pon `SESSION_SECURE=0`; en HTTPS `SESSION_SECURE=1`. |
| Error 500 sin detalle | Pon `APP_DEBUG=1` temporalmente y revisa los logs del hosting. |
| Las fotos desaparecen al redeploy | Configura Supabase Storage (punto 6). |
| `SSL required` / error de conexión | Usa `DB_SSLMODE=require` y el host del pooler. |

---

## 12. Seguridad antes de publicar

- Cambia la clave del administrador.
- `APP_DEBUG=0` y `APP_ENV=production`.
- No subas `.env` a GitHub (ya está en `.gitignore`).
- Nunca expongas `SUPABASE_SERVICE_KEY` en HTML/JS.
- Mantén RLS activado en Supabase.
- El `.htaccess` protege `.env`, `config.php`, `database.sql` y los auth
  internos en **Apache** (el Docker incluido). Si publicas en **Nginx**,
  replica esas reglas en la configuración del servidor.
- El pago es un **sandbox educativo** (tarjetas de prueba); no procesa dinero real.
- Revisa los términos y la política de privacidad del sitio.
