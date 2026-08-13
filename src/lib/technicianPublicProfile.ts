import { supabase } from './supabase';
import { cleanProfileList } from './technicianPublicProfileFormatting';

export {
    MINIMUM_PUBLIC_TECHNICIAN_REVIEWS,
    formatProfileList,
    formatRatingCategoryLabel,
    getTechnicianRatingDisclosure,
    parseProfileList,
} from './technicianPublicProfileFormatting';

export type TechnicianProfilePublicationStatus = 'draft' | 'published' | 'hidden';

export type TechnicianProfileContent = {
    display_name: string | null;
    profile_photo_url: string | null;
    short_bio: string | null;
    general_location: string | null;
    family_note: string | null;
    hobbies: string[];
    specialties: string[];
    languages: string[];
    certifications: string[];
    years_experience: number | null;
};

export type CompanyTechnicianPublicProfile = TechnicianProfileContent & {
    company_user_id: string;
    company_id: string;
    publication_status: TechnicianProfilePublicationStatus;
    pending_profile: TechnicianProfileContent | null;
    pending_submitted_at: string | null;
    approved_at: string | null;
    updated_at: string | null;
};

export type HomeownerTechnicianPublicProfile = {
    company_user_id: string;
    company_id: string;
    display_name: string;
    company_name: string;
    profile_photo_url: string | null;
    short_bio: string | null;
    general_location: string | null;
    family_note: string | null;
    hobbies: string[];
    specialties: string[];
    languages: string[];
    certifications: string[];
    years_experience: number | null;
    profile_published: boolean;
    public_rating: number | null;
    public_review_count: number;
    public_category_scores: Record<string, number>;
    professional_title: string | null;
    department: string | null;
    professional_phone: string | null;
    professional_email: string | null;
    extension: string | null;
    professional_website: string | null;
    years_with_company: number | null;
};

export type SaveCompanyTechnicianPublicProfileInput = Omit<
    CompanyTechnicianPublicProfile,
    'company_id' | 'pending_profile' | 'pending_submitted_at' | 'approved_at' | 'updated_at'
>;

export type SubmitMyTechnicianPublicProfileInput = TechnicianProfileContent & {
    company_user_id: string;
};

export async function loadCompanyTechnicianPublicProfiles(companyId: string) {
    const { data, error } = await supabase.rpc('get_company_technician_public_profiles_for_management', {
        p_company_id: companyId.trim(),
    });

    if (error) throw new Error(error.message);

    return readCompanyProfiles(data);
}

export async function saveCompanyTechnicianPublicProfile(input: SaveCompanyTechnicianPublicProfileInput) {
    const { data, error } = await supabase.rpc('save_company_technician_public_profile', {
        p_company_user_id: input.company_user_id,
        p_display_name: nullableText(input.display_name),
        p_profile_photo_url: nullableText(input.profile_photo_url),
        p_short_bio: nullableText(input.short_bio),
        p_general_location: nullableText(input.general_location),
        p_family_note: nullableText(input.family_note),
        p_hobbies: cleanProfileList(input.hobbies),
        p_specialties: cleanProfileList(input.specialties),
        p_languages: cleanProfileList(input.languages),
        p_certifications: cleanProfileList(input.certifications),
        p_years_experience: normalizeYearsExperience(input.years_experience),
        p_publication_status: readPublicationStatus(input.publication_status),
    });

    if (error) throw new Error(error.message);

    const profile = readCompanyProfiles(data)[0];

    if (!profile) throw new Error('The saved technician profile could not be read.');

    return profile;
}

export async function loadMyCompanyTechnicianPublicProfile(companyUserId: string) {
    const { data, error } = await supabase.rpc('get_my_company_technician_public_profile', {
        p_company_user_id: companyUserId.trim(),
    });

    if (error) throw new Error(error.message);

    return readCompanyProfiles(data)[0] || null;
}

export async function submitMyCompanyTechnicianPublicProfile(input: SubmitMyTechnicianPublicProfileInput) {
    const { data, error } = await supabase.rpc('submit_my_company_technician_public_profile', {
        p_company_user_id: input.company_user_id,
        p_display_name: nullableText(input.display_name),
        p_profile_photo_url: nullableText(input.profile_photo_url),
        p_short_bio: nullableText(input.short_bio),
        p_general_location: nullableText(input.general_location),
        p_family_note: nullableText(input.family_note),
        p_hobbies: cleanProfileList(input.hobbies),
        p_specialties: cleanProfileList(input.specialties),
        p_languages: cleanProfileList(input.languages),
        p_certifications: cleanProfileList(input.certifications),
        p_years_experience: normalizeYearsExperience(input.years_experience),
    });

    if (error) throw new Error(error.message);

    const profile = readCompanyProfiles(data)[0];

    if (!profile) throw new Error('The submitted technician profile could not be read.');

    return profile;
}

export async function loadHomeownerTechnicianPublicProfile(
    companyUserId: string,
    serviceRequestId: string
) {
    const { data, error } = await supabase.rpc('get_homeowner_technician_public_profile', {
        p_company_user_id: companyUserId.trim(),
        p_service_request_id: serviceRequestId.trim(),
    });

    if (error) throw new Error(error.message);

    const profile = readHomeownerProfiles(data)[0];

    if (!profile) throw new Error('This technician profile is not available for the selected service request.');

    return profile;
}

function readCompanyProfiles(data: unknown) {
    return asRecords(data)
        .map((record): CompanyTechnicianPublicProfile | null => {
            const companyUserId = readString(record.company_user_id);
            const companyId = readString(record.company_id);

            if (!companyUserId || !companyId) return null;

            return {
                company_user_id: companyUserId,
                company_id: companyId,
                display_name: readNullableString(record.display_name),
                profile_photo_url: readNullableString(record.profile_photo_url),
                short_bio: readNullableString(record.short_bio),
                general_location: readNullableString(record.general_location),
                family_note: readNullableString(record.family_note),
                hobbies: readStringArray(record.hobbies),
                specialties: readStringArray(record.specialties),
                languages: readStringArray(record.languages),
                certifications: readStringArray(record.certifications),
                years_experience: readNullableNumber(record.years_experience),
                publication_status: readPublicationStatus(record.publication_status),
                pending_profile: readProfileContent(record.pending_profile),
                pending_submitted_at: readNullableString(record.pending_submitted_at),
                approved_at: readNullableString(record.approved_at),
                updated_at: readNullableString(record.updated_at),
            };
        })
        .filter((profile): profile is CompanyTechnicianPublicProfile => Boolean(profile));
}

function readProfileContent(value: unknown): TechnicianProfileContent | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;

    return {
        display_name: readNullableString(record.display_name),
        profile_photo_url: readNullableString(record.profile_photo_url),
        short_bio: readNullableString(record.short_bio),
        general_location: readNullableString(record.general_location),
        family_note: readNullableString(record.family_note),
        hobbies: readStringArray(record.hobbies),
        specialties: readStringArray(record.specialties),
        languages: readStringArray(record.languages),
        certifications: readStringArray(record.certifications),
        years_experience: readNullableNumber(record.years_experience),
    };
}

function readHomeownerProfiles(data: unknown) {
    return asRecords(data)
        .map((record): HomeownerTechnicianPublicProfile | null => {
            const companyUserId = readString(record.company_user_id);
            const companyId = readString(record.company_id);
            const displayName = readString(record.display_name);
            const companyName = readString(record.company_name);

            if (!companyUserId || !companyId || !displayName || !companyName) return null;

            return {
                company_user_id: companyUserId,
                company_id: companyId,
                display_name: displayName,
                company_name: companyName,
                profile_photo_url: readNullableString(record.profile_photo_url),
                short_bio: readNullableString(record.short_bio),
                general_location: readNullableString(record.general_location),
                family_note: readNullableString(record.family_note),
                hobbies: readStringArray(record.hobbies),
                specialties: readStringArray(record.specialties),
                languages: readStringArray(record.languages),
                certifications: readStringArray(record.certifications),
                years_experience: readNullableNumber(record.years_experience),
                profile_published: record.profile_published === true,
                public_rating: readNullableNumber(record.public_rating),
                public_review_count: Math.max(0, Math.round(Number(record.public_review_count) || 0)),
                public_category_scores: readNumberRecord(record.public_category_scores),
                professional_title: readNullableString(record.professional_title),
                department: readNullableString(record.department),
                professional_phone: readNullableString(record.professional_phone),
                professional_email: readNullableString(record.professional_email),
                extension: readNullableString(record.extension),
                professional_website: readNullableString(record.professional_website),
                years_with_company: readNullableNumber(record.years_with_company),
            };
        })
        .filter((profile): profile is HomeownerTechnicianPublicProfile => Boolean(profile));
}

function asRecords(data: unknown): Record<string, unknown>[] {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
}

function readPublicationStatus(value: unknown): TechnicianProfilePublicationStatus {
    return value === 'published' || value === 'hidden' ? value : 'draft';
}

function normalizeYearsExperience(value: number | null | undefined) {
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

function readStringArray(value: unknown) {
    return Array.isArray(value) ? cleanProfileList(value.map(readString)) : [];
}

function readNullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function readNumberRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce<Record<string, number>>((result, [key, entry]) => {
        const score = Number(entry);

        if (Number.isFinite(score) && score >= 1 && score <= 5) result[key] = score;

        return result;
    }, {});
}
