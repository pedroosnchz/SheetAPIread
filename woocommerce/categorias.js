import axios from 'axios';
import { auth } from '../config.js';
import { slugify, normalizarNombre } from '../utils/string.js';

// Categorías fijas preexistentes
export const categoryMap = {
    "ACBFIBA": 42,
    "F1": 43,
    "Futbol": 39,
};

// Cache en memoria por nombre normalizado
const categoriaCache = new Map();

export async function obtenerOCrearCategoria(nombreCategoria) {
    const nombreNormalizado = normalizarNombre(nombreCategoria);
    if (categoriaCache.has(nombreNormalizado)) {
        return categoriaCache.get(nombreNormalizado);
    }

    const slug = slugify(nombreCategoria);

    try {
        const res = await axios.get(
            'https://vorx.es/paraiso/wp-json/wc/v3/products/categories',
            {
                auth,
                params: {
                    per_page: 100,
                    search: nombreCategoria
                }
            }
        );

        const encontrada = res.data.find(
            cat => normalizarNombre(cat.name) === nombreNormalizado
        );

        if (encontrada) {
            categoriaCache.set(nombreNormalizado, encontrada.id);
            return encontrada.id;
        }

        const createRes = await axios.post(
            'https://vorx.es/paraiso/wp-json/wc/v3/products/categories',
            {
                name: nombreCategoria,
                slug
            },
            { auth }
        );

        categoriaCache.set(nombreNormalizado, createRes.data.id);
        return createRes.data.id;
    } catch (error) {
        console.error(`❌ Error en categoría "${nombreCategoria}":`, error.message);
        return null;
    }
}
