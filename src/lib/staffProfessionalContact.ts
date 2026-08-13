import { supabase } from './supabase';
import {
    cleanSharedFields,
    type ProfessionalContactField,
} from './staffProfessionalContactFormatting';

export {
    PROFESSIONAL_CONTACT_FIELDS,
    buildProfessionalVCard,
    cleanSharedFields,
    hasShareableProfessionalContact,
} from './staffProfessionalContactFormatting';
export type { ProfessionalContactField } from './staffProfessionalContactFormatting';

export type StaffProfessionalContact = {
    company_user_id: string;
    company_id: string;
    professional_title: string | null;
    department: string | null;
    professional_phone: string | null;
    professional_email: string | null;
    extension: string | null;
    professional_website: string | null;
    years_with_company: number | null;
    shared_fields: ProfessionalContactField[];
    approved_at: string | null;
    updated_at: string | null;
};

export type SaveStaffProfessionalContactInput = Omit<
    StaffProfessionalContact,
    'company_id' | 'approved_at' | 'updated_at'
>;

export async function loadCompanyStaffProfessionalContacts(companyId: string) {
    const { data, error } = await supabase.rpc('get_company_staff_professional_contacts_for_management', {
        p_company_id: companyId.trim(),
    });

    if (error) throw new Error(error.message);

    return readStaffProfessionalContacts(data);
}

export async function loadMyStaffProfessionalContact(companyUserId: string) {
    const { data, error } = await supabase.rpc('get_my_company_staff_professional_contact', {
        p_company_user_id: companyUserId.trim(),
    });

    if (error) throw new Error(error.message);

    return readStaffProfessionalContacts(data)[0] || null;
}

export async function saveStaffProfessionalContact(input: SaveStaffProfessionalContactInput) {
    const { data, error } = await supabase.rpc('save_company_staff_professional_contact', {
        p_company_user_id: input.company_user_id,
        p_professional_title: nullableText(input.professional_title),
        p_department: nullableText(input.department),
        p_professional_phone: nullableText(input.professional_phone),
        p_professional_email: nullableText(input.professional_email)?.toLowerCase() || null,
        p_extension: nullableText(input.extension),
        p_professional_website: nullableText(input.professional_website),
        p_years_with_company: normalizeYears(input.years_with_company),
        p_shared_fields: cleanSharedFields(input.shared_fields),
    });

    if (error) throw new Error(error.message);

    const contact = readStaffProfessionalContacts(data)[0];

    if (!contact) throw new Error('The saved professional contact could not be read.');

    return contact;
}

function readStaffProfessionalContacts(data: unknown) {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((value): StaffProfessionalContact | null => {
            const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            const companyUserId = readString(record.company_user_id);
            const companyId = readString(record.company_id);

            if (!companyUserId || !companyId) return null;

            return {
                company_user_id: companyUserId,
                company_id: companyId,
                professional_title: readNullableString(record.professional_title),
                department: readNullableString(record.department),
                professional_phone: readNullableString(record.professional_phone),
                professional_email: readNullableString(record.professional_email),
                extension: readNullableString(record.extension),
                professional_website: readNullableString(record.professional_website),
                years_with_company: readNullableNumber(record.years_with_company),
                shared_fields: cleanSharedFields(Array.isArray(record.shared_fields) ? record.shared_fields : []),
                approved_at: readNullableString(record.approved_at),
                updated_at: readNullableString(record.updated_at),
            };
        })
        .filter((contact): contact is StaffProfessionalContact => Boolean(contact));
}

function normalizeYears(value?: number | null) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;

    return Math.max(0, Math.min(80, Math.round(value)));
}

function nullableText(value?: string | null) {
    return value?.trim() || null;
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readNullableString(value: unknown) {
    return readString(value) || null;
}

function readNullableNumber(value: unknown) {
    const number = Number(value);

    return value === null || value === undefined || value === '' || !Number.isFinite(number) ? null : number;
}
