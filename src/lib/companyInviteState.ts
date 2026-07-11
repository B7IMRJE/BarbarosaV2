export type PendingCompanyInviteState = {
    inviteCode: string;
    rawCode: string;
    invitedEmail: string | null;
    nextPath: string;
    invitationId: string | null;
    companyId: string | null;
    role: string | null;
    updatedAt: string;
};

const PENDING_COMPANY_INVITE_KEY = 'homeos.pendingCompanyInvite';
const COMPANY_INVITE_ROUTE = '/company-invite';
const CUSTOMER_INVITE_ROUTE = '/customer-invite';
const PUBLIC_APP_URL = 'https://barbarosa-v2.vercel.app';

export function getPendingCompanyInviteState(): PendingCompanyInviteState | null {
    return readPendingCompanyInviteState(getStorage('sessionStorage')) ||
        readPendingCompanyInviteState(getStorage('localStorage'));
}

export function replacePendingCompanyInviteState(state: Omit<PendingCompanyInviteState, 'updatedAt'>) {
    clearPendingCompanyInviteState();
    writePendingCompanyInviteState({
        ...state,
        inviteCode: normalizeCode(state.inviteCode),
        rawCode: state.rawCode.trim(),
        invitedEmail: normalizeEmail(state.invitedEmail),
        updatedAt: new Date().toISOString(),
    });
}

export function clearPendingCompanyInviteState(options: { inviteCode?: string | null } = {}) {
    const expectedCode = normalizeCode(options.inviteCode);
    const storages = [getStorage('sessionStorage'), getStorage('localStorage')];

    storages.forEach((storage) => {
        if (!storage) return;

        if (expectedCode) {
            const stored = readPendingCompanyInviteState(storage);
            if (stored?.inviteCode !== expectedCode) return;
        }

        storage.removeItem(PENDING_COMPANY_INVITE_KEY);
    });
}

export function buildPendingCompanyInviteState(input: {
    inviteCode: string;
    rawCode: string;
    invitedEmail?: string | null;
    nextPath: string;
    invitationId?: string | null;
    companyId?: string | null;
    role?: string | null;
}): Omit<PendingCompanyInviteState, 'updatedAt'> {
    return {
        inviteCode: normalizeCode(input.inviteCode),
        rawCode: input.rawCode.trim(),
        invitedEmail: normalizeEmail(input.invitedEmail),
        nextPath: input.nextPath.trim(),
        invitationId: normalizeOptional(input.invitationId),
        companyId: normalizeOptional(input.companyId),
        role: normalizeOptional(input.role),
    };
}

export function replacePendingCompanyInviteFromNextPath(nextPath: string | null, invitedEmail?: string | null) {
    const inviteCode = readInviteCodeFromNextPath(nextPath);

    if (!inviteCode || !nextPath) {
        clearPendingCompanyInviteState();
        return false;
    }

    replacePendingCompanyInviteState(buildPendingCompanyInviteState({
        inviteCode,
        rawCode: inviteCode,
        invitedEmail: normalizeEmail(invitedEmail),
        nextPath,
    }));
    return true;
}

export function readInviteCodeFromNextPath(nextPath: string | null) {
    if (!nextPath) return null;

    try {
        const parsed = new URL(nextPath, 'https://app.local');

        if (!isSupportedInviteRoute(parsed.pathname)) return null;

        const code = parsed.searchParams.get('code');

        return code?.trim() || null;
    } catch {
        return null;
    }
}

export function buildCompanyInviteAuthConfirmRedirect(nextPath: string | null) {
    const redirectUrl = new URL('/auth/confirm', PUBLIC_APP_URL);
    const inviteCode = readInviteCodeFromNextPath(nextPath);

    if (nextPath && inviteCode) {
        redirectUrl.searchParams.set('next', nextPath);
    }

    return redirectUrl.toString();
}

function isSupportedInviteRoute(pathname: string) {
    return pathname === COMPANY_INVITE_ROUTE || pathname === CUSTOMER_INVITE_ROUTE;
}

function writePendingCompanyInviteState(state: PendingCompanyInviteState) {
    const payload = JSON.stringify(state);

    [getStorage('sessionStorage'), getStorage('localStorage')].forEach((storage) => {
        storage?.setItem(PENDING_COMPANY_INVITE_KEY, payload);
    });
}

function readPendingCompanyInviteState(storage: Storage | null): PendingCompanyInviteState | null {
    if (!storage) return null;

    try {
        const raw = storage.getItem(PENDING_COMPANY_INVITE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

        const record = parsed as Record<string, unknown>;
        const inviteCode = normalizeCode(readString(record.inviteCode));
        const rawCode = readString(record.rawCode);
        const nextPath = readString(record.nextPath);

        if (!inviteCode || !rawCode || !nextPath) return null;

        return {
            inviteCode,
            rawCode,
            invitedEmail: normalizeEmail(readString(record.invitedEmail)),
            nextPath,
            invitationId: normalizeOptional(readString(record.invitationId)),
            companyId: normalizeOptional(readString(record.companyId)),
            role: normalizeOptional(readString(record.role)),
            updatedAt: readString(record.updatedAt) || '',
        };
    } catch {
        return null;
    }
}

function getStorage(name: 'localStorage' | 'sessionStorage'): Storage | null {
    const globalWithStorage = globalThis as {
        window?: Partial<Record<'localStorage' | 'sessionStorage', Storage>>;
    } & Partial<Record<'localStorage' | 'sessionStorage', Storage>>;

    return globalWithStorage.window?.[name] || globalWithStorage[name] || null;
}

function normalizeCode(value?: string | null) {
    return String(value || '').trim().toUpperCase();
}

function normalizeEmail(value?: string | null) {
    const email = String(value || '').trim().toLowerCase();

    return email || null;
}

function normalizeOptional(value?: string | null) {
    const text = String(value || '').trim();

    return text || null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
