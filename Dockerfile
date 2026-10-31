# ============================================================
# TIA OLEO 4 - Imagen PHP + Apache para PostgreSQL/Supabase
# ============================================================
FROM php:8.3-apache

# La imagen oficial ya trae mbstring, curl y opcache habilitados.
# Solo agregamos las extensiones de PostgreSQL:
#  - pdo_pgsql: conexion PDO a Supabase
#  - pgsql: soporte PostgreSQL
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo_pgsql pgsql \
    && a2enmod headers \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configuracion de PHP para produccion
RUN { \
      echo 'display_errors=Off'; \
      echo 'log_errors=On'; \
      echo 'error_reporting=E_ALL'; \
      echo 'upload_max_filesize=4M'; \
      echo 'post_max_size=6M'; \
      echo 'max_execution_time=60'; \
      echo 'session.gc_maxlifetime=86400'; \
      echo 'expose_php=Off'; \
    } > /usr/local/etc/php/conf.d/tiaoleo.ini

WORKDIR /var/www/html
COPY . /var/www/html/

# Permisos para la subida local de fotos (fallback sin Supabase Storage)
RUN mkdir -p /var/www/html/img \
    && chown -R www-data:www-data /var/www/html/img \
    && chmod -R 775 /var/www/html/img

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1/api/health.php || exit 1
