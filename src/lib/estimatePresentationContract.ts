export function buildEstimatePresentationLink(shareToken: string, origin?: string) {
    const base = origin || (typeof window !== 'undefined'
        ? window.location.origin
        : 'https://barbarosa-v2.vercel.app');

    return `${base.replace(/\/$/, '')}/presentation?session=${encodeURIComponent(shareToken)}`;
}

export function formatPresentationJoinCode(value: string) {
    const clean = value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8);

    return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
