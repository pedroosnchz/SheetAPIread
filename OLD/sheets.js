const axios = require('axios');
const siteUrl = 'https://vorx.es/paraiso/wp-json/wc/v3/products';


const consumerKey = 'ck_1b796be20210995e2ef2f2aaf93c3e5e7a95dd8e';
const consumerSecret = 'cs_722f766c8eb9db857e250854cc0dd84de1ad9410';

function parseCsvRow(row) {
  const result = [];
  let inQuotes = false;
  let value = '';

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    const nextChar = row[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"'; // Escaped quote
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(value);
      value = '';
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
}

const categoryMap = {
  "ACBFIBA": 42,
  "F1": 43,
  "Futbol": 39,
};
async function obtenerSlugTermino(attributeId, nombre) {
  const normalizar = str =>
    str
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .toLowerCase()
      .trim()

  try {
    const response = await axios.get(
      `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
      {
        auth: { username: consumerKey, password: consumerSecret },
        params: { per_page: 100 }
      }
    );


    for (const t of response.data) {
      console.log(`"${t.name}" + ${nombre} con slug "${t.slug}"`);
      if (t.name.toLowerCase() === nombre.toLowerCase()) {
        return t.slug;
      }
    }

    console.warn(`⚠️ Término no encontrado: "${nombre}" (ID ${attributeId})`);
    return null;
  } catch (error) {
    console.error(`❌ Error obteniendo slug del término "${nombre}":`, error.message);
    return null;
  }
}


function quitarAcentos(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarNombre(str) {
  return str
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .toLowerCase()
    .trim();
}

async function obtenerOCrearAtributoGlobal(nombre) {
  const slug = nombre.toLowerCase().replace(/\s+/g, "-");

  const res = await axios.get(
    'https://vorx.es/paraiso/wp-json/wc/v3/products/attributes',
    {
      auth: { username: consumerKey, password: consumerSecret },
      params: { per_page: 100 }
    }
  );

  console.log(`🔍 Buscando atributo global: ${nombre}`, res.data);

  const encontrado = res.data.find(a => normalizarNombre(a.name) === normalizarNombre(nombre));
  if (encontrado) {
    console.log(`📌 Atributo global encontrado: ${encontrado.name}`);
    return encontrado.id;
  }

  // No existe, se crea
  const createRes = await axios.post(
    'https://vorx.es/paraiso/wp-json/wc/v3/products/attributes',
    {
      name: nombre,
      slug: slug
    },
    {
      auth: { username: consumerKey, password: consumerSecret }
    }
  );

  console.log(`✅ Atributo global creado: ${nombre}`);
  return createRes.data.id;
}


function slugify(str) {
  return str
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
}

async function asegurarTerminosAtributo(attributeId, opciones) {
  const existentes = await axios.get(
    `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
    {
      auth: { username: consumerKey, password: consumerSecret },
      params: { per_page: 100 }
    }
  );

  const existentesSlugs = existentes.data.map(t => slugify(t.name));

  for (const opcion of opciones) {
    const slug = slugify(opcion);
    if (!existentesSlugs.includes(slug)) {
      try {
        await axios.post(
          `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
          { name: opcion },
          {
            auth: { username: consumerKey, password: consumerSecret }
          }
        );
        console.log(`➕ Opción añadida: ${opcion} al atributo ID ${attributeId}`);
      } catch (error) {
        // console.warn(`⚠️ No se pudo crear término "${opcion}":`, error.response?.data?.message || error.message);
      }
    }
  }
}

async function cargarDatosDesdeSheets(category) {
  console.log(`Cargando datos para la categoría: ${category}`);
  const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const rows = csvText.trim().split('\n').slice(0, 19567);
  const headers = parseCsvRow(rows[0]);

  const data = rows.slice(19380, 19567).map(row => {
    const cells = parseCsvRow(row);
    return cells.reduce((obj, cell, i) => {
      obj[headers[i]] = cell;
      return obj;
    }, {});
  });
  console.log(`Datos cargados para la categoría: ${category}`, data.length);
  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    console.log(`Procesando fila ${i + 1}/${data.length}:`, fila["Nombre"]);
    if (!fila["Tipo"] || (
      fila["Tipo"].toLowerCase() !== "variable" &&
      fila["Tipo"].toLowerCase() !== "variation"
    )) {
      continue;
    }
    if (fila["Tipo"].toLowerCase() === "variable") {
      const atributos = fila["Atributos"]
        ? fila["Atributos"].split(",").map(attr => attr.trim())
        : [];

      console.log(`Procesando producto variable: ${fila["Nombre"]} con atributos: ${atributos.join(", ")}`);

      const ediciones = [
        "Local", "Visitante", "Portero", "Alternativa", "Tercera", "Especial",
        "Prepartido", "Local manga larga", "Festival", "Copa", "Coldplay",
        "Edición Especial", "50 aniversario", "100 aniversario"
      ];

      const liga = fila["Categorías"].split(" – ")[1];
      const edicionRegex = new RegExp(`\\b(${ediciones.join("|")})\\b`, "i");

      const match = fila["Nombre"].match(edicionRegex);
      let equipo = "", edicion = "";

      if (match) {
        const start = fila["Nombre"].indexOf(match[0]);
        equipo = quitarAcentos(fila["Nombre"].substring(0, start).trim()).replace(/\s+/g, "-");
        const postMatch = fila["Nombre"].substring(start);
        edicion = quitarAcentos(postMatch.replace(/\d{2}\/\d{2}/, "").trim())
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-")
          .toLowerCase();
      }
      console.log(`Liga: ${liga}, Equipo: ${equipo}, Edición: ${edicion}`);

      // ✅ Mover aquí la declaración de variaciones
      const variaciones = [];
      let j = i + 1;
      while (j < data.length && data[j]["Tipo"].toLowerCase() === "variation") {
        variaciones.push(data[j]);
        j++;
      }

      const attributesWithGlobal = {};
      for (const attr of atributos) {
        const attributeId = await obtenerOCrearAtributoGlobal(attr);
        const opciones = variaciones.map(v => v[attr]?.trim()).filter(Boolean);
        await asegurarTerminosAtributo(attributeId, opciones);
        attributesWithGlobal[attr] = {
          id: attributeId,
          options: [...new Set(opciones)],
          variation: true,
          visible: true
        };
      }

      const producto = {
        name: fila["Nombre"],
        type: "variable",
        sku: fila["SKU"],
        status: fila["Publicado"] === "1" ? 'publish' : 'draft',
        catalog_visibility: fila["Visibilidad en el catálogo"] || "visible",
        description: fila["Descripción"],
        // short_description: fila["Descripción"],
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

      for (const variante of variaciones) {
        const precio = variante["Precio"] || variante["Precio normal"] || "0";
        const sku = variante["SKU"];

        const atributosVariacion = [];

        for (const attr of atributos) {
          const valor = variante[attr];
          if (!valor) continue;

          const attrGlobal = attributesWithGlobal[attr]; // ✅ CORRECTO
          // console.log("Atributo global:", attrGlobal);
          if (!attrGlobal) {
            console.warn(`⚠️ No se encontró el atributo global para "${attr}"`);
            continue;
          }

          try {
            const slug = await obtenerSlugTermino(attrGlobal.id, valor);
            if (!slug) {
              console.warn(`⚠️ Término no encontrado: "${valor}" para atributo "${attr}"`);
              continue;
            }

            atributosVariacion.push({
              id: attrGlobal.id,
              option: valor.trim()
            });
          } catch (error) {
            console.error(`❌ Error procesando atributo "${attr}" con valor "${valor}":`, error.message);
            continue;
          }
        }
        console.log("Atributos de variación:", atributosVariacion);


        await agregarVariacion(productId, atributosVariacion, precio, sku);
      }

      i = j - 1;
    }
  }
  // await guardarDatosEnMySQL(data, servidorNombre);
}

async function generarImagenesDesdeMedia(liga, equipo, edicion) {
  const baseUrl = "https://vorx.es/paraiso/wp-content/uploads/2025/06";
  const maxIntentos = 10; // límite de seguridad
  const imagenes = [];

  for (let i = -1; i <= maxIntentos; i++) {

    const url = `${baseUrl}/${liga}-${equipo}-${edicion}-${i == -1 ? "portada" : i}.webp`;
    console.log("Comprobando imagen:", url);
    try {
      const response = await fetch(url, { method: 'HEAD' }); // no descarga, solo comprueba si existe
      if (!response.ok) break; // si no existe, detenemos
      imagenes.push({ src: url });
    } catch (error) {
      break; // error de red u otro → paramos
    }
  }

  return imagenes;
}


async function crearProductoVariable(producto) {
  const response = await axios.post(
    siteUrl,
    {
      name: producto.name,
      type: "variable",
      sku: producto.sku,
      status: producto.status,
      description: producto.description,
      // short_description: producto.short_description,
      catalog_visibility: producto.catalog_visibility,
      categories: producto.categories,
      images: producto.images,
      attributes: producto.attributes.map(attr => ({
        id: attr.id,
        options: attr.options,
        variation: true,
        visible: true
      })),
      manage_stock: true,
      stock_quantity: producto.stock_quantity,
      purchasable: true,
      tax_status: 'taxable',
      tax_class: 'parent',
      shipping_required: true,
    },
    {
      auth: {
        username: consumerKey,
        password: consumerSecret
      }
    }
  );
  console.log("✅ Producto variable creado:", response.data.id);
  return response.data.id;

}


async function agregarVariacion(productId, atributos, precio, sku) {
  const atributosVariacion = [];

  for (const attr of atributos) {


    const attributeId = attr.id;

    atributosVariacion.push({
      id: attributeId,
      option: attr.option.trim()
    });
  }


  const payload = {
    regular_price: precio,
    sku: sku || undefined,
    attributes: atributosVariacion
  };

  console.log("➡️ Enviando variación:", payload);

  try {
    const response = await axios.post(
      `https://vorx.es/paraiso/wp-json/wc/v3/products/${productId}/variations`,
      payload,
      {
        auth: {
          username: consumerKey,
          password: consumerSecret
        }
      }
    );
    console.log(`✔️ Variación creada: ${sku} con precio ${precio}`, response.data.id);
  } catch (error) {
    console.error(`❌ Error al crear variación para SKU: ${sku}`, error.response?.data || error.message);
  }
}

// for (const category of categories) {
//   cargarDatosDesdeSheets(category)
//     .then(data => {
//       console.log(`Datos cargados para la categoría: ${category}`);
//       console.log(data[1]);
//     })
//     .catch(error => {
//       console.error(`Error al cargar datos para la categoría ${category}:`, error);
//     });
// }


async function obtenerOCrearCategoria(nombreCategoria) {
  const slug = slugify(nombreCategoria);

  try {
    const res = await axios.get(
      'https://vorx.es/paraiso/wp-json/wc/v3/products/categories',
      {
        auth: { username: consumerKey, password: consumerSecret },
        params: { per_page: 100, search: nombreCategoria }
      }
    );

    const encontrada = res.data.find(cat => normalizarNombre(cat.name) === normalizarNombre(nombreCategoria));
    if (encontrada) {
      console.log(`📌 Categoría encontrada: ${nombreCategoria}`);
      return encontrada.id;
    }

    // No existe, se crea
    const createRes = await axios.post(
      'https://vorx.es/paraiso/wp-json/wc/v3/products/categories',
      {
        name: nombreCategoria,
        slug: slug
      },
      {
        auth: { username: consumerKey, password: consumerSecret }
      }
    );
    console.log(`➕ Categoría creada: ${nombreCategoria}`);
    return createRes.data.id;
  } catch (error) {
    console.error(`❌ Error al obtener/crear categoría "${nombreCategoria}":`, error.message);
    return null;
  }
}

async function getProduct() {
  try {
    const response = await axios.get(siteUrl, {
      auth: {
        username: consumerKey,
        password: consumerSecret
      },
      params: {
        per_page: 100,
        type: "variable"
      }
    });
    return response.data.length
  } catch (error) {
    console.error('Error al obtener productos:', error);
    throw error;
  }
}

(async () => {
  // console.log(await cargarDatosDesdeSheets("Futbol"));
  await cargarDatosDesdeSheets("Futbol");
  // console.log(await getProduct());
})();





