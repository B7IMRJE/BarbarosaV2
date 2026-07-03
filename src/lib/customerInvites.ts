import { supabase } from './supabase';

export type PendingCustomerInvite = {
    invitation_id: string;
    company_id: string;
    company_name: string | null;
    invited_email: string | null;
    invited_phone: string | null;
    invited_name: string | null;
    note: string | null;
    status: string | null;
    invite_code: string | null;
    expires_at: string | null;
    created_at: string | null;
};

export type PendingCustomerInviteLookup = {
    invites: PendingCustomerInvite[];
    userId: string;
    signedInEmail: string;
    error: string | null;
    backendMissing: boolean;
};

export async function loadPendingCustomerInvitesForCurrentUser(): Promise<PendingCustomerInviteLookup> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return {
            invites: [],
            userId: '',
            signedInEmail: '',
            error: userError?.message || 'Sign in to review customer invitations.',
            backendMissing: false,
        };
    }

    const signedInEmail = user.email || '';

    if (!signedInEmail) {
        return {
            invites: [],
            userId: user.id,
            signedInEmail,
            error: 'This account does not have an email address for invite matching.',
            backendMissing: false,
        };
    }

    const { data, error } = await supabase.rpc('get_my_customer_invites');

    if (error) {
        return {
            invites: [],
            userId: user.id,
            signedInEmail,
            error: error.message,
            backendMissing: isMissingCustomerInviteRpc(error),
        };
    }

    return {
        invites: normalizePendingCustomerInvites(data),
        userId: user.id,
        signedInEmail,
        error: null,
        backendMissing: false,
    };
}

function normalizePendingCustomerInvites(data: unknown): PendingCustomerInvite[] {
    if (!Array.isArray(data)) return [];

    return data
        .map(readPendingCustomerInvite)
        .filter((invite): invite is PendingCustomerInvite => Boolean(invite?.invitation_id && invite.invite_code));
}

function readPendingCustomerInvite(row: unknown): PendingCustomerInvite | null {
    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;

    return {
        invitation_id: readString(record, 'invitation_id'),
        company_id: readString(record, 'company_id'),
        company_name: readNullableString(record, 'company_name'),
        invited_email: readNullableString(record, 'invited_email'),
        invited_phone: readNullableString(record, 'invited_phone'),
        invited_name: readNullableString(record, 'invited_name'),
        note: readNullableString(record, 'note'),
        status: readNullableString(record, 'status'),
        invite_code: readNullableString(record, 'invite_code'),
        expires_at: readNullableString(record, 'expires_at'),
        created_at: readNullableString(record, 'created_at'),
    };
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value : '';
}

function readNullableString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value : null;
}

function isMissingCustomerInviteRpc(error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
}) {
    const code = String(error.code || '').trim().toUpperCase();
    const text = [error.message, error.details, error.hint]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

    return (
        code === 'PGRST202' ||
        code === '42883' ||
        text.includes('get_my_customer_invites') ||
        text.includes('could not find the function') ||
        text.includes('schema cache')
    );
}
