import { supabase } from './supabase';
import {
    isCompanyClockRequired,
    normalizeCompanyPayBasis,
    type CompanyPayBasis,
} from './companyTimekeepingPolicyModel';

export {
    getCompanyPayBasisLabel,
    isCompanyClockRequired,
    normalizeCompanyPayBasis,
    type CompanyPayBasis,
} from './companyTimekeepingPolicyModel';

export type CompanyTimekeepingPolicy = {
    companyUserId: string;
    companyId: string;
    role: string | null;
    payBasis: CompanyPayBasis;
    clockRequired: boolean;
    clockAvailable: boolean;
};

export async function loadCurrentCompanyTimekeepingPolicy(companyId: string): Promise<CompanyTimekeepingPolicy> {
    const { data, error } = await supabase.rpc('get_current_company_timekeeping_policy', {
        p_company_id: cleanRequiredText(companyId),
    });

    if (error) throw error;

    const record = readFirstRecord(data);
    const companyUserId = readString(record, 'company_user_id');
    const resolvedCompanyId = readString(record, 'company_id');

    if (!companyUserId || !resolvedCompanyId) {
        throw new Error('No active company timekeeping policy was found.');
    }

    const payBasis = normalizeCompanyPayBasis(readString(record, 'pay_basis'));

    return {
        companyUserId,
        companyId: resolvedCompanyId,
        role: readString(record, 'role'),
        payBasis,
        clockRequired: readBoolean(record, 'clock_required', isCompanyClockRequired(payBasis)),
        clockAvailable: readBoolean(record, 'clock_available', true),
    };
}

export async function loadCompanyTimekeepingPolicies(companyId: string): Promise<CompanyTimekeepingPolicy[]> {
    const { data, error } = await supabase.rpc('get_company_user_timekeeping_policies', {
        p_company_id: cleanRequiredText(companyId),
    });

    if (error) throw error;

    return (Array.isArray(data) ? data : [])
        .map((row) => normalizePolicyRecord(row))
        .filter((policy): policy is CompanyTimekeepingPolicy => !!policy);
}

export async function saveCompanyUserPayBasis(
    companyUserId: string,
    payBasis: CompanyPayBasis,
): Promise<CompanyTimekeepingPolicy> {
    const { data, error } = await supabase.rpc('set_company_user_pay_basis', {
        p_company_user_id: cleanRequiredText(companyUserId),
        p_pay_basis: normalizeCompanyPayBasis(payBasis),
    });

    if (error) throw error;

    const policy = normalizePolicyRecord(Array.isArray(data) ? data[0] : data);
    if (!policy) throw new Error('The timekeeping policy did not return after save.');

    return policy;
}

function normalizePolicyRecord(value: unknown): CompanyTimekeepingPolicy | null {
    const record = asRecord(value);
    const companyUserId = readString(record, 'company_user_id');
    const companyId = readString(record, 'company_id');
    if (!companyUserId || !companyId) return null;

    const payBasis = normalizeCompanyPayBasis(readString(record, 'pay_basis'));
    return {
        companyUserId,
        companyId,
        role: readString(record, 'role'),
        payBasis,
        clockRequired: readBoolean(record, 'clock_required', isCompanyClockRequired(payBasis)),
        clockAvailable: readBoolean(record, 'clock_available', true),
    };
}

function readFirstRecord(value: unknown) {
    return asRecord(Array.isArray(value) ? value[0] : value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean) {
    return typeof record[key] === 'boolean' ? record[key] as boolean : fallback;
}

function cleanRequiredText(value?: string | null) {
    return String(value || '').trim();
}
