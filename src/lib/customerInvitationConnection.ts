import { supabase } from './supabase';

// Carry only the invitation being used, never infer a company from an email or directory.
export function customerInvitationPath(value?: string | string[] | null) {
    const path = String(Array.isArray(value) ? value[0] || '' : value || '').trim();
    if (!path.startsWith('/') || path.startsWith('//')) return null;
    try {
        const parsed = new URL(path, 'https://app.local');
        const code = parsed.searchParams.get('code')?.trim();
        if (parsed.origin !== 'https://app.local' || parsed.pathname !== '/customer-invite' || !code) return null;
        return `/customer-invite?code=${encodeURIComponent(code)}`;
    } catch {
        return null;
    }
}

export async function connectCustomerInvitationToHome(nextPath: string, propertyId: string) {
    const path = customerInvitationPath(nextPath);
    if (!path || !propertyId.trim()) throw new Error('The company invitation or home is missing.');
    const code = new URL(path, 'https://app.local').searchParams.get('code')!;
    const { data, error } = await supabase.rpc('accept_customer_invite_by_code', {
        p_invite_code: code,
        p_property_id: propertyId,
    });
    if (error) throw new Error(`Your home is saved, but the inviting company could not be connected: ${error.message}`);
    const receipt = Array.isArray(data) ? data[0] : data;
    if (!receipt?.company_id || receipt.property_id !== propertyId || receipt.status !== 'accepted') {
        throw new Error('We could not confirm the inviting company connection. Please retry.');
    }
    return { companyId: String(receipt.company_id), propertyId, inviteCode: code };
}
