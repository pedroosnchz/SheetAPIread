import axios from 'axios';
import { siteUrl, auth } from '../config.js';

const productoCache = new Map();

export async function crearProductoVariable(producto) {
    const cacheKey = producto.sku;
    if (productoCache.has(cacheKey)) {
        return productoCache.get(cacheKey); // evita duplicar si ya se creó
    }

    try {
        const response = await axios.post(
            siteUrl,
            {
                ...producto,
                attributes: producto.attributes.map(attr => ({
                    id: attr.id,
                    options: attr.options,
                    variation: true,
                    visible: true
                })),
                purchasable: true,
                tax_status: 'taxable',
                tax_class: 'parent',
                shipping_required: true,
            },
            { auth }
        );

        const productId = response.data.id;
        console.log(`✅ Producto creado: ${producto.name} (ID: ${productId})`);
        productoCache.set(cacheKey, productId);
        return productId;
    } catch (error) {
        console.error(`❌ Error al crear producto "${producto.name}":`, error.response?.data || error.message);
        throw error;
    }
}

export async function agregarVariacion(productId, atributos, precio, sku) {
    const payload = {
        regular_price: `${parseFloat(precio) || 0}`,
        sku: sku || undefined,
        attributes: atributos.map(attr => ({
            id: attr.id,
            option: attr.option.trim()
        }))
    };

    try {
        const response = await axios.post(
            `${siteUrl}/${productId}/variations`,
            payload,
            { auth }
        );
        console.log(`✔️ Variación creada para SKU: ${sku} → ID: ${response.data.id}`);
        return response.data.id;
    } catch (error) {
        console.error(`❌ Error al crear variación SKU "${sku}":`, error.response?.data || error.message);
        return null;
    }
}
