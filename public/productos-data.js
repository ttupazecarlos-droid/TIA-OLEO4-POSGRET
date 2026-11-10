/* ===========================================================
   PRODUCTOS DATA - Base de datos del catalogo
   -----------------------------------------------------------
   Este archivo contiene un array con todos los productos de
   la tienda Tia Oleo. Cada producto tiene:
   - categoria: Used by script.js to group products into sections
   - nombre: Nombre visible del producto
   - descripcion: Texto descriptivo corto
   - precio: Precio en Soles peruanos (PEN)
   - imagen: Ruta relativa a la imagen del producto

   Los precios se almacenan en Soles (PEN) como moneda base.
   La conversion a otras monedas se hace en tiempo real por
   script.js usando las tasas de puente-digital.js.
   =========================================================== */

const productos = [
  // ==========================================
  // CATEGORIA: Papeles y Blocs
  // Blocs de papel para dibujo, pintura y calco
  // ==========================================
  {
    categoria: "Papeles y Blocs",
    nombre: "Bloc para Pintar con Acrílicos",
    descripcion: "Papel canvas-textura para pinturas acrílicas y técnicas mixtas.",
    precio: 46,
    imagen: "img/01-bloc-papel-canvas.jpg",
  },
  {
    categoria: "Papeles y Blocs",
    nombre: "Block de Dibujo",
    descripcion: "Papel de calidad superior para dibujo con lápiz, carbón y técnica mixta.",
    precio: 18,
    imagen: "img/02-block-dibujo.jpg",
  },
  {
    categoria: "Papeles y Blocs",
    nombre: "Block de Papel Calco",
    descripcion: "Papel calco de alta transparencia para calcar dibujos y diseños.",
    precio: 15,
    imagen: "img/06-block-papel-calco.jpg",
  },
  {
    categoria: "Papeles y Blocs",
    nombre: "Block de Papel Calidad Superior",
    descripcion: "Papel profesional con textura ideal para dibujo y técnica mixta.",
    precio: 35,
    imagen: "img/10-block-papel-calidad-superior.jpg",
  },
  {
    categoria: "Papeles y Blocs",
    nombre: "Block de Dibujo Calidad Superior",
    descripcion: "Papel blanco de superficie satinada, ideal para rotuladores y lápices.",
    precio: 30,
    imagen: "img/20-block-dibujo-calidad.png",
  },

  // ==========================================
  // CATEGORIA: Cuadernos y Croqueras
  // Sketchbooks, croqueras y cuadernos de boceto
  // ==========================================
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Blank Book",
    descripcion: "Cuaderno en blanco para notas, bocetos y creatividad libre.",
    precio: 25,
    imagen: "img/07-croquera-blank-book.jpg",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Cuadrada - Forest Green",
    descripcion: "Cuaderno cuadrado con tapa verde bosque, perfecto para bocetos.",
    precio: 28,
    imagen: "img/08-croquera-cuadrada-forest.jpg",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Diseño Moda",
    descripcion: "Cuaderno especial para bocetos de diseño de moda y croquis.",
    precio: 32,
    imagen: "img/09-croquera-diseno-moda.png",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Hoja Negra Premium",
    descripcion: "Cuaderno sketchbook con hojas negras premium para lápices de colores claros.",
    precio: 40,
    imagen: "img/11-croquera-hoja-negra.png",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Mediana Negra",
    descripcion: "Cuaderno de tamaño mediano con tapa negra, ideal para llevar a todos lados.",
    precio: 22,
    imagen: "img/13-croquera-mediana-negra.jpg",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Premium 24 Hojas",
    descripcion: "Sketchbook premium con 24 hojas de papel de alta calidad.",
    precio: 36,
    imagen: "img/14-croquera-premium.jpg",
  },
  {
    categoria: "Cuadernos y Croqueras",
    nombre: "Croquera Sketch",
    descripcion: "Cuaderno de croquis con hojas de calidad para artistas y diseñadores.",
    precio: 26,
    imagen: "img/18-croquera-sketch.png",
  },

  // ==========================================
  // CATEGORIA: Pinturas
  // Acuarelas y pinturas acrilicas en tubo
  // ==========================================
  {
    categoria: "Pinturas",
    nombre: "Acuarelas Lavables Multi Colores",
    descripcion: "Set de acuarelas lavables con una gama de colores vibrantes.",
    precio: 38,
    imagen: "img/04-acuarelas-lavables.png",
  },
  {
    categoria: "Pinturas",
    nombre: "Set 12 Pinturas Acrílicas - Colores Pasteles",
    descripcion: "12 tubos de pintura acrílica en tonos pastel. Incluye 2 pinceles.",
    precio: 55,
    imagen: "img/05-pinturas-acrilicas-pasteles.png",
  },
  {
    categoria: "Pinturas",
    nombre: "Set 12 Pinturas Acrílicas",
    descripcion: "Set completo de 12 pinturas acrílicas con colores surtidos de alta calidad.",
    precio: 48,
    imagen: "img/19-set-12-pinturas-acrilicas.jpg",
  },

  // ==========================================
  // CATEGORIA: Pinceles y Marcadores
  // Sets de pinceles para distintas tecnicas
  // y marcadores de doble punta
  // ==========================================
  {
    categoria: "Pinceles y Marcadores",
    nombre: "Set 12 Pinceles para Acuarela y Acrílicos",
    descripcion: "Pinceles de calidad profesional con cerdas de nylon. Férula de doble rizo.",
    precio: 42,
    imagen: "img/03-set-pinceles-acuarela.jpg",
  },
  {
    categoria: "Pinceles y Marcadores",
    nombre: "Set 12 Pinceles para Acrílicos",
    descripcion: "Pinceles de cerda sintética para pintura acrílica, variedad de puntas y tamaños.",
    precio: 35,
    imagen: "img/15-set-12-pinceles.jpg",
  },
  {
    categoria: "Pinceles y Marcadores",
    nombre: "Set 18 Marcadores Doble Punta - Rainbow",
    descripcion: "Marcadores con doble punta para detalle y cobertura amplia. Colores arcoíris.",
    precio: 68,
    imagen: "img/12-set-marcadores-doble-punta.jpg",
  },

  // ==========================================
  // CATEGORIA: Lapices de Colores
  // Sets de lapices de colores en caja
  // ==========================================
  {
    categoria: "Lápices de Colores",
    nombre: "Set 30 Lápices Colores",
    descripcion: "30 lápices de colores con pigmentos de alto rendimiento y fácil mezcla.",
    precio: 50,
    imagen: "img/16-set-30-lapices-colores.png",
  },
  {
    categoria: "Lápices de Colores",
    nombre: "Caja de 50 Lápices Deluxe",
    descripcion: "50 lápices de colores en caja de metal. Pigmentos de alto rendimiento, suaves y fáciles de mezclar.",
    precio: 95,
    imagen: "img/17-caja-50-lapices-deluxe.jpg",
  },
];
