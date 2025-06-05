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
  await cargarDatosDesdeSheets(category)
    .then(data => {
      console.log(`Datos cargados para la categoría: ${category}`);
      console.log(data[0])
      // Aquí puedes procesar los datos como necesites
    })
    .catch(error => {
      console.error(`Error al cargar datos para la categoría ${category}:`, error);
    });
}

// async function guardarDatosEnMySQL(data, servidorNombre) {
//   const nuevoClientes = []; // ✅ mover aquí
//   console.log(`🔍 Verificando si el servidor ${servidorNombre} existe...`);

//   // 🔥 Buscar o crear el servidor
//   let servidor = await prisma.servidor.findFirst({
//     where: { nombre: servidorNombre },
//   });

//   if (!servidor) {
//     console.log(`🚀 Creando servidor ${servidorNombre}...`);
//     servidor = await prisma.servidor.create({
//       data: {
//         nombre: servidorNombre,
//         capacidad: null, // Valor por defecto
//         sistema: null,
//         enlace: null,
//         usuario: null,
//         password: null,
//         dns1: null,
//         dns2: null,
//         ip: null,
//         webmail: null,
//         servidorCorreo: null,
//       }
//     });
//   }

//   console.log(`✅ Servidor ${servidorNombre} (ID: ${servidor.id}) confirmado.`);

//   for (const cliente of data) {
//     let clienteID = cliente['CLIENTE ID'];

//     let clienteExistente = await prisma.cliente.findFirst({
//       where: { clienteId: clienteID, servidorId: servidor.id },
//       include: { hostings: true } // 🔥 Para verificar favicons
//     });

//     let faviconVar = `https://s.w.org/favicon.ico`; // Fallback

//     if (clienteExistente && clienteExistente.hostings.length > 0) {
//       const posibleFavicon = `https://${clienteExistente.hostings[0].nombre}/favicon.ico`;
//       faviconVar = await downloadFavicon(posibleFavicon, clienteExistente.nombre, 'clientes');
//     }

//     if (!clienteExistente) {
//       clienteExistente = await prisma.cliente.create({
//         data: {
//           clienteId: clienteID,
//           servidorId: servidor.id,
//           nombre: cliente['NOMBRE DEL CLIENTE'],
//           correo: cliente['CONTACTO DE EMAIL'],
//           favicon: null,
//           alCorrienteDePagos: true,
//           accountId: null,
//           paqueteId: null
//         }
//       });
//       nuevoClientes.push(clienteExistente);
//     } else {
//       await prisma.cliente.update({
//         where: { id: clienteExistente.id },
//         data: {
//           alCorrienteDePagos: clienteExistente.alCorrienteDePagos ?? true,
//           accountId: clienteExistente.accountId ?? null,
//           paqueteId: clienteExistente.paqueteId ?? null,
//           favicon: clienteExistente.favicon || faviconVar
//         }
//       });
//     }

//     // 🔥 Procesar Hostings
//     if (cliente['TIPO DE SERVICIO'] === 'Dominio') {
//       const hostingFavicon = await downloadFavicon(`https://${cliente['NOMBRE DEL SERVICIO']}/favicon.ico`, cliente['NOMBRE DEL SERVICIO'], 'hostings');

//       await prisma.hosting.upsert({
//         where: {
//           clienteId_servidorId_nombre: {
//             clienteId: clienteExistente.clienteId,
//             servidorId: servidor.id,
//             nombre: cliente['NOMBRE DEL SERVICIO']
//           }
//         },
//         update: {
//           estado: cliente['ESTADO'],
//           size: parseFloat(cliente['TAMAñO (MB)'].replace(',', '.')) || 0,
//           openprovider: cliente['OPENPROVIDER'],
//           apuntando: cliente['APUNTANDO AL SERVIDOR'],
//           dns: cliente['NAMESERVERS'],
//           phpVersion: cliente['PHP'],
//           favicon: hostingFavicon
//         },
//         create: {
//           clienteId: clienteExistente.clienteId,
//           servidorId: servidor.id,
//           nombre: cliente['NOMBRE DEL SERVICIO'],
//           estado: cliente['ESTADO'],
//           size: parseFloat(cliente['TAMAñO (MB)'].replace(',', '.')) || 0,
//           openprovider: cliente['OPENPROVIDER'],
//           precio: null,
//           apuntando: cliente['APUNTANDO AL SERVIDOR'],
//           dns: cliente['NAMESERVERS'],
//           phpVersion: cliente['PHP'],
//           favicon: hostingFavicon
//         }
//       });
//     }

//     // 🔥 Procesar Dominios si OPENPROVIDER es "Sí"
//     if (cliente['OPENPROVIDER'] === 'Sí') {
//       await prisma.dominio.upsert({
//         where: {
//           dominio: cliente['NOMBRE DEL SERVICIO']
//         },
//         update: {
//           // Actualiza otros campos según necesites, por ejemplo:
//           nombre: cliente['NOMBRE DEL SERVICIO'],
//           clienteId: clienteExistente.clienteId,
//           servidorId: servidor.id
//         },
//         create: {
//           clienteId: clienteExistente.clienteId,
//           servidorId: servidor.id,
//           nombre: cliente['NOMBRE DEL SERVICIO'],
//           dominio: cliente['NOMBRE DEL SERVICIO'],
//           precio: null
//         }
//       });
//     }

//     // 🔥 Procesar Mail Hosting
//     if (cliente['TIPO DE SERVICIO'] === 'Mail domain') {
//       await prisma.mailHosting.upsert({
//         where: {
//           clienteId_servidorId_nombre: {
//             clienteId: clienteExistente.clienteId,
//             servidorId: servidor.id,
//             nombre: cliente['NOMBRE DEL SERVICIO']
//           }
//         },
//         update: {
//           estado: cliente['ESTADO'],
//           size: parseFloat(cliente['TAMAñO (MB)'].replace(',', '.')) || 0,
//           apuntando: cliente['APUNTANDO AL SERVIDOR'],
//           dns: cliente['NAMESERVERS'],
//           numeroDeCorreos: parseInt(cliente['NUMERO DE SERVICIOS'], 10) || 0
//         },
//         create: {
//           clienteId: clienteExistente.clienteId,
//           servidorId: servidor.id,
//           nombre: cliente['NOMBRE DEL SERVICIO'],
//           estado: cliente['ESTADO'],
//           precio: null,
//           size: parseFloat(cliente['TAMAñO (MB)'].replace(',', '.')) || 0,
//           apuntando: cliente['APUNTANDO AL SERVIDOR'],
//           dns: cliente['NAMESERVERS'],
//           numeroDeCorreos: parseInt(cliente['NUMERO DE SERVICIOS'], 10) || 0
//         }
//       });
//     }
//   }

//   console.log(`✅ Datos de ${servidorNombre} sincronizados con MySQL.`);
//   await obtenerDominios();  // Llamar a la función obtenerDominios después de completar la sincronización de datos



//   if (nuevoClientes.length > 0) {
//     const destinatario = "angel.alcala@omibu.com";

//     await resend.emails.send({
//       from: "ómibu <onboarding@resend.dev>",
//       to: destinatario,
//       subject: `📥 Nuevos clientes importados desde ${servidorNombre}`,
//       react: NuevosClientesEmail({ servidor: servidorNombre, clientes: nuevoClientes }),
//     });

//     console.log(`✉️ Email enviado con ${nuevoClientes.length} nuevos clientes`);
//   }
// }

// export { cargarDatosDesdeSheets };
