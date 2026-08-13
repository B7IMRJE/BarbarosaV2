export const PROFESSIONAL_CONTACT_FIELDS = [
    'professional_title',
    'department',
    'professional_phone',
    'professional_email',
    'extension',
    'professional_website',
    'years_with_company',
] as const;

export type ProfessionalContactField = typeof PROFESSIONAL_CONTACT_FIELDS[number];

export type ProfessionalContactVCardSource = {
    professional_title?: string | null;
    department?: string | null;
    professional_phone?: string | null;
    professional_email?: string | null;
    extension?: string | null;
    professional_website?: string | null;
    years_with_company?: number | null;
    shared_fields?: readonly ProfessionalContactField[] | null;
};

export function buildProfessionalVCard(input: {
    displayName: string;
    companyName: string;
    contact?: ProfessionalContactVCardSource | null;
    publicProfileUrl?: string | null;
}) {
    const name = cleanVCardText(input.displayName) || 'Company professional';
    const organization = cleanVCardText(input.companyName);
    const contact = input.contact || {};
    const fields = new Set(cleanSharedFields(contact.shared_fields || []));
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        `N:${name};;;;`,
    ];

    if (organization) lines.push(`ORG:${organization}`);
    if (fields.has('professional_title') && contact.professional_title) {
        lines.push(`TITLE:${cleanVCardText(contact.professional_title)}`);
    }
    if (fields.has('department') && contact.department) {
        lines.push(`X-DEPARTMENT:${cleanVCardText(contact.department)}`);
    }
    if (fields.has('professional_phone') && contact.professional_phone) {
        const extension = fields.has('extension') && contact.extension
            ? `;ext=${cleanVCardText(contact.extension)}`
            : '';
        lines.push(`TEL;TYPE=WORK,VOICE${extension}:${cleanVCardText(contact.professional_phone)}`);
    }
    if (fields.has('professional_email') && contact.professional_email) {
        lines.push(`EMAIL;TYPE=WORK:${cleanVCardText(contact.professional_email)}`);
    }
    const preferredUrl = fields.has('professional_website') && contact.professional_website
        ? contact.professional_website
        : input.publicProfileUrl;
    if (preferredUrl) lines.push(`URL:${cleanVCardText(preferredUrl)}`);
    lines.push('END:VCARD');

    return lines.join('\r\n');
}

export function hasShareableProfessionalContact(contact?: ProfessionalContactVCardSource | null) {
    if (!contact) return false;

    const fields = new Set(cleanSharedFields(contact.shared_fields || []));

    return (
        (fields.has('professional_phone') && Boolean(contact.professional_phone)) ||
        (fields.has('professional_email') && Boolean(contact.professional_email)) ||
        (fields.has('professional_website') && Boolean(contact.professional_website)) ||
        (fields.has('professional_title') && Boolean(contact.professional_title))
    );
}

export function cleanSharedFields(values: readonly unknown[]) {
    return Array.from(new Set(values.filter((value): value is ProfessionalContactField => (
        typeof value === 'string' && PROFESSIONAL_CONTACT_FIELDS.includes(value as ProfessionalContactField)
    ))));
}

function cleanVCardText(value: string) {
    return value.trim().replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
