import axios from 'axios';
import pLimit from 'p-limit';

// ========================= //
// Configuración global
// ========================= //
const siteUrl = 'https://vorx.es/paraiso/wp-json/wc/v3/products';
const consumerKey = 'ck_1b796be20210995e2ef2f2aaf93c3e5e7a95dd8e';
const consumerSecret = 'cs_722f766c8eb9db857e250854cc0dd84de1ad9410';
const limit = pLimit(5); // Máximo 5 tareas simultáneas

const atributosCache = new Map();
const terminosAsegurados = new Map();
const slugTerminoCache = new Map();

const categoryMap = {
  "ACBFIBA": 42,
  "F1": 43,
  "Futbol": 39,
};

// ========================= //
// Funciones utilitarias
// ========================= //
function parseCsvRow(row) {
  const result = [];
  let inQuotes = false, value = '';
  for (let i = 0; i < row.length; i++) {
    const char = row[i], nextChar = row[i + 1];
    if (char === '"' && inQuotes && nextChar === '"') { value += '"'; i++; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(value); value = ''; }
    else value += char;
  }
  result.push(value);
  return result;
}

function quitarAcentos(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarNombre(str) {
  return quitarAcentos(str).toLowerCase().trim();
}

function slugify(str) {
  return quitarAcentos(str).toLowerCase().trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

// ========================= //
// WooCommerce API helpers
// ========================= //
async function obtenerOCrearAtributoGlobal(nombre) {
  if (atributosCache.has(nombre)) return atributosCache.get(nombre);
  const slug = slugify(nombre);

  const res = await axios.get(`${siteUrl}/attributes`, {
    auth: { username: consumerKey, password: consumerSecret },
    params: { per_page: 100 }
  });

  const encontrado = res.data.find(a => normalizarNombre(a.name) === normalizarNombre(nombre));
  if (encontrado) {
    atributosCache.set(nombre, encontrado.id);
    return encontrado.id;
  }

  const createRes = await axios.post(`${siteUrl}/attributes`, {
    name: nombre, slug
  }, {
    auth: { username: consumerKey, password: consumerSecret }
  });

  atributosCache.set(nombre, createRes.data.id);
  console.log(`✅ Atributo creado: ${nombre}`);
  return createRes.data.id;
}

async function asegurarTerminosAtributo(attributeId, opciones) {
  const key = `${attributeId}-${opciones.join(',')}`;
  if (terminosAsegurados.has(key)) return;

  const existentes = await axios.get(`${siteUrl}/attributes/${attributeId}/terms`, {
    auth: { username: consumerKey, password: consumerSecret },
    params: { per_page: 100 }
  });

  const existentesSlugs = existentes.data.map(t => slugify(t.name));
  for (const opcion of opciones) {
    const slug = slugify(opcion);
    if (!existentesSlugs.includes(slug)) {
      try {
        await axios.post(`${siteUrl}/attributes/${attributeId}/terms`, { name: opcion }, {
          auth: { username: consumerKey, password: consumerSecret }
        });
      } catch (err) {
        console.warn(`⚠️ No se pudo crear término "${opcion}":`, err.message);
      }
    }
  }

  terminosAsegurados.set(key, true);
}

async function obtenerSlugTermino(attributeId, nombre) {
  const cacheKey = `${attributeId}-${nombre}`;
  if (slugTerminoCache.has(cacheKey)) return slugTerminoCache.get(cacheKey);

  const response = await axios.get(`${siteUrl}/attributes/${attributeId}/terms`, {
    auth: { username: consumerKey, password: consumerSecret },
    params: { per_page: 100 }
  });

  for (const t of response.data) {
    if (normalizarNombre(t.name) === normalizarNombre(nombre)) {
      slugTerminoCache.set(cacheKey, t.slug);
      return t.slug;
    }
  }

  console.warn(`⚠️ Término no encontrado: "${nombre}" (ID ${attributeId})`);
  return null;
}

async function obtenerOCrearCategoria(nombreCategoria) {
  const slug = slugify(nombreCategoria);

  const res = await axios.get(`${siteUrl}/categories`, {
    auth: { username: consumerKey, password: consumerSecret },
    params: { per_page: 100, search: nombreCategoria }
  });

  const encontrada = res.data.find(cat => normalizarNombre(cat.name) === normalizarNombre(nombreCategoria));
  if (encontrada) return encontrada.id;

  const createRes = await axios.post(`${siteUrl}/categories`, {
    name: nombreCategoria, slug
  }, {
    auth: { username: consumerKey, password: consumerSecret }
  });

  console.log(`➕ Categoría creada: ${nombreCategoria}`);
  return createRes.data.id;
}

async function generarImagenesDesdeMedia(liga, equipo, edicion) {
  const baseUrl = "https://vorx.es/paraiso/wp-content/uploads/2025/06";
  const imagenes = [];

  for (let i = -1; i <= 10; i++) {
    const nombre = `${liga}-${equipo}-${edicion}-${i === -1 ? "portada" : i}.webp`;
    const url = `${baseUrl}/${nombre}`;
    console.log(`🔍 Comprobando imagen: ${url}`);
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) break;
      imagenes.push({ src: url });
    } catch {
      break;
    }
  }

  return imagenes;
}

async function crearProductoVariable(producto) {
  const res = await axios.post(siteUrl, {
    ...producto,
    purchasable: true,
    tax_status: 'taxable',
    tax_class: 'parent',
    shipping_required: true,
  }, {
    auth: { username: consumerKey, password: consumerSecret }
  });
  console.log("✅ Producto creado:", res.data.id);
  return res.data.id;
}

async function agregarVariacion(productId, atributos, precio, sku) {
  const payload = {
    regular_price: precio,
    sku: sku || undefined,
    attributes: atributos.map(attr => ({
      id: attr.id,
      option: attr.option.trim()
    }))
  };

  try {
    const res = await axios.post(`${siteUrl}/${productId}/variations`, payload, {
      auth: { username: consumerKey, password: consumerSecret }
    });
    console.log(`✔️ Variación creada: ${sku} (${precio})`, res.data.id);
  } catch (err) {
    console.error(`❌ Error variación SKU: ${sku}`, err.response?.data || err.message);
  }
}

// ========================= //
// Main function
// ========================= //
// ...resto del código igual...

async function cargarDatosDesdeSheets(category) {
  const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const csvText = await response.text();
  const rows = csvText.trim().split('\n').slice(0, 20371);
  const headers = parseCsvRow(rows[0]);

  const dataStart = 20185;
  const dataEnd = 20371;

  const data = rows.slice(dataStart, dataEnd).map(row => {
    const cells = parseCsvRow(row);
    return cells.reduce((obj, cell, i) => {
      obj[headers[i]] = cell;
      return obj;
    }, {});
  });

  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    if (!["variable", "variation"].includes(fila["Tipo"]?.toLowerCase())) continue;

    if (fila["Tipo"].toLowerCase() === "variable") {
      const atributos = fila["Atributos"]?.split(",").map(a => a.trim()).filter(Boolean) || [];
      const ediciones = [
        "Local", "Visitante", "Portero", "Alternativa", "Tercera", "Especial",
        "Prepartido", "Local manga larga", "Festival", "Copa", "Coldplay",
        "Edición Especial", "50 aniversario", "100 aniversario"
      ];

      const liga = fila["Categorías"]?.split(" – ")[1] || "";
      const match = fila["Nombre"].match(new RegExp(`\\b(${ediciones.join("|")})\\b`, "i"));

      let equipo = "", edicion = "";
      if (match) {
        const start = fila["Nombre"].indexOf(match[0]);
        equipo = quitarAcentos(fila["Nombre"].substring(0, start).trim()).replace(/\s+/g, "-");
        edicion = quitarAcentos(fila["Nombre"].substring(start).replace(/\d{2}\/\d{2}/, "").trim())
          .replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
      }

      const variaciones = [];
      let j = i + 1;
      while (j < data.length && data[j]["Tipo"]?.toLowerCase() === "variation") {
        variaciones.push(data[j]);
        j++;
      }

      const attributesWithGlobal = {};

      // 🔄 OPTIMIZADO: Resolver atributos en paralelo
      await Promise.all(atributos.map(attr => limit(async () => {
        const attributeId = await obtenerOCrearAtributoGlobal(attr);
        const options = [...new Set(variaciones.map(v => v[attr]?.trim()).filter(Boolean))]; // 👈 MOVER AQUÍ
        await asegurarTerminosAtributo(attributeId, options);
        attributesWithGlobal[attr] = {
          id: attributeId, options, variation: true, visible: true
        };
      })));

      const producto = {
        name: fila["Nombre"],
        type: "variable",
        sku: fila["SKU"],
        status: fila["Publicado"] === "1" ? 'publish' : 'draft',
        catalog_visibility: fila["Visibilidad en el catálogo"] || "visible",
        description: fila["Descripción"],
        categories: [
          { id: categoryMap[category] },
          { id: await obtenerOCrearCategoria(equipo.replace(/-/g, ' ')) }
        ],
        images: await generarImagenesDesdeMedia(liga, equipo, edicion),
        attributes: Object.values(attributesWithGlobal),
        manage_stock: true,
        stock_quantity: 10000,
      };

      const productId = await crearProductoVariable(producto);

      // 🔄 OPTIMIZADO: Crear variaciones en paralelo (limitado a 5 simultáneas)
      await Promise.all(
        variaciones.map(variacion => limit(async () => {
          const precio = variacion["Precio"] || variacion["Precio normal"] || "0";
          const sku = variacion["SKU"];
          const atributosVariacion = [];

          for (const attr of atributos) {
            const valor = variacion[attr];
            if (!valor) continue;
            const slug = await obtenerSlugTermino(attributesWithGlobal[attr].id, valor);
            if (!slug) continue;
            atributosVariacion.push({ id: attributesWithGlobal[attr].id, option: valor.trim() });
          }

          await agregarVariacion(productId, atributosVariacion, precio, sku);
        }))
      );

      i = j - 1;
    }
  }
}


// ========================= //
// Ejecutar
// ========================= //
(async () => {
  await cargarDatosDesdeSheets("Futbol");
})();
