export function quitarAcentos(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizarNombre(str) {
    return quitarAcentos(str).toLowerCase().trim();
}

export function slugify(str) {
    return quitarAcentos(str)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]/g, "");
}
