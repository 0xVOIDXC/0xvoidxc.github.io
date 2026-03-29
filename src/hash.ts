function canonicalize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`;
    }
    const sorted = Object.keys(value as Record<string, unknown>)
        .sort()
        .map(k => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
        .join(',');
    return `{${sorted}}`;
}

function fnv1a32(str: string): number {
    const bytes = new TextEncoder().encode(str); // UTF-8 bytes
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, 0x01000193);
    }
    return hash >>> 0; // coerce to unsigned 32-bit
}

export function hashJson(obj: unknown): number {
    return fnv1a32(canonicalize(obj));
}