export function parseCsvRow(row) {
    const result = [];
    let inQuotes = false;
    let value = '';

    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        const nextChar = row[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            value += '"';
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
