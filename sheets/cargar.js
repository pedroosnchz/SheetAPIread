import { parseCsvRow } from '../utils/csv.js';
import { quitarAcentos } from '../utils/string.js';
import { categoryMap, obtenerOCrearCategoria } from '../woocommerce/categorias.js';
import { obtenerOCrearAtributoGlobal, asegurarTerminosAtributo, obtenerSlugTermino } from '../woocommerce/atributos.js';
import { generarImagenesDesdeMedia } from '../woocommerce/imagenes.js';
import { crearProductoVariable, agregarVariacion } from '../woocommerce/productos.js';

export async function cargarDatosDesdeSheets(category) {
    console.log(`Cargando datos para la categoría: ${category}`);
    const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvText = await response.text();
    const rows = csvText.trim().split('\n').slice(0, 14285);
    const headers = parseCsvRow(rows[0]);

    const data = rows.slice(12760, 14285).map(row => {
        const cells = parseCsvRow(row);
        return cells.reduce((obj, cell, i) => {
            obj[headers[i]] = cell;
            return obj;
        }, {});
    });

    console.log(`Datos cargados: ${data.length} filas`);

    for (let i = 0; i < data.length; i++) {
        const fila = data[i];
        if (!fila["Tipo"] || (
            fila["Tipo"].toLowerCase() !== "variable" &&
            fila["Tipo"].toLowerCase() !== "variation"
        )) continue;

        if (fila["Tipo"].toLowerCase() === "variable") {
            const atributos = fila["Atributos"]
                ? fila["Atributos"].split(",").map(attr => attr.trim())
                : [];

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

                    const attrGlobal = attributesWithGlobal[attr];
                    if (!attrGlobal) continue;

                    const slug = await obtenerSlugTermino(attrGlobal.id, valor);
                    if (!slug) continue;

                    atributosVariacion.push({
                        id: attrGlobal.id,
                        option: valor.trim()
                    });
                }

                await agregarVariacion(productId, atributosVariacion, precio, sku);
            }

            i = j - 1;
        }
    }
}
