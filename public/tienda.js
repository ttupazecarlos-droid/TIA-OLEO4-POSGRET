/* ===========================================================
   TIA OLEO 4 - TIENDA (DB + calidades + carrito + chatbot)
   -----------------------------------------------------------
   - Carga el catalogo desde la API Node.js/PostgreSQL (GET).
     Si la BD no esta disponible, usa productos-data.js + una
     tabla local de calidades/detalle (modo sin conexion).
   - Filtro por tipo de calidad: Escolar / Artistica / Profesional.
   - Ficha "Que incluye tu compra" (especifica lo que se vende).
   - Carrito en localStorage + guardado con POST (api/pedido).
   - Chatbot con palabras predeterminadas (sin IA externa).
   =========================================================== */

const API_PRODUCTOS = 'api/productos';
const API_PEDIDO = 'api/pedido';
const API_CHATBOT = 'api/chatbot';
const NUMERO_WHATSAPP = '51993706366';

// Marcas para el modo sin-BD (con BD llegan del API)
const MARCAS_FALLBACK = {
  'Bloc para Pintar con Acrílicos': 'Artesco', 'Block de Dibujo': 'Vinifan',
  'Block de Papel Calco': 'Vinifan', 'Block de Papel Calidad Superior': 'Faber-Castell',
  'Block de Dibujo Calidad Superior': 'Faber-Castell', 'Croquera Blank Book': 'Tía Óleo',
  'Croquera Cuadrada - Forest Green': 'Tía Óleo', 'Croquera Diseño Moda': 'Tía Óleo',
  'Croquera Hoja Negra Premium': 'Tía Óleo', 'Croquera Mediana Negra': 'Vinifan',
  'Croquera Premium 24 Hojas': 'Tía Óleo', 'Croquera Sketch': 'Artesco',
  'Acuarelas Lavables Multi Colores': 'Artesco',
  'Set 12 Pinturas Acrílicas - Colores Pasteles': 'Artesco',
  'Set 12 Pinturas Acrílicas': 'Artesco',
  'Set 12 Pinceles para Acuarela y Acrílicos': 'Artesco',
  'Set 12 Pinceles para Acrílicos': 'Artesco',
  'Set 18 Marcadores Doble Punta - Rainbow': 'Stabilo',
  'Set 30 Lápices Colores': 'Faber-Castell', 'Caja de 50 Lápices Deluxe': 'Faber-Castell'
};

// Clasificacion para el modo sin-BD (con BD llega del API)
const SPEC_FB = {
  'Bloc para Pintar con Acrílicos': { gramaje: 300, cantidad: 20, unidad: 'hojas' },
  'Block de Dibujo': { gramaje: 90, cantidad: 40, unidad: 'hojas' },
  'Block de Papel Calco': { gramaje: 60, cantidad: 50, unidad: 'hojas' },
  'Block de Papel Calidad Superior': { gramaje: 200, cantidad: 25, unidad: 'hojas' },
  'Block de Dibujo Calidad Superior': { gramaje: 180, cantidad: 30, unidad: 'hojas' },
  'Croquera Blank Book': { gramaje: 75, cantidad: 80, unidad: 'hojas' },
  'Croquera Cuadrada - Forest Green': { gramaje: 100, cantidad: 60, unidad: 'hojas' },
  'Croquera Diseño Moda': { gramaje: 100, cantidad: 50, unidad: 'hojas' },
  'Croquera Hoja Negra Premium': { gramaje: 150, cantidad: 40, unidad: 'hojas' },
  'Croquera Mediana Negra': { gramaje: 80, cantidad: 60, unidad: 'hojas' },
  'Croquera Premium 24 Hojas': { gramaje: 250, cantidad: 24, unidad: 'hojas' },
  'Croquera Sketch': { gramaje: 90, cantidad: 100, unidad: 'hojas' },
  'Acuarelas Lavables Multi Colores': { tipo_pintura: 'Acuarela', cantidad: 12, unidad: 'pastillas' },
  'Set 12 Pinturas Acrílicas - Colores Pasteles': { tipo_pintura: 'Acrílico', cantidad: 12, unidad: 'tubos' },
  'Set 12 Pinturas Acrílicas': { tipo_pintura: 'Acrílico', cantidad: 12, unidad: 'tubos' },
  'Set 12 Pinceles para Acuarela y Acrílicos': { cerda: 'Nylon', cantidad: 12, unidad: 'pinceles' },
  'Set 12 Pinceles para Acrílicos': { cerda: 'Sintética', cantidad: 12, unidad: 'pinceles' },
  'Set 18 Marcadores Doble Punta - Rainbow': { cantidad: 18, unidad: 'marcadores' },
  'Set 30 Lápices Colores': { cantidad: 30, unidad: 'lápices' },
  'Caja de 50 Lápices Deluxe': { cantidad: 50, unidad: 'lápices' }
};

// Calidad por defecto para el modo sin-BD (id: 1 Escolar, 2 Artistica, 3 Profesional)
const META_SIN_BD = {
  'Bloc para Pintar con Acrílicos': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 1 bloc A3 de 20 hojas, papel 300 g/m2 textura lienzo.', contenido: '1 bloc x 20 hojas A3', stock: 25 },
  'Block de Dibujo': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 1 block A4 de 40 hojas bond 90 g/m2.', contenido: '1 block x 40 hojas A4', stock: 40 },
  'Block de Papel Calco': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 1 block A4 de 50 hojas de papel calco translúcido.', contenido: '1 block x 50 hojas A4', stock: 35 },
  'Block de Papel Calidad Superior': { calidad_id: 3, calidad: 'Profesional', color: '#7b2d8b', detalle: 'Se vende: 1 block A3 de 25 hojas, papel 200 g/m2 libre de ácido.', contenido: '1 block x 25 hojas A3', stock: 20 },
  'Block de Dibujo Calidad Superior': { calidad_id: 3, calidad: 'Profesional', color: '#7b2d8b', detalle: 'Se vende: 1 block A4 de 30 hojas satinadas 180 g/m2.', contenido: '1 block x 30 hojas A4', stock: 22 },
  'Croquera Blank Book': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 1 croquera A5 de 80 hojas bond, tapa blanda.', contenido: '1 croquera x 80 hojas A5', stock: 30 },
  'Croquera Cuadrada - Forest Green': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 1 croquera cuadrada 20x20 cm de 60 hojas, tapa dura.', contenido: '1 croquera 20x20 cm', stock: 24 },
  'Croquera Diseño Moda': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 1 croquera A4 de 50 hojas con plantillas de figurín.', contenido: '1 croquera x 50 hojas A4', stock: 18 },
  'Croquera Hoja Negra Premium': { calidad_id: 3, calidad: 'Profesional', color: '#7b2d8b', detalle: 'Se vende: 1 croquera A5 de 40 hojas negras 150 g/m2.', contenido: '1 croquera x 40 hojas negras', stock: 15 },
  'Croquera Mediana Negra': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 1 croquera A5 de 60 hojas, tapa negra cosida.', contenido: '1 croquera x 60 hojas A5', stock: 32 },
  'Croquera Premium 24 Hojas': { calidad_id: 3, calidad: 'Profesional', color: '#7b2d8b', detalle: 'Se vende: 1 sketchbook A4 de 24 hojas 250 g/m2, tapa dura.', contenido: '1 sketchbook x 24 hojas A4', stock: 16 },
  'Croquera Sketch': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 1 croquera A5 de 100 hojas con espiral metálico.', contenido: '1 croquera x 100 hojas A5', stock: 28 },
  'Acuarelas Lavables Multi Colores': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: estuche con 12 pastillas lavables + 1 pincel. No tóxico.', contenido: '12 pastillas + pincel', stock: 26 },
  'Set 12 Pinturas Acrílicas - Colores Pasteles': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 12 tubos x 12 ml tonos pastel + 2 pinceles (N° 4 y 8).', contenido: '12 tubos x 12 ml + 2 pinceles', stock: 20 },
  'Set 12 Pinturas Acrílicas': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 12 tubos x 12 ml colores surtidos + guía de mezcla.', contenido: '12 tubos x 12 ml', stock: 21 },
  'Set 12 Pinceles para Acuarela y Acrílicos': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 12 pinceles surtidos de nylon, mango de madera.', contenido: '12 pinceles surtidos', stock: 19 },
  'Set 12 Pinceles para Acrílicos': { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 12 pinceles sintéticos planos y redondos.', contenido: '12 pinceles surtidos', stock: 23 },
  'Set 18 Marcadores Doble Punta - Rainbow': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 18 marcadores doble punta tinta al alcohol.', contenido: '18 marcadores doble punta', stock: 14 },
  'Set 30 Lápices Colores': { calidad_id: 2, calidad: 'Artística', color: '#c8553d', detalle: 'Se vende: 30 lápices hexagonales mina 3.3 mm.', contenido: '30 lápices', stock: 17 },
  'Caja de 50 Lápices Deluxe': { calidad_id: 3, calidad: 'Profesional', color: '#7b2d8b', detalle: 'Se vende: 50 lápices en caja metálica + 2 grafito de regalo.', contenido: '50 lápices + caja metal', stock: 10 }
};

const CATEGORIAS_TIENDA = [
  { slug: 'papeles', id: 'papeles', titulo: 'Papeles y Blocs' },
  { slug: 'cuadernos', id: 'cuadernos', titulo: 'Cuadernos y Croqueras' },
  { slug: 'pinturas', id: 'pinturas', titulo: 'Pinturas' },
  { slug: 'pinceles', id: 'pinceles', titulo: 'Pinceles y Marcadores' },
  { slug: 'lapices', id: 'lapices', titulo: 'Lápices de Colores' },
  { slug: 'lienzos', id: 'lienzos', titulo: 'Lienzos y Bastidores' },
  { slug: 'grafito', id: 'grafito', titulo: 'Grafito y Dibujo' },
  { slug: 'accesorios', id: 'accesorios', titulo: 'Accesorios y Herramientas' }
];

let catalogoProductos = [];  // lista unificada (BD o fallback)
let usandoBD = false;
let filtroCalidad = 0;       // 0=todas, 1,2,3

const ICONO_WSP = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';

function slugDeCategoria(nombre) {
  const n = String(nombre || '');
  if (/papel|bloc/i.test(n)) return 'papeles';
  if (/croquera|cuaderno|sketch|blank/i.test(n)) return 'cuadernos';
  if (/pintura|acrilica|acuarela/i.test(n)) return 'pinturas';
  if (/pincel|marcador/i.test(n)) return 'pinceles';
  return 'lapices';
}

// ---------- 1. CARGA DESDE LA BD (GET) ----------
async function cargarCatalogo() {
  const estado = document.getElementById('dbEstado');
  try {
    const res = await fetch(API_PRODUCTOS, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'API error');
    usandoBD = true;
    catalogoProductos = data.productos.map(p => ({
      id: Number(p.id), nombre: p.nombre, descripcion: p.descripcion,
      detalle_venta: p.detalle_venta, contenido: p.contenido,
      precio: Number(p.precio), stock: Number(p.stock), imagen: p.imagen,
      imagenes: p.imagenes || [p.imagen], marca: p.marca || '—',
      gramaje: p.gramaje == null ? null : Number(p.gramaje),
      dureza: p.dureza || null, cerda: p.cerda || null, tipo_pintura: p.tipo_pintura || null,
      cantidad: Number(p.cantidad || 1), unidad: p.unidad || 'unidad',
      promedio: Number(p.promedio || 0), nresenas: Number(p.nresenas || 0), resenas: p.resenas || [],
      categoria: p.categoria, categoria_slug: p.categoria_slug,
      calidad: p.calidad, calidad_id: Number(p.calidad_id), calidad_color: p.calidad_color
    }));
    if (estado) estado.textContent = '● Conectado a la base de datos (' + catalogoProductos.length + ' productos).';
  } catch (e) {
    // Fallback: productos-data.js + metadatos locales
    usandoBD = false;
    catalogoProductos = (typeof productos !== 'undefined' ? productos : []).map((p, i) => {
      const m = META_SIN_BD[p.nombre] || { calidad_id: 1, calidad: 'Escolar', color: '#2a9d8f', detalle: 'Se vende: 1 unidad/set tal como se muestra en la foto.', contenido: '1 unidad', stock: 20 };
      const s = SPEC_FB[p.nombre] || {};
      return {
        id: i + 1, nombre: p.nombre, descripcion: p.descripcion,
        detalle_venta: m.detalle, contenido: m.contenido,
        precio: Number(p.precio), stock: m.stock, imagen: p.imagen,
        imagenes: [p.imagen], marca: MARCAS_FALLBACK[p.nombre] || '—',
        gramaje: s.gramaje || null, dureza: s.dureza || null, cerda: s.cerda || null,
        tipo_pintura: s.tipo_pintura || null, cantidad: s.cantidad || 1, unidad: s.unidad || 'unidad',
        promedio: 0, nresenas: 0, resenas: [],
        categoria: p.categoria, categoria_slug: slugDeCategoria(p.categoria),
        calidad: m.calidad, calidad_id: m.calidad_id, calidad_color: m.color
      };
    });
    if (estado) estado.textContent = '○ Sin conexión a la base de datos: mostrando catálogo local. Revisa la conexión a Supabase o importa database.sql.';
  }
  // Limpia ids que ya no existen (ej: si la BD se reinstalo)
  try {
    const c = leerCarrito();
    const limpio = {};
    Object.keys(c).forEach(k => {
      if (catalogoProductos.some(p => p.id === Number(k))) limpio[k] = c[k];
    });
    if (Object.keys(limpio).length !== Object.keys(c).length) guardarCarrito(limpio);
  } catch (e) {}
  sincronizarBuscador();
  renderCatalogoDB();
  renderizarCarrito();
}

// ---------- 2. RENDER CON CALIDADES + FICHA ----------
// Foto generica cuando el producto aun no tiene imagen
const IMG_DEFAULT = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f0eeea"/><text x="50%" y="54%" font-size="80" text-anchor="middle">🎨</text></svg>');
function imgFallback(el) { el.onerror = null; el.src = IMG_DEFAULT; }

// Clasificacion corta: gramaje, dureza, cerda o tipo de pintura
function specCorta(p) {
  const s = [];
  if (p.gramaje) s.push(p.gramaje + ' g/m²');
  if (p.dureza) s.push('Dureza ' + p.dureza);
  if (p.cerda) s.push('Cerda ' + p.cerda);
  if (p.tipo_pintura) s.push(p.tipo_pintura);
  return s.join(' · ');
}

function tarjetaDB(p) {
  const nombreEsc = String(p.nombre).replace(/'/g, "\\'");
  const sinStock = p.stock <= 0;
  const spec = specCorta(p);
  return '<div class="card" data-precio="' + p.precio + '">' +
    '<div class="card-carousel"><div class="card-carousel-inner"><div class="card-carousel-item">' +
    '<img loading="lazy" src="' + (p.imagen || IMG_DEFAULT) + '" onerror="imgFallback(this)" alt="' + p.nombre + '">' +
    '</div></div>' +
    '<span class="badge-calidad badge-flot" style="background:' + p.calidad_color + '">' + p.calidad + '</span></div>' +
    '<div class="info"><h3>' + p.nombre + '</h3>' +
    '<p class="marca-linea">' + (p.marca || '') + '</p>' +
    (spec ? '<p class="spec-linea">' + spec + '</p>' : '') +
    '<p>' + p.descripcion + '</p>' +
    '<p class="contenido-venta">' + p.contenido + '</p>' +
    '<p class="precio" data-precio="' + p.precio + '">S/ ' + p.precio.toFixed(2) + '</p>' +
    '<p class="stock-linea ' + (sinStock ? 'agotado' : '') + '">' + (sinStock ? 'Agotado' : 'Stock: ' + p.stock) + '</p>' +
    '<div class="card-acciones">' +
    '<button type="button" class="btn-detalle" onclick="verDetalle(' + p.id + ')">Ver qué incluye</button>' +
    '<button type="button" class="btn-add" ' + (sinStock ? 'disabled' : '') + ' onclick="agregarAlCarrito(' + p.id + ')">Añadir</button>' +
    '</div>' +
    '<a href="#" class="btn-whatsapp" onclick="enviarWhatsApp(event, \'' + nombreEsc + '\')">' + ICONO_WSP + ' WhatsApp</a>' +
    '</div></div>';
}

function renderCatalogoDB() {
  const cont = document.getElementById('catalogo');
  if (!cont) return;
  const lista = filtroCalidad === 0 ? catalogoProductos : catalogoProductos.filter(p => p.calidad_id === filtroCalidad);
  cont.innerHTML = CATEGORIAS_TIENDA.map(cat => {
    const items = lista.filter(p => p.categoria_slug === cat.slug).map(tarjetaDB).join('');
    if (!items) return '';
    return '<section id="' + cat.id + '"><h2>' + cat.titulo + '</h2><div class="section-line"></div><div class="grid">' + items + '</div></section>';
  }).join('') || '<section class="busqueda-vacia"><h2>Sin resultados</h2><div class="section-line"></div><p>No hay productos con ese filtro de calidad.</p></section>';

  vistaCompletaHTML = cont.innerHTML; // para que "limpiar búsqueda" restaure esta vista
  if (typeof monedaActual !== 'undefined' && monedaActual) aplicarMonedaACatalogo(monedaActual);

  // Si hay una búsqueda activa, mantenerla sobre la nueva vista
  if (typeof consultaActual !== 'undefined' && consultaActual) renderizarBusqueda();
}

function filtrarCalidad(nivel) {
  filtroCalidad = Number(nivel);
  document.querySelectorAll('.filtro-cal').forEach(b => b.classList.toggle('activo', Number(b.dataset.calidad) === filtroCalidad));
  limpiarBusquedaSilenciosa();
  renderCatalogoDB();
}

function limpiarBusquedaSilenciosa() {
  const input = document.getElementById('inputBusqueda');
  const btn = document.getElementById('btnLimpiarBusqueda');
  if (input) input.value = '';
  if (btn) btn.hidden = true;
  if (typeof consultaActual !== 'undefined') { consultaActual = ''; resultadosActuales = []; paginaActual = 1; }
  const contador = document.getElementById('contadorResultados');
  if (contador) contador.textContent = '';
}

// El buscador original (script.js) usa su propio INDICE; lo re-apuntamos al catálogo DB
function sincronizarBuscador() {
  if (typeof INDICE_MEMORIA !== 'undefined') {
    INDICE_MEMORIA.length = 0;
    catalogoProductos.forEach(p => INDICE_MEMORIA.push({
      ref: { nombre: p.nombre, descripcion: p.descripcion + ' ' + p.contenido + ' ' + p.detalle_venta + ' ' + (p.marca || ''), categoria: p.categoria, precio: p.precio, imagen: p.imagen },
      texto: (typeof normalizarTexto === 'function' ? normalizarTexto(p.nombre + ' ' + p.descripcion + ' ' + p.contenido + ' ' + p.categoria + ' ' + p.calidad + ' ' + (p.marca || '') + ' ' + specCorta(p) + ' ' + p.cantidad + ' ' + (p.unidad || '')) : (p.nombre + ' ' + p.descripcion).toLowerCase())
    }));
  }
  // Las tarjetas de resultados ahora muestran calidad + botón añadir
  if (typeof crearTarjetaBusqueda !== 'undefined') {
    crearTarjetaBusqueda = function (p) {
      const real = catalogoProductos.find(x => x.nombre === p.nombre) || p;
      return tarjetaDB(real.id ? real : Object.assign({}, p, { id: real.id || 0, contenido: real.contenido || '', stock: real.stock || 0, marca: real.marca || '', calidad: real.calidad || '', calidad_color: real.calidad_color || '#666', detalle_venta: real.detalle_venta || '' }));
    };
  }
}

// ---------- 3. MODAL DETALLE (especifica lo que se vende) ----------
function verDetalle(id) {
  const p = catalogoProductos.find(x => x.id === Number(id));
  if (!p) return;
  document.getElementById('fichaImg').src = p.imagen || IMG_DEFAULT;
  document.getElementById('fichaImg').alt = p.nombre;
  const b = document.getElementById('fichaCalidad');
  b.textContent = 'Calidad ' + p.calidad;
  b.style.background = p.calidad_color;
  document.getElementById('fichaNombre').textContent = p.nombre;
  document.getElementById('fichaDesc').textContent = p.descripcion;
  document.getElementById('fichaDetalle').textContent = p.detalle_venta;
  document.getElementById('fichaContenido').textContent = 'Marca ' + (p.marca || '—') + ' · Contenido: ' + p.contenido + ' · ' + p.categoria;
  const tec = [];
  if (p.gramaje) tec.push('Gramaje ' + p.gramaje + ' g/m²');
  if (p.dureza) tec.push('Dureza ' + p.dureza);
  if (p.cerda) tec.push('Cerda ' + p.cerda);
  if (p.tipo_pintura) tec.push('Tipo ' + p.tipo_pintura);
  tec.push('Cantidad ' + (p.cantidad || 1) + ' ' + (p.unidad || ''));
  document.getElementById('fichaTecnica').textContent = tec.join(' · ');
  document.getElementById('fichaPrecio').textContent = 'S/ ' + p.precio.toFixed(2);
  document.getElementById('fichaPrecio').setAttribute('data-precio', p.precio);
  document.getElementById('fichaStock').textContent = p.stock > 0 ? 'Stock disponible: ' + p.stock : 'Agotado temporalmente';
  // Galeria de fotos (usa la tabla producto_imagenes 1:N)
  const tumbs = document.getElementById('fichaTumbs');
  const fotos = (p.imagenes && p.imagenes.length) ? p.imagenes : [p.imagen];
  if (tumbs) {
    if (fotos.length > 1) {
      tumbs.style.display = 'flex';
      tumbs.innerHTML = fotos.map((u, i) => '<img loading="lazy" src="' + u + '" alt="Foto ' + (i + 1) + ' de ' + p.nombre + '" onclick="cambiarFotoFicha(\'' + u + '\')">').join('');
    } else { tumbs.style.display = 'none'; tumbs.innerHTML = ''; }
  }
  // Opiniones de clientes (usa la tabla resenas)
  const boxR = document.getElementById('fichaResenas');
  if (boxR) {
    if (p.nresenas > 0) {
      const n = Math.max(0, Math.min(5, Math.round(p.promedio)));
      const est = '★'.repeat(n) + '☆'.repeat(5 - n);
      boxR.innerHTML = '<p class="res-titulo"><span class="res-estrellas">' + est + '</span> ' +
        Number(p.promedio).toFixed(1) + ' · ' + p.nresenas + (p.nresenas === 1 ? ' opinión' : ' opiniones') + '</p>' +
        p.resenas.map(r => '<div class="res-item"><strong>' + escHtml(r.cliente_nombre) + '</strong>' +
          '<span class="res-estrellas">' + '★'.repeat(Math.max(0, Math.min(5, r.puntaje))) + '</span>' +
          '<p>' + escHtml(r.comentario) + '</p></div>').join('');
    } else {
      boxR.innerHTML = '<p class="res-titulo">Sin opiniones todavía</p>';
    }
  }
  const add = document.getElementById('fichaAdd');
  add.disabled = p.stock <= 0;
  add.onclick = () => { agregarAlCarrito(p.id); cerrarDetalle(); };
  document.getElementById('fichaWsp').onclick = (e) => enviarWhatsApp(e, p.nombre);
  document.getElementById('modalFondo').classList.add('abierto');
  document.body.style.overflow = 'hidden';
  if (typeof monedaActual !== 'undefined' && monedaActual) {
    document.getElementById('fichaPrecio').textContent = monedaActual.simbolo + ' ' + (p.precio * monedaActual.tasa).toFixed(2);
  }
}

function escHtml(s) { return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function cambiarFotoFicha(url) {
  const img = document.getElementById('fichaImg');
  if (img) img.src = url;
}

function cerrarDetalle(e) {
  // Solo cierra si el clic fue en el fondo (no dentro de la ficha)
  if (e && e.target && e.target.id !== 'modalFondo' && e.type === 'click') return;
  document.getElementById('modalFondo').classList.remove('abierto');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarDetalle(); cerrarCarrito(); } });

// ---------- 4. CARRITO ----------
function leerCarrito() {
  try { return JSON.parse(localStorage.getItem('tiaoleo_cart') || '{}'); }
  catch (e) { return {}; }
}
function guardarCarrito(c) { localStorage.setItem('tiaoleo_cart', JSON.stringify(c)); }

function agregarAlCarrito(id) {
  const p = catalogoProductos.find(x => x.id === Number(id));
  if (!p || p.stock <= 0) return;
  const c = leerCarrito();
  const key = String(id);
  c[key] = Math.min((c[key] || 0) + 1, p.stock, 99);
  guardarCarrito(c);
  renderizarCarrito();
  const t = totalCarrito();
  const count = document.getElementById('carritoCount');
  if (count) { count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); }
  mostrarToast(p.nombre, c[key], t.n, t.total);
}

function cambiarCantidad(id, delta) {
  const c = leerCarrito();
  const key = String(id);
  const p = catalogoProductos.find(x => x.id === Number(id));
  const nueva = (c[key] || 0) + delta;
  if (nueva <= 0) delete c[key];
  else c[key] = Math.min(nueva, p ? p.stock : 99, 99);
  guardarCarrito(c);
  renderizarCarrito();
}

function quitarDelCarrito(id) {
  const c = leerCarrito();
  delete c[String(id)];
  guardarCarrito(c);
  renderizarCarrito();
}

function vaciarCarrito() {
  if (!Object.keys(leerCarrito()).length) return;
  if (!confirm('¿Vaciar todo el carrito?')) return;
  guardarCarrito({});
  renderizarCarrito();
}

// Aviso flotante al añadir (no interrumpe la compra)
let toastTimer = null;
function mostrarToast(nombre, cantidad, totalN, totalS) {
  const t = document.getElementById('toastCarrito');
  if (!t) return;
  document.getElementById('toastNombre').textContent = 'Añadido: ' + nombre;
  document.getElementById('toastDetalle').textContent = 'x' + cantidad + ' · ' + totalN + ' en carrito · S/ ' + totalS.toFixed(2);
  t.hidden = false;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(ocultarToast, 3500);
}
function ocultarToast() {
  const t = document.getElementById('toastCarrito');
  if (t) t.hidden = true;
}

function totalCarrito() {
  const c = leerCarrito();
  let total = 0, n = 0;
  Object.keys(c).forEach(k => {
    const p = catalogoProductos.find(x => x.id === Number(k));
    if (p) { total += p.precio * c[k]; n += c[k]; }
  });
  return { total, n };
}

function renderizarCarrito() {
  const c = leerCarrito();
  const box = document.getElementById('carritoItems');
  const count = document.getElementById('carritoCount');
  const t = totalCarrito();
  if (count) count.textContent = t.n;
  const totalEl = document.getElementById('carritoTotal');
  if (totalEl) totalEl.textContent = 'S/ ' + t.total.toFixed(2);
  const resumen = document.getElementById('carritoResumen');
  if (resumen) resumen.textContent = t.n + (t.n === 1 ? ' producto' : ' productos');
  if (!box) return;
  const keys = Object.keys(c);
  if (!keys.length) {
    box.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío.<br>Elige calidad, mira qué incluye y añade.</p>' +
      '<button type="button" class="btn-add btn-block" onclick="cerrarCarrito();document.getElementById(\'catalogo\').scrollIntoView({behavior:\'smooth\'})">Ver catálogo</button>';
    return;
  }
  box.innerHTML = keys.map(k => {
    const p = catalogoProductos.find(x => x.id === Number(k));
    if (!p) return '';
    const alMaximo = c[k] >= p.stock;
    return '<div class="carrito-item"><img src="' + (p.imagen || IMG_DEFAULT) + '" onerror="imgFallback(this)" alt="' + p.nombre + '">' +
      '<div class="ci-info"><strong>' + p.nombre + '</strong><span>S/ ' + p.precio.toFixed(2) + ' c/u</span>' +
      '<div class="ci-cant"><button onclick="cambiarCantidad(' + p.id + ',-1)" aria-label="Quitar uno">−</button><span>' + c[k] + '</span><button onclick="cambiarCantidad(' + p.id + ',1)" aria-label="Agregar uno"' + (alMaximo ? ' disabled title="Stock máximo"' : '') + '>+</button></div></div>' +
      '<div class="ci-side"><strong>S/ ' + (p.precio * c[k]).toFixed(2) + '</strong>' +
      '<button type="button" class="ci-quitar" onclick="quitarDelCarrito(' + p.id + ')" aria-label="Quitar del carrito">✕</button></div></div>';
  }).join('');
}

function abrirCarrito() {
  renderizarCarrito();
  document.getElementById('carritoPanel').classList.add('abierto');
  document.getElementById('carritoFondo').classList.add('visible');
  document.body.style.overflow = 'hidden'; // la ventana flotante manda
  ocultarToast();
}
function cerrarCarrito() {
  document.getElementById('carritoPanel').classList.remove('abierto');
  document.getElementById('carritoFondo').classList.remove('visible');
  document.body.style.overflow = '';
}

// POST a la BD: guarda pedido + items + kardex + historial
async function confirmarPedido() {
  const msg = document.getElementById('carritoMsg');
  const nombre = document.getElementById('cliNombre').value.trim();
  const tel = document.getElementById('cliTelefono').value.trim();
  const dir = document.getElementById('cliDireccion').value.trim();
  const c = leerCarrito();
  const items = Object.keys(c).map(k => ({ id: Number(k), cantidad: c[k] }));
  if (!items.length) { msg.textContent = 'El carrito está vacío.'; return; }
  if (nombre.length < 3) { msg.textContent = 'Escribe tu nombre.'; return; }
  if (!/^[0-9+\s-]{6,20}$/.test(tel)) { msg.textContent = 'Escribe un celular válido.'; return; }
  const acepta = document.getElementById('cliAcepta');
  if (acepta && !acepta.checked) { msg.textContent = 'Acepta los Términos y la Privacidad para continuar.'; return; }
  msg.textContent = 'Guardando pedido (POST)…';
  try {
    const res = await fetch(API_PEDIDO, {
      method: 'POST', // ← POST: viaja en el cuerpo, no en la URL
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_nombre: nombre, cliente_telefono: tel, cliente_direccion: dir, metodo_pago: 'whatsapp', items })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al guardar');
    // Flujo Sesion 7 + cuenta: el pedido nace pendiente y va directo a la pasarela (exige sesion alla)
    try { localStorage.setItem('tiaoleo_ultimo_pedido', JSON.stringify({ id: data.pedido_id, total: data.total })); } catch (e) {}
    msg.innerHTML = '✓ Pedido #' + data.pedido_id + ' registrado. Total S/ ' + Number(data.total).toFixed(2) +
      '. Llevándote a la pasarela…';
    guardarCarrito({});
    renderizarCarrito();
    cargarCatalogo(); // refresca stock
    setTimeout(function(){ location.href = 'demo-pasarela-pago.html?pedido_id=' + data.pedido_id; }, 1200);
  } catch (e) {
    msg.textContent = '✕ ' + e.message + ' (¿importaste database.sql?)';
  }
}

function pedirPorWhatsApp() {
  const msg = document.getElementById('carritoMsg');
  const c = leerCarrito();
  const keys = Object.keys(c);
  if (!keys.length) { if (msg) msg.textContent = 'El carrito está vacío.'; return; }
  const t = totalCarrito();
  const lineas = keys.map(k => {
    const p = catalogoProductos.find(x => x.id === Number(k));
    return p ? '• ' + p.nombre + ' x' + c[k] + ' = S/ ' + (p.precio * c[k]).toFixed(2) : '';
  }).join('\n');
  const nombre = document.getElementById('cliNombre').value.trim();
  const texto = 'Hola Tía Óleo 4, quiero pedir:\n' + lineas + '\nTotal: S/ ' + t.total.toFixed(2) + (nombre ? '\nSoy: ' + nombre : '');
  window.open('https://wa.me/' + NUMERO_WHATSAPP + '?text=' + encodeURIComponent(texto), '_blank');
}

// ---------- 5. CHATBOT (palabras predeterminadas) ----------
const CHAT_REGLAS = [
  { k: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches'], r: '¡Hola! Soy la ayuda de Tía Óleo 4. Pregúntame por: precio, calidad, ubicación, mayor, carrito, pago o envío.' },
  { k: ['precio', 'cuanto', 'costo', 'cuesta'], r: 'Los precios están en Soles (S/) y puedes cambiarlos a USD/MXN/BRL con el botón Moneda. Dime qué producto buscas y te digo su precio.' },
  { k: ['calidad', 'escolar', 'profesional', 'artistica', 'premium'], r: 'Tenemos 3 calidades: Escolar (colegio, económica), Artística (estudiantes exigentes) y Profesional (artistas/talleres). Usa el filtro “Calidad” sobre el buscador.' },
  { k: ['donde', 'ubicacion', 'direccion', 'llegar', 'mapa'], r: 'Estamos en Sabandia 418 - Characato - Arequipa. Mira el mapa al final de la página.' },
  { k: ['mayor', 'mayorista', 'volumen', 'colegio', 'aula', 'taller'], r: '¡Sí! Vendemos al detalle y cotizamos por cantidad para aulas/talleres con comprobante. Pulsa “Pedir cotización por mayor”.' },
  { k: ['carrito', 'comprar', 'pedido', 'agregar', 'añadir'], r: 'Pulsa “Añadir” en el producto, abre el Carrito 🛒, escribe tu nombre y celular, y confirma. El pedido se guarda en la base de datos con POST.' },
  { k: ['pago', 'pagar', 'yape', 'plin', 'transferencia'], r: 'Coordinamos el pago por WhatsApp (+51 993 706 366): Yape, Plin o transferencia. El pedido queda “pendiente” hasta confirmarlo.' },
  { k: ['envio', 'delivery', 'entrega', 'recojo'], r: 'Hacemos entrega en Arequipa (Characato y alrededores) y envíos a coordinar por WhatsApp. El recojo es en Sabandia 418.' },
  { k: ['horario', 'atienden', 'abierto', 'hora'], r: 'Horario en tienda fisica de Lunes a Sabado desde las 7am hasta las 6pm y domingos de 8am hasta las 12pm. Escríbenos al WhatsApp +51 993 706 366 y coordinamos tu visita o pedido.' },
  { k: ['gracias', 'genial', 'perfecto'], r: '¡De nada! Que tengas un día lleno de arte. 🎨' },
  { k: ['chao', 'adios', 'hasta luego'], r: '¡Hasta pronto! Tía Óleo 4 te espera.' }
];
const CHAT_RAPIDOS = ['Precios', 'Calidades', 'Ubicación', 'Carrito', 'Por mayor', 'Horario'];

function alternarChatbot() {
  const p = document.getElementById('chatbotPanel');
  const abierto = p.hidden;
  p.hidden = !abierto;
  if (abierto && !document.getElementById('chatbotMsgs').children.length) {
    chatBotDecir('¡Hola! ¿En qué te ayudo? Prueba una palabra: precio, calidad, ubicación, carrito…');
    document.getElementById('chatbotQuick').innerHTML = CHAT_RAPIDOS.map(q => '<button onclick="chatRapido(\'' + q + '\')">' + q + '</button>').join('');
  }
}
function chatRapido(q) { document.getElementById('chatbotText').value = q; enviarChatbot(); }
function chatBotDecir(t) {
  const box = document.getElementById('chatbotMsgs');
  box.innerHTML += '<div class="chat-msg bot">' + t + '</div>';
  box.scrollTop = box.scrollHeight;
}
function enviarChatbot() {
  const input = document.getElementById('chatbotText');
  const txt = input.value.trim();
  if (!txt) return;
  const box = document.getElementById('chatbotMsgs');
  box.innerHTML += '<div class="chat-msg yo">' + txt.replace(/</g, '&lt;') + '</div>';
  input.value = '';
  const norm = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const regla = CHAT_REGLAS.find(r => r.k.some(k => norm.includes(k)));
  chatBotDecir(regla ? regla.r : 'No entendí “' + txt.replace(/</g, '&lt;') + '”. Prueba con: precio, calidad, ubicación, carrito, pago, envío o por mayor.');
  // Analitica escalable: se guarda la palabra detectada (fire-and-forget)
  registrarChatbot(regla ? regla.k[0] : 'sin-coincidencia', txt);
}

// Guarda la consulta en la BD sin bloquear el chat
function registrarChatbot(clave, mensaje) {
  try {
    fetch(API_CHATBOT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palabra_clave: clave, mensaje: String(mensaje).slice(0, 200) })
    }).catch(() => {});
  } catch (e) { /* modo sin-BD: se ignora */ }
}

// Arranque: la BD manda; el JS local es el respaldo
document.addEventListener('DOMContentLoaded', cargarCatalogo);
