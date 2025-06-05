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

const categories = [
  "ACBFIBA",
  "F1"
]

async function cargarDatosDesdeSheets(category) {
  const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  const rows = csvText.trim().split('\n');
  const headers = parseCsvRow(rows[0]);

  const data = rows.slice(1).map(row => {
    const cells = parseCsvRow(row);
    return cells.reduce((obj, cell, i) => {
      obj[headers[i]] = cell;
      return obj;
    }, {});
  });
  for(let i=0;i<data.length;i++){
    const producto = {
      name: data[i]["Nombre"],
      type: data[i]["Tipo"],
      price: data[i]["Precio Normal"],
      regular_price: data[i]["Precio normal"],
      sku: data[i]["SKU"],
      status: data[i]["Publicado"] === 1 ? 'publish' : 'draft',
      catalog_visibility: data[i]["Visibilidad en el catálogo"] === "visible" ? "true" : "false",
      description: data[i]["Descripción"],
      short_description: data[i]["Descripción corta"],
      categories: [category],
      images: [
        data[i]["Imágenes"].split(",")
      ],
      attributes: [
        data[i]["Atributos"].split(",").map(attr => ({
          name: attr.trim(),
          options: data[i][attr].split(",").map(option => option.trim())
        }))
      ],
      purchasable: true,
      tax_status: 'taxable',
      tax_class: 'parent',
      shipping_required: true,
    };

    await crearProductoVariable(producto);
    for(let j=0;j < producto.attributes.length; j++){
      console.log(producto.attributes[j])
      for(let k=1;k < producto.attributes[j].length; k++){
        await crearProductoVariable(data[i + k]);
        i++
      }
    }
  }
  // await guardarDatosEnMySQL(data, servidorNombre);
}

async function crearProductoVariable(producto) {
  try {
    const res = await axios.post(siteUrl, producto, {
      auth: {
        username: consumerKey,
        password: consumerSecret
      }
    });

    const productId = res.data.id;
    console.log('✅ Producto base creado:', productId);

    // Crear variaciones
    const variaciones = [];
    for (let talla of product.attributes[0].options) {
      for (let serigrafia of producto.attributes[1].options) {
        variaciones.push({
          regular_price: '29.99',
          manage_stock: true,
          stock_quantity: 5,
          attributes: [
            { name: 'Talla', option: talla },          ]
        });
      }
    }

    for (const variacion of variaciones) {
      const url = `${siteUrl}/${productId}/variations`;
      const vres = await axios.post(url, variacion, {
        auth: {
          username: consumerKey,
          password: consumerSecret
        }
      });
      console.log('✔️ Variación creada:', vres.data.id);
    }
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
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

console.log(await cargarDatosDesdeSheets(categories))
// console.log(await getProduct())





