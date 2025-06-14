import axios from 'axios';
import { auth } from '../config.js';
import { normalizarNombre, slugify } from '../utils/string.js';

const atributoCache = new Map();
const terminosCache = new Map();

export async function obtenerOCrearAtributoGlobal(nombre) {
    const nombreNormalizado = normalizarNombre(nombre);
    if (atributoCache.has(nombreNormalizado)) return atributoCache.get(nombreNormalizado);

    const slug = slugify(nombre);

    const res = await axios.get(
        'https://vorx.es/paraiso/wp-json/wc/v3/products/attributes',
        { auth, params: { per_page: 100 } }
    );

    const encontrado = res.data.find(a => normalizarNombre(a.name) === nombreNormalizado);
    if (encontrado) {
        atributoCache.set(nombreNormalizado, encontrado.id);
        return encontrado.id;
    }

    const createRes = await axios.post(
        'https://vorx.es/paraiso/wp-json/wc/v3/products/attributes',
        { name: nombre, slug },
        { auth }
    );

    atributoCache.set(nombreNormalizado, createRes.data.id);
    return createRes.data.id;
}

export async function asegurarTerminosAtributo(attributeId, opciones) {
    const cacheKey = `attribute-${attributeId}`;
    let existentesSlugs;

    if (terminosCache.has(cacheKey)) {
        existentesSlugs = terminosCache.get(cacheKey);
    } else {
        const existentes = await axios.get(
            `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
            { auth, params: { per_page: 100 } }
        );
        existentesSlugs = existentes.data.map(t => slugify(t.name));
        terminosCache.set(cacheKey, existentesSlugs);
    }

    for (const opcion of opciones) {
        const slug = slugify(opcion);
        if (!existentesSlugs.includes(slug)) {
            try {
                await axios.post(
                    `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
                    { name: opcion },
                    { auth }
                );
                existentesSlugs.push(slug); // actualizar el caché manualmente
            } catch (error) {
                console.warn(`⚠️ No se pudo crear término "${opcion}"`);
            }
        }
    }
}

const slugTerminoCache = new Map();

export async function obtenerSlugTermino(attributeId, nombre) {
    const cacheKey = `${attributeId}-${nombre.toLowerCase()}`;
    if (slugTerminoCache.has(cacheKey)) return slugTerminoCache.get(cacheKey);

    try {
        const response = await axios.get(
            `https://vorx.es/paraiso/wp-json/wc/v3/products/attributes/${attributeId}/terms`,
            { auth, params: { per_page: 100 } }
        );

        for (const t of response.data) {
            if (t.name.toLowerCase() === nombre.toLowerCase()) {
                slugTerminoCache.set(cacheKey, t.slug);
                return t.slug;
            }
        }

        console.warn(`⚠️ Término no encontrado: "${nombre}"`);
        slugTerminoCache.set(cacheKey, null);
        return null;
    } catch (error) {
        console.error(`❌ Error slug término "${nombre}":`, error.message);
        return null;
    }
}
