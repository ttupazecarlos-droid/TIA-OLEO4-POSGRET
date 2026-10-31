
/* ===========================================================
   TIA OLEO - SCRIPT PRINCIPAL
   -----------------------------------------------------------
   Este archivo contiene toda la logica interactiva del sitio:
   1. Carrusel de imagenes (hero) con autoavance
   2. Boton flotante para volver al inicio
   3. Navegacion suave entre secciones
   4. Envio de mensajes a WhatsApp
   5. Conversion de precios a diferentes monedas
   6. Generacion dinamica del catalogo de productos
   =========================================================== */

// ===========================================================
// 1. CARRUSEL DE IMAGENES (HERO)
// -----------------------------------------------------------
// Muestra un carrusel de fade (opacidad) con 5 imagenes.
// Avanza automaticamente cada 5 segundos y permite
// navegacion manual con flechas y puntos indicadores.
// ===========================================================

// Indice de la diapositiva actualmente visible
let currentSlide = 0;

// Referencias a los elementos del DOM
const slides = document.querySelectorAll('.hero-slide');   // Todas las diapositivas
const dots = document.querySelectorAll('.dot');             // Puntos indicadores
const totalSlides = slides.length;                          // Total de diapositivas
let autoSlideInterval;                                      // ID del intervalo de autoavance

/**
 * Muestra una diapositiva especifica por su indice.
 * Oculta todas las diapositivas y puntos, luego activa solo la indicada.
 * Si el indice esta fuera de rango, hace wrap (vuelve al inicio o fin).
 */
function showSlide(index) {
  if (index >= totalSlides) currentSlide = 0;
  else if (index < 0) currentSlide = totalSlides - 1;
  else currentSlide = index;

  // Activar/desactivar clase 'active' en diapositivas y puntos
  slides.forEach((s, i) => {
    s.classList.toggle('active', i === currentSlide);
  });

  dots.forEach((d, i) => {
    d.classList.toggle('active', i === currentSlide);
  });
}

/** Avanza a la siguiente diapositiva y reinicia el autoavance */
function nextSlide() {
  showSlide(currentSlide + 1);
  resetAutoSlide();
}

/** Retrocede a la diapositiva anterior y reinicia el autoavance */
function previousSlide() {
  showSlide(currentSlide - 1);
  resetAutoSlide();
}

/** Va directamente a una diapositiva por su indice y reinicia el autoavance */
function goToSlide(index) {
  showSlide(index);
  resetAutoSlide();
}

/** Inicia el autoavance: cambia de diapositiva cada 5000ms (5 segundos) */
function startAutoSlide() {
  autoSlideInterval = setInterval(nextSlide, 5000);
}

/** Detiene y reinicia el autoavance (se llama despues de una accion manual) */
function resetAutoSlide() {
  clearInterval(autoSlideInterval);
  startAutoSlide();
}

// Inicializar el carrusel mostrando la primera diapositiva
showSlide(0);
startAutoSlide();

// ===========================================================
// 2. BOTON FLOTANTE "IR AL INICIO"
// -----------------------------------------------------------
// Aparece cuando el usuario ha hecho scroll mas de 300px
// hacia abajo. Al hacer clic, vuelve suavemente al tope.
// ===========================================================

const btnInicio = document.getElementById('btnInicio');

// Detectar el scroll para mostrar/ocultar el boton
window.addEventListener('scroll', () => {
  if (window.pageYOffset > 300) {
    btnInicio.classList.add('visible');
  } else {
    btnInicio.classList.remove('visible');
  }
});

/** Desplaza la pagina suavemente hasta la seccion de inicio */
function irAlInicio() {
  const target = document.querySelector('#inicio');
  if (target) {
    const navEl = document.querySelector('nav');
    const navHeight = navEl ? navEl.offsetHeight : 0;
    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  }
}

// ===========================================================
// 3. NAVEGACION SUAVE (SMOOTH SCROLL)
// -----------------------------------------------------------
// Los enlaces de la barra de navegacion mueven la pagina
// suavemente hasta la seccion correspondiente, descontando
// la altura de la barra sticky.
// ===========================================================

document.querySelectorAll('nav a').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    // Solo scroll suave para anclas internas (#papeles...); paginas como cuenta.html navegan normal
    if (!targetId || !targetId.startsWith('#')) return;
    e.preventDefault();
    const target = document.querySelector(targetId);

    if (target) {
      const navEl = document.querySelector('nav');
      const navHeight = navEl ? navEl.offsetHeight : 0;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ===========================================================
// 4. ENVIO DE MENSAJE A WHATSAPP
// -----------------------------------------------------------
// Al hacer clic en "Consultar" de cualquier producto, se abre
// WhatsApp con un mensaje predefinido que incluye el nombre
// del producto. La tienda usa el numero 51993706366.
// ===========================================================

function enviarWhatsApp(event, nombreProducto) {
  event.preventDefault();

  const numeroWhatsApp = '51993706366';

  // Construir el mensaje con el nombre del producto en negrita
  const mensaje = `Hola, estoy interesado en: *${nombreProducto}*. Podrias darme mas informacion?`;
  const mensajeCodificado = encodeURIComponent(mensaje);

  // Abrir WhatsApp Web o la app en nueva pestana
  const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;
  window.open(urlWhatsApp, '_blank');
}

// ===========================================================
// 4b. COTIZACION POR MAYOR (canal para colegios/talleres)
// -----------------------------------------------------------
// La tienda vende al detalle por defecto. Este aviso permite
// pedir precio por cantidad con comprobante por el mismo WhatsApp.
// ===========================================================

function solicitarCotizacionMayorista(event) {
  if (event) event.preventDefault();

  const numeroWhatsApp = '51993706366';

  const mensaje = 'Hola Tía Óleo 4, necesito una cotización por cantidad para mi aula/taller. Me interesa: ___, cantidad aprox.: ___. ¿Me indican precio por mayor y tiempo de entrega? Gracias.';
  const mensajeCodificado = encodeURIComponent(mensaje);

  const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;
  window.open(urlWhatsApp, '_blank');
}

// ===========================================================
// 5. SISTEMA DE CAMBIO DE MONEDA
// -----------------------------------------------------------
// Consulta la API de tipo de cambio (open.er-api.com) y
// permite al usuario convertir los precios del catalogo a
// diferentes monedas en tiempo real. Usa el "Puente Digital"
// definido en puente-digital.js para obtener las tasas.
// ===========================================================

// Mapa de codigos de moneda con su nombre en espanol y simbolo.
const PAISES_MONEDA = {
  PEN: { pais: 'Perú (Soles)', simbolo: 'S/' },
  USD: { pais: 'Estados Unidos', simbolo: '$' },
  MXN: { pais: 'México', simbolo: 'MX$' },
  BRL: { pais: 'Brasil', simbolo: 'R$' }
};

// Cache de tasas: se obtiene una sola vez y se reutiliza
let tasasActuales = null;

/**
 * Obtiene las tasas de cambio. Si ya estan en cache, las reutiliza.
 * Llama a la funcion obtenerTasasDeCambio() de puente-digital.js.
 */
async function obtenerTasas() {
  if (tasasActuales) return tasasActuales;
  tasasActuales = await obtenerTasasDeCambio();
  return tasasActuales;
}

/** Devuelve el simbolo de una moneda (ej: "S/", "$", "€") */
function formatearSimbolo(codigo) {
  const info = PAISES_MONEDA[codigo];
  return info ? info.simbolo : codigo;
}

/** Devuelve el nombre del pais de una moneda (ej: "Perú (Soles)") */
function nombrePais(codigo) {
  const info = PAISES_MONEDA[codigo];
  return info ? info.pais : codigo;
}

/**
 * Filtra las monedas disponibles: PEN siempre va primero,
 * luego las que la API tenga en sus tasas y esten en nuestro mapa.
 */
function monedasDisponibles(tasas) {
  return ['PEN'].concat(
    Object.keys(PAISES_MONEDA).filter(
      (c) => c !== 'PEN' && typeof tasas[c] === 'number' && tasas[c] > 0
    )
  );
}

/**
 * Abre o cierra el menu flotante de monedas.
 * Al abrir, consulta la API y renderiza la lista de monedas.
 */
async function alternarMenuMonedas() {
  const menu = document.getElementById('menuMonedas');
  if (!menu) return;

  // Si ya esta abierto, lo cierra
  if (menu.classList.contains('abierto')) {
    cerrarMenuMonedas();
    return;
  }

  // Mostrar estado de carga
  menu.classList.add('cargando');
  menu.innerHTML = '<div class="menu-monedas-estado">Consultando tipo de cambio...</div>';
  menu.classList.add('abierto');

  try {
    const tasas = await obtenerTasas();
    const monedas = monedasDisponibles(tasas);
    renderizarMenuMonedas(menu, monedas, tasas);
  } catch (error) {
    menu.innerHTML =
      '<div class="menu-monedas-estado error">No se pudo conectar con la API externa.</div>';
  }
}

/**
 * Genera el HTML del menu de monedas con cada opcion como boton.
 * Muestra: simbolo, nombre del pais y valor del tipo de cambio.
 */
function renderizarMenuMonedas(menu, monedas, tasas) {
  const items = monedas
    .map((codigo) => {
      const simbolo = formatearSimbolo(codigo);
      const pais = nombrePais(codigo);
      const tasa = tasas[codigo];
      return (
        '<button type="button" class="menu-monedas-item" onclick="elegirMoneda(\'' +
        codigo +
        '\')">' +
        '<span class="mm-simbolo">' +
        simbolo +
        '</span>' +
        '<span class="mm-nombre">' +
        pais +
        '</span>' +
        '<span class="mm-valor">1 PEN = ' +
        tasa.toFixed(4) +
        '</span>' +
        '</button>'
      );
    })
    .join('');

  menu.innerHTML =
    '<div class="menu-monedas-titulo">Monedas disponibles</div>' + items;
}

/** Cierra el menu flotante de monedas eliminando la clase 'abierto' */
function cerrarMenuMonedas() {
  const menu = document.getElementById('menuMonedas');
  if (menu) {
    menu.classList.remove('abierto');
    menu.classList.remove('cargando');
  }
}

/**
 * Actualiza todos los precios visibles en el catalogo.
 * Si opcion es null, restaura los precios originales en Soles (PEN).
 * Si opcion tiene { simbolo, tasa }, multiplica cada precio.
 */
function aplicarMonedaACatalogo(opcion) {
  const precios = document.querySelectorAll('#catalogo .card .precio');
  precios.forEach((el) => {
    const precioPEN = parseFloat(el.getAttribute('data-precio'));
    if (!opcion) {
      el.textContent = 'S/ ' + precioPEN.toFixed(2);
    } else {
      el.textContent =
        opcion.simbolo + ' ' + (precioPEN * opcion.tasa).toFixed(2);
    }
  });
}

/**
 * Maneja la seleccion de una moneda desde el menu.
 * PEN restaura precios originales, otras monedas aplican conversion.
 * Guarda la seleccion en monedaActual para reaplicarla al buscar/paginar.
 */
let monedaActual = null;

async function elegirMoneda(codigo) {
  cerrarMenuMonedas();

  const tasas = await obtenerTasas();

  // PEN = volver a precios originales en Soles
  if (codigo === 'PEN') {
    monedaActual = null;
    aplicarMonedaACatalogo(null);
    return;
  }

  const tasa = tasas[codigo];
  if (typeof tasa !== 'number') return;

  monedaActual = {
    codigo,
    simbolo: formatearSimbolo(codigo),
    tasa
  };
  aplicarMonedaACatalogo(monedaActual);
}

// Cerrar el menu si se hace clic fuera de el
document.addEventListener('click', (evento) => {
  const wrapper = document.querySelector('.nav-moneda-wrapper');
  const menu = document.getElementById('menuMonedas');
  if (wrapper && menu && menu.classList.contains('abierto')) {
    if (!wrapper.contains(evento.target)) {
      cerrarMenuMonedas();
    }
  }
});

// ===========================================================
// 6. GENERACION DINAMICA DEL CATALOGO
// -----------------------------------------------------------
// Lee el array 'productos' de productos-data.js y genera
// el HTML de todas las secciones y tarjetas del catalogo.
// Cada categoria se convierte en una <section> con su grid
// de tarjetas. Se ejecuta una sola vez al cargar la pagina.
// ===========================================================

(function renderizarCatalogo() {
  const contenedor = document.getElementById('catalogo');
  if (!contenedor || typeof productos === 'undefined') return;

  // Definicion de categorias: id para anclaje y titulo para filtrar
  const categorias = [
    { id: 'papeles', titulo: 'Papeles y Blocs' },
    { id: 'cuadernos', titulo: 'Cuadernos y Croqueras' },
    { id: 'pinturas', titulo: 'Pinturas' },
    { id: 'pinceles', titulo: 'Pinceles y Marcadores' },
    { id: 'lapices', titulo: 'Lápices de Colores' }
  ];

  // Icono SVG de WhatsApp (se reutiliza en cada tarjeta)
  const iconoWhatsApp =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

  /**
   * Genera el HTML de una tarjeta de producto.
   * Incluye imagen, nombre, descripcion, precio y boton de WhatsApp.
   */
  function tarjeta(p) {
    const nombreEscapado = String(p.nombre).replace(/'/g, "\\'");
    return (
      '<div class="card" data-precio="' +
      p.precio +
      '">' +
      '<div class="card-carousel">' +
      '<div class="card-carousel-inner">' +
      '<div class="card-carousel-item">' +
      '<img loading="lazy" src="' +
      p.imagen +
      '" alt="' +
      p.nombre +
      '">' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="info">' +
      '<h3>' +
      p.nombre +
      '</h3>' +
      '<p>' +
      p.descripcion +
      '</p>' +
      '<p class="precio" data-precio="' +
      p.precio +
      '">S/ ' +
      p.precio.toFixed(2) +
      '</p>' +
      '<a href="#" class="btn-whatsapp" onclick="enviarWhatsApp(event, \'' +
      nombreEscapado +
      '\')">' +
      iconoWhatsApp +
      ' WhatsApp' +
      '</a>' +
      '</div>' +
      '</div>'
    );
  }

  // Construir el HTML completo del catalogo:
  // Para cada categoria, filtra sus productos y genera las tarjetas
  contenedor.innerHTML = categorias
    .map(function (cat) {
      const items = productos
        .filter(function (p) {
          return p.categoria === cat.titulo;
        })
        .map(tarjeta)
        .join('');
      return (
        '<section id="' +
        cat.id +
        '">' +
        '<h2>' +
        cat.titulo +
        '</h2>' +
        '<div class="section-line"></div>' +
        '<div class="grid">' +
        items +
        '</div>' +
        '</section>'
      );
    })
    .join('');
})();

// ===========================================================
// 7. BUSCADOR DEL CATALOGO (Sesion 4)
// -----------------------------------------------------------
// Idea de marketplace (eBay/Alibaba/Amazon): no redibujar todo
// en cada busqueda. Se crea un INDICE en memoria una sola vez
// (texto normalizado por producto) y solo se renderiza la
// pagina actual de resultados (paginacion).
// ===========================================================

const POR_PAGINA = 6;

let vistaCompletaHTML = document.getElementById('catalogo')
  ? document.getElementById('catalogo').innerHTML
  : '';
let resultadosActuales = [];
let paginaActual = 1;
let consultaActual = '';
let temporizadorBusqueda = null;

/** Quita tildes, pasa a minusculas y recorta espacios */
function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Indice en memoria: se construye una sola vez al cargar
const INDICE_MEMORIA =
  typeof productos === 'undefined'
    ? []
    : productos.map(function (p) {
        return {
          ref: p,
          texto: normalizarTexto(p.nombre + ' ' + p.descripcion + ' ' + p.categoria)
        };
      });

/** Busca por tokens: todas las palabras deben aparecer (AND) */
function buscarProductos(query) {
  const q = normalizarTexto(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  return INDICE_MEMORIA.filter(function (entry) {
    return tokens.every(function (t) {
      return entry.texto.includes(t);
    });
  }).map(function (entry) {
    return entry.ref;
  });
}

function crearTarjetaBusqueda(p) {
  const nombreEscapado = String(p.nombre).replace(/'/g, "\\'");
  return (
    '<div class="card" data-precio="' +
    p.precio +
    '"><div class="card-carousel"><div class="card-carousel-inner">' +
    '<div class="card-carousel-item"><img loading="lazy" src="' +
    p.imagen +
    '" alt="' +
    p.nombre +
    '"></div></div></div>' +
    '<div class="info"><h3>' +
    p.nombre +
    '</h3><p>' +
    p.descripcion +
    '</p><p class="categoria-origen">' +
    p.categoria +
    '</p>' +
    '<p class="precio" data-precio="' +
    p.precio +
    '">S/ ' +
    p.precio.toFixed(2) +
    '</p>' +
    '<a href="#" class="btn-whatsapp" onclick="enviarWhatsApp(event, \'' +
    nombreEscapado +
    '\')">' +
    'WhatsApp</a></div></div>'
  );
}

/** Dibuja solo la pagina actual + controles de paginacion */
function renderizarBusqueda() {
  const contenedor = document.getElementById('catalogo');
  const contador = document.getElementById('contadorResultados');
  if (!contenedor) return;

  // Sin consulta: restaurar vista por categorias
  if (!consultaActual) {
    contenedor.innerHTML = vistaCompletaHTML;
    if (contador) contador.textContent = '';
    if (typeof monedaActual !== 'undefined' && monedaActual) {
      aplicarMonedaACatalogo(monedaActual);
    }
    return;
  }

  const total = resultadosActuales.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;

  if (contador) {
    contador.textContent =
      total === 0
        ? `Sin resultados para “${consultaActual}”`
        : `${total} resultado${total === 1 ? '' : 's'} para “${consultaActual}” — pág. ${paginaActual}/${totalPaginas}`;
  }

  if (total === 0) {
    contenedor.innerHTML =
      '<section class="busqueda-vacia"><h2>Sin resultados</h2>' +
      '<div class="section-line"></div>' +
      '<p>No encontramos nada para “' +
      consultaActual +
      '”. Prueba con: acuarela, croquera, pincel, bloc, lapices.</p></section>';
    return;
  }

  const inicio = (paginaActual - 1) * POR_PAGINA;
  const pagina = resultadosActuales.slice(inicio, inicio + POR_PAGINA);

  let botones = '';
  for (let i = 1; i <= totalPaginas; i++) {
    botones +=
      '<button type="button" class="pag-btn' +
      (i === paginaActual ? ' activo' : '') +
      '" onclick="irAPagina(' +
      i +
      ')">' +
      i +
      '</button>';
  }

  contenedor.innerHTML =
    '<section><h2>Resultados</h2><div class="section-line"></div>' +
    '<div class="grid">' +
    pagina.map(crearTarjetaBusqueda).join('') +
    '</div>' +
    (totalPaginas > 1
      ? '<div class="paginacion">' +
        '<button type="button" class="pag-btn" onclick="irAPagina(' +
        (paginaActual - 1) +
        ')"' +
        (paginaActual <= 1 ? ' disabled' : '') +
        '>← Anterior</button>' +
        botones +
        '<button type="button" class="pag-btn" onclick="irAPagina(' +
        (paginaActual + 1) +
        ')"' +
        (paginaActual >= totalPaginas ? ' disabled' : '') +
        '>Siguiente →</button></div>'
      : '') +
    '</section>';

  if (typeof monedaActual !== 'undefined' && monedaActual) {
    aplicarMonedaACatalogo(monedaActual);
  }
}

function irAPagina(n) {
  const totalPaginas = Math.max(1, Math.ceil(resultadosActuales.length / POR_PAGINA));
  if (n < 1 || n > totalPaginas) return;
  paginaActual = n;
  renderizarBusqueda();
  const buscador = document.querySelector('.buscador-catalogo');
  if (buscador) buscador.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limpiarBusqueda() {
  const input = document.getElementById('inputBusqueda');
  const btn = document.getElementById('btnLimpiarBusqueda');
  if (input) input.value = '';
  if (btn) btn.hidden = true;
  consultaActual = '';
  resultadosActuales = [];
  paginaActual = 1;
  renderizarBusqueda();
}

// Escucha con debounce: no busca en cada tecla, espera 200ms
(function initBuscador() {
  const input = document.getElementById('inputBusqueda');
  const btn = document.getElementById('btnLimpiarBusqueda');
  if (!input) return;
  input.addEventListener('input', function () {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(function () {
      consultaActual = input.value.trim();
      paginaActual = 1;
      resultadosActuales = consultaActual ? buscarProductos(consultaActual) : [];
      if (btn) btn.hidden = !consultaActual;
      renderizarBusqueda();
    }, 200);
  });
})();
