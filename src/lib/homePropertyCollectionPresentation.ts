export type PropertySummaryAddressFields = {
    address?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    postal_code?: string | null;
    country_code?: string | null;
    formatted_address?: string | null;
};

export function formatPropertyCollectionTitle(displayName?: string | null) {
    const firstName = String(displayName || '').trim().split(/\s+/)[0] || '';

    if (!firstName) return 'Your Properties';

    return /s$/i.test(firstName)
        ? `${firstName}' Properties`
        : `${firstName}'s Properties`;
}

export function formatPropertySummaryAddress(row: PropertySummaryAddressFields) {
    const formattedAddress = String(row.formatted_address || '').trim();

    if (formattedAddress) return formattedAddress;

    return [
        [row.address_line_1 || row.address, row.address_line_2].filter(Boolean).join(' '),
        [row.city, row.state, row.postal_code || row.zip].filter(Boolean).join(', '),
        row.country_code,
    ]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ');
}
