import { supabase } from './supabase';
import { getExplicitProviderCategoryKeys } from './providerVisibility';

export type PreferredProvider = {
    companyId: string;
    companyName: string;
    requiresActivation?: boolean;
};

type ConnectedProviderRow = {
    company_id?: string | null;
    status?: string | null;
};

type ProviderCompanyRow = {
    id?: string | null;
    name?: string | null;
    public_name?: string | null;
    dba_name?: string | null;
    service_categories?: string[] | null;
    status?: string | null;
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

    const preferredRow = (preferredRows || [])[0] as { company_id?: string | null } | undefined;
    const providerCompanyId = String(preferredRow?.company_id || '').trim();

    if (providerCompanyId) {
        return loadProviderCompany(providerCompanyId);
    }

    const connectedProvider = await loadConnectedProviderForProperty(normalizedPropertyId);

    if (connectedProvider) return connectedProvider;

    if (preferredError) {
        throw new Error(preferredError.message);
    }

    return null;
}

export function selectConnectedProviderCompanyId(
    connectedRows: ConnectedProviderRow[],
    companyRows: ProviderCompanyRow[]
) {
    const companiesById = new Map(
        companyRows.flatMap((company) => {
            const companyId = String(company.id || '').trim();

            return companyId ? [[companyId, company] as const] : [];
        })
    );

    for (const row of connectedRows) {
        const companyId = String(row.company_id || '').trim();
        const connectionStatus = normalizeText(row.status);
        const company = companiesById.get(companyId);

        if (!companyId || !isActiveConnectionStatus(connectionStatus) || !company) continue;
        const companyStatus = normalizeText(company.status);

        if (companyStatus && companyStatus !== 'active') continue;
        if (getExplicitProviderCategoryKeys(company.service_categories).length === 0) continue;

        return companyId;
    }

    return '';
}

export function getEmergencyProviderReturnTo(value?: string | string[] | null) {
    const candidate = String(Array.isArray(value) ? value[0] || '' : value || '').trim();

    return /^\/emergency\/[^/?#]+$/.test(candidate) ? candidate : '';
}

export async function activateConnectedProviderForProperty(input: {
    propertyId: string;
    companyId: string;
}) {
    const propertyId = input.propertyId.trim();
    const companyId = input.companyId.trim();

    if (!propertyId || !companyId) {
        throw new Error('Property and provider company are required.');
    }

    const { error } = await supabase.rpc('request_property_provider_connection', {
        p_property_id: propertyId,
        p_company_id: companyId,
    });

    if (error) {
        throw new Error(error.message);
    }
}

async function loadConnectedProviderForProperty(propertyId: string): Promise<PreferredProvider | null> {
    const { data: connectedRows, error: connectedError } = await supabase
        .from('company_property_clients')
        .select('company_id, status, connected_at, created_at')
        .eq('property_id', propertyId)
        .order('connected_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

    if (connectedError) {
        throw new Error(connectedError.message);
    }

    const rows = (connectedRows || []) as ConnectedProviderRow[];
    const companyIds = Array.from(new Set(rows.map((row) => String(row.company_id || '').trim()).filter(Boolean)));

    if (companyIds.length === 0) return null;

    const { data: companyRows, error: companyError } = await supabase.rpc(
        'get_homeowner_connection_providers',
        { p_property_id: propertyId }
    );

    if (companyError) {
        throw new Error(companyError.message);
    }

    const companies = (companyRows || []) as ProviderCompanyRow[];
    const connectedCompanyId = selectConnectedProviderCompanyId(rows, companies);

    if (!connectedCompanyId) return null;

    const company = companies.find((candidate) => candidate.id === connectedCompanyId);

    return {
        companyId: connectedCompanyId,
        companyName: getProviderCompanyName(company),
        requiresActivation: true,
    };
}

async function loadProviderCompany(providerCompanyId: string): Promise<PreferredProvider> {

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

    const companyRecord = (companyData || {}) as ProviderCompanyRow;

    return {
        companyId: providerCompanyId,
        companyName: getProviderCompanyName(companyRecord),
    };
}

function getProviderCompanyName(company?: ProviderCompanyRow | null) {
    return firstText(company?.public_name, company?.dba_name, company?.name) || 'Selected provider';
}

function isActiveConnectionStatus(status: string) {
    return !status || ['active', 'connected', 'approved'].includes(status);
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function firstText(...values: (string | null | undefined)[]) {
    for (const value of values) {
        const text = String(value || '').trim();

        if (text) return text;
    }

    return '';
}
