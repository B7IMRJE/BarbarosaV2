import { supabase } from './supabase';
import {
    homeOSTradeContextRpcParams,
    parseHomeOSTradeContext,
    type HomeOSTradeContextInput,
} from './homeosTradeCapabilitiesCore';

export type { HomeOSTradeContextInput } from './homeosTradeCapabilitiesCore';
export { homeOSTradeContextRpcParams } from './homeosTradeCapabilitiesCore';

export type RepipeWizardStartResult = {
    estimateSessionId: string;
    companyUserId: string | null;
    category: string;
    status: string;
};

const LOAD_TIMEOUT_MS = 15_000;

export async function loadHomeOSTradeContext(input: HomeOSTradeContextInput) {
    const request = supabase.rpc('get_homeos_trade_context', homeOSTradeContextRpcParams(input));
    const { data, error } = await withTimeout(
        request,
        'Company trade access took too long to confirm. Check your connection and try again.',
    );
    if (error) throw error;
    return parseHomeOSTradeContext(data);
}

export async function startCompanyRepipeWizard(input: HomeOSTradeContextInput) {
    const request = supabase.rpc('start_company_repipe_wizard', homeOSTradeContextRpcParams(input));
    const { data, error } = await withTimeout(
        request,
        'The Repipe workspace took too long to open. Check your connection and try again.',
    );
    if (error) throw error;

    const row = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {};
    const estimateSessionId = String(row.estimate_session_id || '').trim();
    if (!estimateSessionId) throw new Error('The Repipe workspace did not return an estimate session.');

    return {
        estimateSessionId,
        companyUserId: nullableText(row.company_user_id),
        category: String(row.category || 'whole_home_repipe').trim() || 'whole_home_repipe',
        status: String(row.status || 'draft').trim() || 'draft',
    } satisfies RepipeWizardStartResult;
}

async function withTimeout<T>(promise: PromiseLike<T>, message: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve(promise),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), LOAD_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function nullableText(value: unknown) {
    const text = String(value || '').trim();
    return text || null;
}
