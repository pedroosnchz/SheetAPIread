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
  "Futbol":39,
};

async function cargarDatosDesdeSheets(category) {
  const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const rows = csvText.trim().split('\n').slice(0, 805);
  const headers = parseCsvRow(rows[0]);

  const data = rows.slice(374, 805).map(row => {
    const cells = parseCsvRow(row);
    return cells.reduce((obj, cell, i) => {
      obj[headers[i]] = cell;
      return obj;
    }, {});
  });
  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    if (!fila["Tipo"] || (
      fila["Tipo"].toLowerCase() !== "variable" &&
      fila["Tipo"].toLowerCase() !== "variation"
    )) {
      continue;
    }
    if (fila["Tipo"].toLowerCase() === "variable") {
      // Extraemos atributos definidos en la fila padre
      const atributos = fila["Atributos"]
        ? fila["Atributos"].split(",").map(attr => attr.trim())
        : [];
      const ediciones = [
        "Local",
        "Visitante",
        "Portero",
        "Alternativa",
        "Tercera",
        "Especial",
        "Prepartido",
        "Local manga larga",
        "Festival",
        "Copa",
        "Coldplay",
        "Edición Especial",
        "50 aniversario",
        "100 aniversario"
      ];
      console.log(fila["Categorías"])
      const liga = fila["Categorías"].split(" – ")[1];
      const edicionRegex = new RegExp(`\\b(${ediciones.join("|")})\\b`, "i");

      const match = fila["Nombre"].match(edicionRegex);
      const equipo = fila["Nombre"]
      .split(edicionRegex)[0]            // Corta hasta antes de la edición
      .trim()                             // Elimina espacios al principio y final
      .normalize("NFD")                   // Quita acentos
      .replace(/[\u0300-\u036f]/g, "")    // Quita tildes
      .replace(/\s+/g, "-");    

      let edicion = match ? match[0].trim() : "";
      if (match) {
        const start = fila["Nombre"].indexOf(match[0]);
        const postMatch = fila["Nombre"].substring(start);
        edicion = postMatch.replace(/\d{2}\/\d{2}$/, "").trim(); // quita el año si lo hay
      }
      // Creamos el producto padre
      const producto = {
        name: fila["Nombre"],
        type: "variable",
        sku: fila["SKU"],
        status: fila["Publicado"] === "1" ? 'publish' : 'draft',
        catalog_visibility: fila["Visibilidad en el catálogo"] || "visible",
        description: fila["Descripción"],
        short_description: fila["Descripción corta"],
        categories: [{ id: categoryMap[category] }],
        images: await generarImagenesDesdeMedia(liga, equipo, edicion),
        attributes: atributos.map(attr => ({
          name: attr,
          options: [], // se llenará después con todas las opciones encontradas
          variation: true,
          visible: true
        })),
        manage_stock: true,
        stock_quantity: 10000,
      };
  
      // Recolectamos variaciones
      const variaciones = [];
  
      let j = i + 1;
      while (j < data.length && data[j]["Tipo"].toLowerCase() === "variation") {
        
        variaciones.push(data[j]);
        j++;
      }
  
      // Llenamos las opciones posibles para cada atributo
      for (const attr of producto.attributes) {
        const opciones = variaciones.map(v => v[attr.name]?.trim()).filter(Boolean);
        attr.options = [...new Set(opciones)];
      }
  
      const productId = await crearProductoVariable(producto);
  
      // Crear cada variación con precio individual
      for (const variante of variaciones) {
        const precio = variante["Precio"] || variante["Precio normal"] || "0";
        const sku = variante["SKU"];
  
        const atributosVariacion = atributos.map(attr => ({
          name: attr,
          option: variante[attr]?.trim()
        }));
  
        await agregarVariacion(productId, atributosVariacion, precio, sku);
      }
  
      // Avanzamos el índice hasta el último hijo
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
      short_description: producto.short_description,
      catalog_visibility: producto.catalog_visibility,
      categories: producto.categories,
      images: producto.images,
      attributes: producto.attributes.map(attr => ({
        name: attr.name,
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


async function agregarVariacion(productId, attributes, precio, sku) {
  const response = await axios.post(
    `https://vorx.es/paraiso/wp-json/wc/v3/products/${productId}/variations`,
    {
      regular_price: precio,
      sku: sku || undefined,
      attributes
    },
    {
      auth: {
        username: consumerKey,
        password: consumerSecret
      }
    }
  );
  console.log(`✔️ Variación creada: ${sku} con precio ${precio}`, response.data.id);

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


async function getProduct(){
  try {
    const response = await axios.get(siteUrl, {
      auth: {
        username: consumerKey,
        password: consumerSecret
      },
      params: {
        per_page: 100,
        type:"variable"
      }
    });
    return response.data.length
  } catch (error) {
    console.error('Error al obtener productos:', error);
    throw error;
  }
}

(async () => {
  console.log(await cargarDatosDesdeSheets("Futbol"));
  // console.log(await getProduct());
})();





