import { supabase } from './supabase';

export type PreferredProvider = {
    companyId: string;
    companyName: string;
};

export async function loadPreferredProviderForProperty(propertyId: string): Promise<PreferredProvider | null> {
    const normalizedPropertyId = propertyId.trim();

    if (!normalizedPropertyId) return null;

    const { data: preferredRows, error: preferredError } = await supabase
        .from('property_preferred_providers')
        .select('company_id, property_id, status, selected_at')
        .eq('property_id', normalizedPropertyId)
        .eq('status', 'active')
        .order('selected_at', { ascending: false })
        .limit(1);

    if (preferredError) {
        throw new Error(preferredError.message);
    }

    const preferredRow = (preferredRows || [])[0] as { company_id?: string | null } | undefined;
    const providerCompanyId = String(preferredRow?.company_id || '').trim();

    if (!providerCompanyId) return null;

    const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, public_name, dba_name')
        .eq('id', providerCompanyId)
        .maybeSingle();

    if (companyError) {
        return {
            companyId: providerCompanyId,
            companyName: 'Selected provider',
        };
    }

    const companyRecord = (companyData || {}) as {
        name?: string | null;
        public_name?: string | null;
        dba_name?: string | null;
    };

    return {
        companyId: providerCompanyId,
        companyName: firstText(companyRecord.public_name, companyRecord.dba_name, companyRecord.name) || 'Selected provider',
    };
}

function firstText(...values: Array<string | null | undefined>) {
    for (const value of values) {
        const text = String(value || '').trim();

        if (text) return text;
    }

    return '';
}
