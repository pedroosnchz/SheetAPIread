import axios from 'axios';

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
  "F1": 43
};

async function cargarDatosDesdeSheets(category) {
  const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const rows = csvText.trim().split('\n').slice(0, 9);
  const headers = parseCsvRow(rows[0]);

  const data = rows.slice(1).map(row => {
    const cells = parseCsvRow(row);
    return cells.reduce((obj, cell, i) => {
      obj[headers[i]] = cell;
      return obj;
    }, {});
  });
  for (let i = 0; i < data.length; i++) {
    const fila = data[i];
    if (fila["Tipo"].toLowerCase() === "variable") {
      const atributos = fila["Atributos"]
        ? fila["Atributos"].split(",").map(attr => attr.trim())
        : [];
  
      const producto = {
        name: fila["Nombre"],
        type: "variable",
        sku: fila["SKU"],
        regular_price: fila["Precio normal"],
        status: fila["Publicado"] === "1" ? 'publish' : 'draft',
        catalog_visibility: fila["Visibilidad en el catálogo"] || "visible",
        description: fila["Descripción"],
        short_description: fila["Descripción corta"],
        categories: [{ id: categoryMap[category] }],
        images: fila["Imágenes"]
          ? fila["Imágenes"].split(",").map(url => ({ src: url.trim() }))
          : [],
        attributes: atributos.map(attr => ({
          name: attr,
          options: fila[attr] ? fila[attr].split(",").map(opt => opt.trim()) : []
        })),
        stock_quantity: fila["Inventario"] || 10000,
      };
  
      const productId = await crearProductoVariable(producto);
  
      // Por cada combinación de atributos → crear variaciones
      for (const attr of producto.attributes) {
        for (const option of attr.options) {
          await agregarVariacion(productId, attr.name, option, fila["Precio normal"] || "0");
        }
      }
    } else {
      // Producto simple
      await axios.post(siteUrl, {
        name: fila["Nombre"],
        type: "simple",
        regular_price: fila["Precio normal"],
        sku: fila["SKU"],
        status: fila["Publicado"] === "1" ? 'publish' : 'draft',
        catalog_visibility: fila["Visibilidad en el catálogo"] || "visible",
        description: fila["Descripción"],
        short_description: fila["Descripción corta"],
        categories: [{ id: categoryMap[category] }],
        images: fila["Imágenes"]
          ? fila["Imágenes"].split(",").map(url => ({ src: encodeURIComponent(url.trim()) }))
          : [],
        manage_stock: true,
        stock_quantity: fila["Inventario"] || 10,
      }, {
        auth: { username: consumerKey, password: consumerSecret }
      });
  
      console.log(`✅ Producto simple creado: ${fila["Nombre"]}`);
    }
  }
  // await guardarDatosEnMySQL(data, servidorNombre);
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


async function agregarVariacion(productId, attrName, optionValue, precio) {
  const response = await axios.post(
    `https://vorx.es/paraiso/wp-json/wc/v3/products/${productId}/variations`,
    {
      regular_price: precio,
      attributes: [
        {
          name: attrName,
          option: optionValue
        }
      ]
    },
    {
      auth: {
        username: consumerKey,
        password: consumerSecret
      }
    }
  );
  console.log(`✔️ Variación añadida: ${attrName} = ${optionValue}`, response.data.id);
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

console.log(await cargarDatosDesdeSheets(categoryMap["F1"]));
// console.log(await getProduct())





