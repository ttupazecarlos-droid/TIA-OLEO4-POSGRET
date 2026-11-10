/* ===========================================================
   ADMIN - Panel del administrador (inventario, cotizaciones,
   pedidos). Todo pasa por sesion: sin login no hay datos.
   =========================================================== */

const TIENDA_WSP = '51993706366';
let timerInv = null;
let timerCot = null;
let cotLineas = [];   // [{id, nombre, precio, cantidad}]
let ultimaCot = null; // {id, cliente, tel, lineas, total}

/* ---------- Sesion ---------- */
async function estadoSesion() {
  try {
    const r = await fetch('api/sesion');
    const d = await r.json();
    return d.ok ? d : null;
  } catch (e) { return null; }
}

async function iniciar() {
  const s = await estadoSesion();
  document.getElementById('loginView').hidden = !!s;
  document.getElementById('panelView').hidden = !s;
  document.getElementById('btnSalir').hidden = !s;
  document.getElementById('adminUser').textContent = s ? s.nombre : '';
  if (s) {
    cargarInventario();
    cargarPedidos();
    cargarHistorial();
  } else {
    document.getElementById('loginView').hidden = false;
  }
}

async function ingresar() {
  const msg = document.getElementById('loginMsg');
  msg.className = 'admin-msg';
  msg.textContent = 'Verificando…';
  try {
    const r = await fetch('api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPass').value
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'No se pudo ingresar.');
    iniciar();
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function salir() {
  await fetch('api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
}

function verTab(nombre) {
  ['inventario', 'cotizar', 'pedidos', 'historial'].forEach(t => {
    document.getElementById('tab-' + t).hidden = (t !== nombre);
  });
  document.querySelectorAll('.atab').forEach(b => b.classList.toggle('activo', b.dataset.tab === nombre));
}

/* ---------- Inventario ---------- */
async function cargarInventario() {
  const msg = document.getElementById('invMsg');
  const q = document.getElementById('invBuscar').value.trim();
  const cat = document.getElementById('invCategoria').value;
  try {
    const r = await fetch('api/admin-productos?buscar=' + encodeURIComponent(q) + '&categoria=' + encodeURIComponent(cat));
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Sin acceso.');
    const sel = document.getElementById('invCategoria');
    if (sel.options.length <= 1) {
      d.categorias.forEach(c => {
        const o = document.createElement('option');
        o.value = c.slug; o.textContent = c.nombre;
        sel.appendChild(o);
      });
    }
    const body = document.getElementById('invBody');
    body.innerHTML = d.productos.map(p => {
      const spec = [p.gramaje ? p.gramaje + ' g' : '', p.dureza ? 'D.' + p.dureza : '', p.cantidad + ' ' + p.unidad].filter(Boolean).join(' · ');
      const bajo = p.stock <= 5;
      const inactivo = p.activo == 0;
      const foto = p.imagen ? '<img class="inv-thumb" src="' + p.imagen + '" alt="Foto actual" loading="lazy" onerror="this.remove()"><br>' : '';
      const tags = (p.destacado == 1 ? ' ⭐' : '') + (inactivo ? ' <span class="estado anulado">oculto</span>' : '');
      return '<tr class="' + (bajo ? 'fila-bajo' : '') + '">' +
        '<td><strong>' + p.nombre + '</strong>' + tags + '<br><span class="mutes">' + (p.marca || '') + '</span></td>' +
        '<td>' + foto + '<button type="button" class="abtn chico" onclick="abrirModalFoto(' + p.id + ')">Foto</button></td>' +
        '<td>' + p.categoria + '</td>' +
        '<td class="mutes">' + spec + '</td>' +
        '<td><input type="number" id="pr-' + p.id + '" value="' + p.precio.toFixed(2) + '" min="0.5" step="0.5"></td>' +
        '<td><input type="number" id="st-' + p.id + '" value="' + p.stock + '" min="0" max="9999" step="1" class="' + (bajo ? 'stock-rojo' : '') + '"></td>' +
        '<td><div class="fila-btns"><button type="button" class="abtn chico" onclick="guardarProducto(' + p.id + ')">Guardar</button>' +
        '<button type="button" class="abtn chico" onclick="abrirModalEditar(' + p.id + ')">✎ Editar</button></div></td></tr>';
    }).join('') || '<tr><td colspan="7">Sin resultados.</td></tr>';
    pintarStats(d.productos, null);
    msg.textContent = '';
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function guardarProducto(id) {
  const msg = document.getElementById('invMsg');
  msg.className = 'admin-msg';
  try {
    const r = await fetch('api/admin-productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: id,
        precio: parseFloat(document.getElementById('pr-' + id).value),
        stock: parseInt(document.getElementById('st-' + id).value, 10)
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ Producto #' + id + ' actualizado (kárdex anotado).';
    cargarInventario();
  } catch (e) {
    msg.className = 'admin-msg';
    msg.textContent = '✕ ' + e.message;
  }
}

/* ---------- Cotizador ---------- */
async function buscarParaCotizar() {
  clearTimeout(timerCot);
  timerCot = setTimeout(async () => {
    const q = document.getElementById('cotBuscar').value.trim();
    const box = document.getElementById('cotResultados');
    if (q.length < 2) { box.innerHTML = ''; return; }
    try {
      const r = await fetch('api/admin-productos?buscar=' + encodeURIComponent(q));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      box.innerHTML = d.productos.slice(0, 8).map(p =>
        '<div class="cot-res"><span><strong>' + p.nombre + '</strong> <span class="mutes">S/ ' + p.precio.toFixed(2) + ' · stock ' + p.stock + '</span></span>' +
        '<button type="button" class="abtn chico" onclick="agregarACot(' + p.id + ')">Añadir</button></div>'
      ).join('') || '<p class="mutes">Sin coincidencias.</p>';
      box._cache = d.productos;
    } catch (e) { box.innerHTML = ''; }
  }, 250);
}

function agregarACot(id) {
  const box = document.getElementById('cotResultados');
  const p = (box._cache || []).find(x => x.id === id);
  if (!p) return;
  const ex = cotLineas.find(x => x.id === id);
  if (ex) ex.cantidad = Math.min(ex.cantidad + 1, 99);
  else cotLineas.push({ id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 });
  document.getElementById('cotBuscar').value = '';
  box.innerHTML = '';
  renderCot();
}

function cambiarCantCot(id, delta) {
  const l = cotLineas.find(x => x.id === id);
  if (!l) return;
  l.cantidad += delta;
  if (l.cantidad <= 0) cotLineas = cotLineas.filter(x => x.id !== id);
  if (l.cantidad > 99) l.cantidad = 99;
  renderCot();
}

function renderCot() {
  let total = 0;
  document.getElementById('cotBody').innerHTML = cotLineas.map(l => {
    const sub = l.precio * l.cantidad;
    total += sub;
    return '<tr><td>' + l.nombre + '</td>' +
      '<td><div class="cant-ctl"><button onclick="cambiarCantCot(' + l.id + ',-1)">−</button><span>' + l.cantidad + '</span><button onclick="cambiarCantCot(' + l.id + ',1)">+</button></div></td>' +
      '<td>S/ ' + l.precio.toFixed(2) + '</td><td><strong>S/ ' + sub.toFixed(2) + '</strong></td>' +
      '<td><button type="button" class="abtn chico" onclick="cambiarCantCot(' + l.id + ',-999)">✕</button></td></tr>';
  }).join('') || '<tr><td colspan="5" class="mutes">Vacía: busca y añade productos.</td></tr>';
  document.getElementById('cotTotal').textContent = 'S/ ' + total.toFixed(2);
  actualizarBotonWsp();
}

/* El botón de WhatsApp debe funcionar de forma natural:
   se activa cuando hay productos en el detalle (aunque aún
   no se haya guardado) o cuando hay una cotización guardada. */
function actualizarBotonWsp() {
  const btn = document.getElementById('btnCotWsp');
  if (!btn) return;
  btn.disabled = !(cotLineas.length > 0 || ultimaCot);
}

async function guardarCotizacion() {
  const msg = document.getElementById('cotMsg');
  msg.className = 'admin-msg';
  try {
    const r = await fetch('api/admin-cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_nombre: document.getElementById('cotNombre').value.trim(),
        cliente_telefono: document.getElementById('cotTelefono').value.trim(),
        items: cotLineas.map(l => ({ id: l.id, cantidad: l.cantidad }))
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    ultimaCot = {
      id: d.cotizacion_id, total: d.total,
      cliente: document.getElementById('cotNombre').value.trim(),
      tel: document.getElementById('cotTelefono').value.trim(),
      lineas: d.lineas
    };
    actualizarBotonWsp();
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje + ' Ya puedes enviarla por WhatsApp.';
    cotLineas = [];
    renderCot();
    cargarHistorial();
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

/* ---------- WhatsApp: normalización y envío ---------- */
// Deja solo dígitos y completa con código país Perú (51) si es un celular de 9 dígitos.
function normalizarTelefonoPeru(tel) {
  const dig = String(tel || '').replace(/\D/g, '');
  if (!dig) return '';
  if (dig.length === 11 && dig.startsWith('51')) return dig; // ya tiene 51 + 9 dígitos
  if (dig.length === 9 && dig.startsWith('9')) return '51' + dig; // celular PE sin código
  if (dig.length >= 10 && dig.length <= 15) return dig; // otro país / fijo válido
  return '';
}

function fmt(n) { return 'S/ ' + Number(n || 0).toFixed(2); }

function abrirWhatsApp(destDigitos, texto) {
  const url = destDigitos
    ? 'https://wa.me/' + destDigitos + '?text=' + encodeURIComponent(texto)
    : 'https://wa.me/?text=' + encodeURIComponent(texto); // sin número: elige contacto
  const win = window.open(url, '_blank');
  if (!win) {
    // Si el navegador bloqueó la ventana, redirigir en la misma pestaña
    // y dejar el texto copiado para pegarlo manualmente.
    try { navigator.clipboard.writeText(texto); } catch (e) {}
    window.location.href = url;
  }
  return url;
}

function enviarCotWsp() {
  const msg = document.getElementById('cotMsg');
  // Si hay borrador sin guardar, se envía el borrador (lo más natural).
  // Si no, se envía la última cotización guardada.
  let lineas, total, cliente, tel, cotId = null;
  if (cotLineas.length > 0) {
    lineas = cotLineas.map(l => ({ nombre: l.nombre, cantidad: l.cantidad, subtotal: l.precio * l.cantidad }));
    total = cotLineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    cliente = document.getElementById('cotNombre').value.trim();
    tel = document.getElementById('cotTelefono').value.trim();
    if (ultimaCot) cotId = ultimaCot.id;
  } else if (ultimaCot) {
    lineas = (ultimaCot.lineas || []).map(l => ({
      nombre: l.nombre || l.texto || 'Producto',
      cantidad: Number(l.cantidad) || 1,
      subtotal: Number(l.subtotal)
    }));
    total = Number(ultimaCot.total);
    cliente = ultimaCot.cliente || '';
    tel = ultimaCot.tel || document.getElementById('cotTelefono').value.trim();
    cotId = ultimaCot.id;
  } else {
    msg.className = 'admin-msg';
    msg.textContent = 'Agrega al menos un producto para enviar la cotización.';
    return;
  }
  if (!lineas.length) {
    msg.className = 'admin-msg';
    msg.textContent = 'Agrega al menos un producto para enviar la cotización.';
    return;
  }
  const saludo = cliente ? 'Hola ' + cliente + ', te envío' : 'Hola, te envío';
  const titulo = cotId ? saludo + ' la cotización #' + cotId + ' de *Tía Óleo 4*:' : saludo + ' la cotización de *Tía Óleo 4*:';
  const detalle = lineas.map(l => '• ' + l.nombre + ' x' + l.cantidad + ' = ' + fmt(l.subtotal)).join('\n');
  const texto = titulo + '\n' + detalle + '\nTotal: *' + fmt(total) + '*\n¿Confirmamos tu pedido? 😊';
  const dest = normalizarTelefonoPeru(tel);
  abrirWhatsApp(dest, texto);
  msg.className = 'admin-msg ok';
  msg.textContent = dest
    ? '✓ Abriendo WhatsApp hacia ' + dest + '…'
    : '✓ Abriendo WhatsApp: elige el contacto del cliente y pulsa enviar.';
}

/* ---------- Pedidos ---------- */
async function cargarPedidos() {
  const msg = document.getElementById('pedMsg');
  try {
    const r = await fetch('api/admin-pedidos');
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Sin acceso.');
    document.getElementById('pedBody').innerHTML = d.pedidos.map(p =>
      '<tr><td><strong>#' + p.id + '</strong></td>' +
      '<td>' + p.cliente_nombre + '<br><span class="mutes">' + p.cliente_telefono + '</span></td>' +
      '<td class="mutes">' + p.detalle + '</td>' +
      '<td><strong>S/ ' + p.total.toFixed(2) + '</strong></td>' +
      '<td class="mutes">' + (p.creado_en ? new Date(p.creado_en).toLocaleString('es-PE') : '—') + '</td>' +
      '<td><select onchange="cambiarEstadoPedido(' + p.id + ', this.value)">' +
      d.estados.map(e => '<option value="' + e + '"' + (e === p.estado ? ' selected' : '') + '>' + e + '</option>').join('') +
      '</select> <span class="estado ' + p.estado + '">' + p.estado + '</span></td></tr>'
    ).join('') || '<tr><td colspan="6" class="mutes">Aún no hay pedidos.</td></tr>';
    pintarStats(null, d.pedidos);
    msg.textContent = '';
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function cambiarEstadoPedido(id, estado) {
  const msg = document.getElementById('pedMsg');
  try {
    const r = await fetch('api/admin-pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, estado: estado })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje;
    cargarPedidos();
  } catch (e) {
    msg.className = 'admin-msg';
    msg.textContent = '✕ ' + e.message;
    cargarPedidos();
  }
}

/* ---------- Historial de cotizaciones ---------- */
async function cargarHistorial() {
  const msg = document.getElementById('histMsg');
  try {
    const r = await fetch('api/admin-cotizaciones');
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Sin acceso.');
    document.getElementById('histBody').innerHTML = d.cotizaciones.map(c => {
      const det = c.items.map(i => i.texto + ' (S/ ' + i.subtotal.toFixed(2) + ')').join(', ');
      return '<tr><td><strong>#' + c.id + '</strong></td>' +
        '<td>' + c.cliente_nombre + '<br><span class="mutes">' + (c.cliente_telefono || '') + '</span></td>' +
        '<td class="mutes">' + det + '</td>' +
        '<td><strong>S/ ' + c.total.toFixed(2) + '</strong></td>' +
        '<td><select onchange="cambiarEstadoCot(' + c.id + ', this.value)">' +
        d.estados.map(e => '<option value="' + e + '"' + (e === c.estado ? ' selected' : '') + '>' + e + '</option>').join('') +
        '</select> <span class="estado ' + c.estado + '">' + c.estado + '</span></td>' +
        '<td><button type="button" class="abtn chico" onclick="reenviarCot(' + c.id + ')">WSP</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="mutes">Aún no hay cotizaciones.</td></tr>';
    msg.textContent = '';
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function cambiarEstadoCot(id, estado) {
  const msg = document.getElementById('histMsg');
  try {
    const r = await fetch('api/admin-cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, estado: estado })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje;
    cargarHistorial();
  } catch (e) {
    msg.className = 'admin-msg';
    msg.textContent = '✕ ' + e.message;
    cargarHistorial();
  }
}

async function reenviarCot(id) {
  try {
    const r = await fetch('api/admin-cotizaciones');
    const d = await r.json();
    const c = (d.cotizaciones || []).find(x => x.id === id);
    if (!c) return;
    const lineas = c.items.map(i => '• ' + i.texto + ' = ' + fmt(i.subtotal)).join('\n');
    const nombre = c.cliente_nombre || '';
    const saludo = nombre ? 'Hola ' + nombre + ', te reenvío' : 'Hola, te reenvío';
    const texto = saludo + ' la cotización #' + c.id + ' de *Tía Óleo 4*:\n' + lineas + '\nTotal: *' + fmt(c.total) + '*';
    const dest = normalizarTelefonoPeru(c.cliente_telefono);
    abrirWhatsApp(dest, texto);
  } catch (e) {}
}

/* ---------- Resumen ---------- */
let cacheInv = null, cachePed = null;
function pintarStats(inv, ped) {
  if (inv) cacheInv = inv;
  if (ped) cachePed = ped;
  const box = document.getElementById('adminStats');
  if (!box || (!cacheInv && !cachePed)) return;
  const bajos = (cacheInv || []).filter(p => p.stock <= 5);
  const pend = (cachePed || []).filter(p => p.estado === 'pendiente');
  box.innerHTML =
    '<div class="stat"><strong>' + (cacheInv ? cacheInv.length : '—') + '</strong><span>Productos</span></div>' +
    '<div class="stat' + (bajos.length ? ' alerta' : '') + '"><strong>' + bajos.length + '</strong><span>Stock bajo (≤5)</span></div>' +
    '<div class="stat' + (pend.length ? ' alerta' : '') + '"><strong>' + pend.length + '</strong><span>Pedidos pendientes</span></div>' +
    '<div class="stat"><strong>' + (cachePed ? cachePed.length : '—') + '</strong><span>Pedidos (50 últ.)</span></div>';
}

/* ---------- Nuevo producto (todas las tablas) ---------- */
let listasCache = null;

async function asegurarListas() {
  if (listasCache) return listasCache;
  try {
    const r = await fetch('api/admin-productos');
    const d = await r.json();
    if (d.ok && d.listas) listasCache = d.listas;
  } catch (e) {}
  return listasCache || {};
}

async function abrirModalNuevo() {
  document.getElementById('modalNuevoFondo').classList.add('abierto');
  document.getElementById('npMsg').textContent = '';
  const L = await asegurarListas();
  llenarSel('npCategoria', L.categorias, 'nombre', true);
  llenarSel('npCalidad', L.calidades, 'nombre', true);
  llenarSel('npMarca', L.marcas, 'nombre', false);
  llenarSel('npProveedor', L.proveedores, 'nombre', false);
  llenarSel('npGramaje', (L.gramajes || []).map(g => ({ id: g.id, nombre: g.valor + ' g/m²' })), 'nombre', false);
  llenarSel('npDureza', (L.durezas || []).map(d => ({ id: d.id, nombre: d.codigo })), 'nombre', false);
  llenarSel('npCerda', L.cerdas, 'nombre', false);
  llenarSel('npTipo', L.tipos_pintura, 'nombre', false);
}

function llenarSel(id, items, campo, requerido) {
  const sel = document.getElementById(id);
  const actual = sel.value;
  sel.innerHTML = (requerido ? '' : '<option value="">— No aplica</option>') +
    (items || []).map(o => '<option value="' + o.id + '">' + o[campo] + '</option>').join('');
  if (actual) sel.value = actual;
}

function cerrarModalNuevo() {
  document.getElementById('modalNuevoFondo').classList.remove('abierto');
}

async function guardarNuevo() {
  const msg = document.getElementById('npMsg');
  msg.className = 'admin-msg';
  const val = (id) => document.getElementById(id).value.trim();
  const num = (id) => document.getElementById(id).value;
  msg.textContent = 'Guardando…';
  try {
    const r = await fetch('api/admin-productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        nombre: val('npNombre'), descripcion: val('npDescripcion'),
        detalle_venta: val('npDetalle'), contenido: val('npContenido'), unidad: val('npUnidad'),
        categoria_id: parseInt(num('npCategoria'), 10), calidad_id: parseInt(num('npCalidad'), 10),
        marca_id: parseInt(num('npMarca'), 10) || 0, proveedor_id: parseInt(num('npProveedor'), 10) || 0,
        gramaje_id: parseInt(num('npGramaje'), 10) || 0, dureza_id: parseInt(num('npDureza'), 10) || 0,
        cerda_id: parseInt(num('npCerda'), 10) || 0, tipo_pintura_id: parseInt(num('npTipo'), 10) || 0,
        cantidad: parseInt(num('npCantidad'), 10), precio: parseFloat(num('npPrecio')),
        stock: parseInt(num('npStock'), 10), imagen: val('npImagen'),
        destacado: document.getElementById('npDestacado').checked
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    const fotoFile = (document.getElementById('npFotoFile').files || [])[0];
    if (fotoFile) {
      msg.textContent = '✓ Producto creado. Subiendo foto…';
      try {
        const fd = new FormData();
        fd.append('producto_id', d.producto_id);
        fd.append('foto', fotoFile);
        const ru = await fetch('api/admin-imagen', { method: 'POST', body: fd });
        const du = await ru.json();
        if (!du.ok) throw new Error(du.error);
        msg.textContent = '✓ Producto creado con foto. Ya se ve en la tienda.';
      } catch (e2) { msg.textContent = '✓ Producto creado, pero la foto falló: ' + e2.message; }
    } else {
      msg.textContent = '✓ ' + d.mensaje + ' Ya se ve en la tienda.';
    }
    msg.className = 'admin-msg ok';
    cargarInventario();
    setTimeout(cerrarModalNuevo, 1400);
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

/* ---------- Editar producto (toda la información) ---------- */
async function abrirModalEditar(id) {
  const msg = document.getElementById('epMsg');
  msg.className = 'admin-msg';
  msg.textContent = 'Cargando…';
  document.getElementById('modalEditarFondo').classList.add('abierto');
  document.getElementById('modalEditarTitulo').textContent = 'Editar producto #' + id;
  const L = await asegurarListas();
  llenarSel('epCategoria', L.categorias, 'nombre', true);
  llenarSel('epCalidad', L.calidades, 'nombre', true);
  llenarSel('epMarca', L.marcas, 'nombre', false);
  llenarSel('epProveedor', L.proveedores, 'nombre', false);
  llenarSel('epGramaje', (L.gramajes || []).map(g => ({ id: g.id, nombre: g.valor + ' g/m²' })), 'nombre', false);
  llenarSel('epDureza', (L.durezas || []).map(d => ({ id: d.id, nombre: d.codigo })), 'nombre', false);
  llenarSel('epCerda', L.cerdas, 'nombre', false);
  llenarSel('epTipo', L.tipos_pintura, 'nombre', false);
  try {
    const r = await fetch('api/admin-productos?id=' + id);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'No se pudo cargar.');
    const p = d.producto;
    document.getElementById('epId').value = p.id;
    document.getElementById('epNombre').value = p.nombre || '';
    document.getElementById('epCategoria').value = p.categoria_id || '';
    document.getElementById('epCalidad').value = p.calidad_id || '';
    document.getElementById('epMarca').value = p.marca_id || '';
    document.getElementById('epProveedor').value = p.proveedor_id || '';
    document.getElementById('epPrecio').value = Number(p.precio).toFixed(2);
    document.getElementById('epStock').value = p.stock;
    document.getElementById('epGramaje').value = p.gramaje_id || '';
    document.getElementById('epDureza').value = p.dureza_id || '';
    document.getElementById('epCerda').value = p.cerda_id || '';
    document.getElementById('epTipo').value = p.tipo_pintura_id || '';
    document.getElementById('epCantidad').value = p.cantidad;
    document.getElementById('epUnidad').value = p.unidad || '';
    document.getElementById('epDescripcion').value = p.descripcion || '';
    document.getElementById('epDetalle').value = p.detalle_venta || '';
    document.getElementById('epContenido').value = p.contenido || '';
    document.getElementById('epDestacado').checked = p.destacado == 1;
    document.getElementById('epActivo').checked = p.activo != 0;
    msg.textContent = '';
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

function cerrarModalEditar() {
  document.getElementById('modalEditarFondo').classList.remove('abierto');
}

async function guardarEdicion() {
  const msg = document.getElementById('epMsg');
  msg.className = 'admin-msg';
  const val = (id) => document.getElementById(id).value.trim();
  const num = (id) => document.getElementById(id).value;
  msg.textContent = 'Guardando…';
  try {
    const r = await fetch('api/admin-productos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'actualizar',
        id: parseInt(val('epId'), 10),
        nombre: val('epNombre'), descripcion: val('epDescripcion'),
        detalle_venta: val('epDetalle'), contenido: val('epContenido'), unidad: val('epUnidad'),
        categoria_id: parseInt(num('epCategoria'), 10), calidad_id: parseInt(num('epCalidad'), 10),
        marca_id: parseInt(num('epMarca'), 10) || 0, proveedor_id: parseInt(num('epProveedor'), 10) || 0,
        gramaje_id: parseInt(num('epGramaje'), 10) || 0, dureza_id: parseInt(num('epDureza'), 10) || 0,
        cerda_id: parseInt(num('epCerda'), 10) || 0, tipo_pintura_id: parseInt(num('epTipo'), 10) || 0,
        cantidad: parseInt(num('epCantidad'), 10), precio: parseFloat(num('epPrecio')),
        stock: parseInt(num('epStock'), 10),
        destacado: document.getElementById('epDestacado').checked,
        activo: document.getElementById('epActivo').checked
      })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje + ' Ya se ve en la tienda.';
    cargarInventario();
    setTimeout(cerrarModalEditar, 1200);
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

/* ---------- Fotos del producto ---------- */
let fotoPid = 0;

function abrirModalFoto(id) {
  fotoPid = id;
  document.getElementById('modalFotoFondo').classList.add('abierto');
  document.getElementById('fotoMsg').textContent = '';
  document.getElementById('fotoFile').value = '';
  document.getElementById('fotoPreview').hidden = true;
  document.getElementById('modalFotoTitulo').textContent = 'Fotos del producto #' + id;
  cargarFotos();
}

function cerrarModalFoto() {
  document.getElementById('modalFotoFondo').classList.remove('abierto');
  fotoPid = 0;
  cargarInventario(); // refresca miniaturas
}

async function cargarFotos() {
  const box = document.getElementById('fotoGrid');
  try {
    const r = await fetch('api/admin-imagen?producto_id=' + fotoPid);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    box.innerHTML = d.imagenes.map(f =>
      '<div class="foto-item' + (f.es_principal == 1 ? ' principal' : '') + '">' +
      '<img src="' + f.url + '" alt="Foto" loading="lazy">' +
      (f.es_principal == 1
        ? '<span class="foto-tag">★ Principal</span>'
        : '<div class="foto-btns"><button type="button" class="abtn chico" onclick="fotoPrincipal(' + f.id + ')">★ Principal</button>' +
          '<button type="button" class="abtn chico" onclick="eliminarFoto(' + f.id + ')">✕</button></div>') +
      '</div>'
    ).join('') || '<p class="mutes">Sin fotos: sube la primera.</p>';
  } catch (e) { box.innerHTML = '<p class="mutes">✕ ' + e.message + '</p>'; }
}

function vistaPreviaFoto() {
  const inp = document.getElementById('fotoFile');
  const prev = document.getElementById('fotoPreview');
  if (inp.files && inp.files[0]) {
    prev.src = URL.createObjectURL(inp.files[0]);
    prev.hidden = false;
  } else prev.hidden = true;
}

async function subirFoto() {
  const msg = document.getElementById('fotoMsg');
  msg.className = 'admin-msg';
  const inp = document.getElementById('fotoFile');
  if (!inp.files || !inp.files[0]) { msg.textContent = 'Elige un archivo primero.'; return; }
  msg.textContent = 'Subiendo…';
  try {
    const fd = new FormData();
    fd.append('producto_id', fotoPid);
    fd.append('foto', inp.files[0]);
    const r = await fetch('api/admin-imagen', { method: 'POST', body: fd });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje;
    inp.value = '';
    document.getElementById('fotoPreview').hidden = true;
    cargarFotos();
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function fotoPrincipal(imgId) {
  const msg = document.getElementById('fotoMsg');
  try {
    const r = await fetch('api/admin-imagen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'principal', imagen_id: imgId })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    cargarFotos();
  } catch (e) { msg.textContent = '✕ ' + e.message; }
}

async function eliminarFoto(imgId) {
  if (!confirm('¿Eliminar esta foto?')) return;
  const msg = document.getElementById('fotoMsg');
  try {
    const r = await fetch('api/admin-imagen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', imagen_id: imgId })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Error.');
    msg.className = 'admin-msg ok';
    msg.textContent = '✓ ' + d.mensaje;
    cargarFotos();
  } catch (e) {
    msg.className = 'admin-msg';
    msg.textContent = '✕ ' + e.message;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { cerrarModalNuevo(); cerrarModalEditar(); cerrarModalFoto(); }
});

document.addEventListener('DOMContentLoaded', iniciar);
