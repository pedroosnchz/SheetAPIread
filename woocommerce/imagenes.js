const cacheImagenes = new Map();

export async function generarImagenesDesdeMedia(liga, equipo, edicion) {
    const baseUrl = "https://vorx.es/paraiso/wp-content/uploads/2025/06";
    const key = `${liga}-${equipo}-${edicion}`;
    if (cacheImagenes.has(key)) {
        return cacheImagenes.get(key);
    }

    const imagenes = [];
    const maxIntentos = 10;

    for (let i = -1; i <= maxIntentos; i++) {
        const nombreArchivo = `${liga}-${equipo}-${edicion}-${i === -1 ? "portada" : i}.webp`;
        const url = `${baseUrl}/${nombreArchivo}`;
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) break;
            imagenes.push({ src: url });
        } catch (error) {
            console.warn(`⚠️ Error al comprobar imagen: ${url}`);
            break;
        }
    }

    cacheImagenes.set(key, imagenes);
    return imagenes;
}
