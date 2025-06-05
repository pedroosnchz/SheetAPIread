// import axios from 'axios';

const siteUrl = 'https://paraisodeldeporte.com/wp-json/wc/v3/products';
const consumerKey = 'ck_xxxxx';
const consumerSecret = 'cs_xxxxx';

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
  return data;
  // await guardarDatosEnMySQL(data, servidorNombre);
}

for (const category of categories) {
  cargarDatosDesdeSheets(category)
    .then(data => {
      console.log(`Datos cargados para la categoría: ${category}`);
      console.log(data[3])
      // Aquí puedes procesar los datos como necesites
    })
    .catch(error => {
      console.error(`Error al cargar datos para la categoría ${category}:`, error);
    });
}

