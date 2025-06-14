import { parseCsvRow } from '../utils/csv.js';
import { quitarAcentos } from '../utils/string.js';
import { categoryMap, obtenerOCrearCategoria } from '../woocommerce/categorias.js';
import { obtenerOCrearAtributoGlobal, asegurarTerminosAtributo, obtenerSlugTermino } from '../woocommerce/atributos.js';
import { generarImagenesDesdeMedia } from '../woocommerce/imagenes.js';
import { crearProductoVariable, agregarVariacion } from '../woocommerce/productos.js';
import pLimit from 'p-limit';

const atributoCache = new Map();
const slugTerminoCache = new Map();
const limit = pLimit(5); // Máximo 5 peticiones simultáneas

export async function cargarDatosDesdeSheets(category) {
    const sheetId = '1N0RRAfur6Ue3MoiUgly9BmXS6lEoBR_jq7MU7qJxDoY';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${category}`;

    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvText = await response.text();
    const rows = csvText.trim().split('\n').slice(19380, 14285);
    const headers = parseCsvRow(rows[0]);

    const data = rows.slice(1).map(row => {
        const cells = parseCsvRow(row);
        return cells.reduce((obj, cell, i) => {
            obj[headers[i]] = cell;
            return obj;
        }, {});
    });

    const ediciones = [
        "Local", "Visitante", "Portero", "Alternativa", "Tercera", "Especial",
        "Prepartido", "Local manga larga", "Festival", "Copa", "Coldplay",
        "Edición Especial", "50 aniversario", "100 aniversario"
    ];
    const edicionRegex = new RegExp(`\\b(${ediciones.join("|")})\\b`, "i");

    for (let i = 0; i < data.length; i++) {
        const fila = data[i];
        if (!fila["Tipo"]?.toLowerCase().match(/^(variable|variation)$/)) continue;

        if (fila["Tipo"].toLowerCase() === "variable") {
            const atributos = fila["Atributos"]?.split(",").map(attr => attr.trim()) || [];
            const liga = fila["Categorías"]?.split(" – ")[1] || "";
            const match = fila["Nombre"].match(edicionRegex);

            let equipo = "", edicion = "";
            if (match) {
                const start = fila["Nombre"].indexOf(match[0]);
                equipo = quitarAcentos(fila["Nombre"].substring(0, start).trim()).replace(/\s+/g, "-");
                edicion = quitarAcentos(
                    fila["Nombre"].substring(start).replace(/\d{2}\/\d{2}/, "").trim()
                ).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
            }

            const variaciones = [];
            let j = i + 1;
            while (j < data.length && data[j]["Tipo"]?.toLowerCase() === "variation") {
                variaciones.push(data[j]);
                j++;
            }

            // 🚀 PARALELIZAR procesamiento de atributos
            const attributesWithGlobal = {};
            await Promise.all(
                atributos.map(async attr => {
                    const id = await obtenerOCrearAtributoGlobal(attr);
                    const opciones = [...new Set(variaciones.map(v => v[attr]?.trim()).filter(Boolean))];
                    await asegurarTerminosAtributo(id, opciones);
                    attributesWithGlobal[attr] = {
                        id, options, variation: true, visible: true
                    };
                })
            );

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

            // 🚀 PARALELIZAR creación de variaciones
            await Promise.all(
                variaciones.map(async variante => {
                    const precio = variante["Precio"] || variante["Precio normal"] || "0";
                    const sku = variante["SKU"];
                    const atributosVariacion = [];

                    for (const attr of atributos) {
                        const valor = variante[attr];
                        if (!valor || !attributesWithGlobal[attr]) continue;

                        try {
                            const slug = await obtenerSlugTermino(attributesWithGlobal[attr].id, valor);
                            if (!slug) return;

                            atributosVariacion.push({
                                id: attributesWithGlobal[attr].id,
                                option: valor.trim()
                            });
                        } catch (err) {
                            console.warn(`❌ Atributo "${attr}" con valor "${valor}" falló:`, err.message);
                        }
                    }

                    if (atributosVariacion.length > 0) {
                        await agregarVariacion(productId, atributosVariacion, precio, sku);
                    }
                })
            );

            i = j - 1;
        }
    }
}
