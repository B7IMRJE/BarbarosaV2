import { customerInvitationPath, connectCustomerInvitationToHome } from './customerInvitationConnection';
import { supabase } from './supabase';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

export async function runCustomerInvitationConnectionRegressions() {
    assert(customerInvitationPath('/customer-invite?code=company%2Btoken&other=ignored') === '/customer-invite?code=company%2Btoken', 'Preserve only the exact customer invitation code.');
    for (const invalid of ['/customer-invite', '/customer-invite?code=', '/company-invite?code=staff', '/request-service?code=anything', '//elsewhere.test/customer-invite?code=test', 'https://elsewhere.test/customer-invite?code=test', '/\\elsewhere.test/customer-invite?code=test']) {
        assert(customerInvitationPath(invalid) === null, 'Reject unrelated or external invitation paths.');
    }
    const originalRpc = supabase.rpc;
    let response: { data: unknown; error: { message: string } | null } = { data: [{ company_id: 'inviting-company', property_id: 'chosen-home', status: 'accepted' }], error: null };
    const calls: { name: string; args: unknown }[] = [];
    supabase.rpc = (async (name: string, args: unknown) => {
        calls.push({ name, args });
        return response;
    }) as unknown as typeof supabase.rpc;
    try {
        const result = await connectCustomerInvitationToHome('/customer-invite?code=invitation-token', 'chosen-home');
        assert(result.companyId === 'inviting-company', 'The receipt must use the inviting company.');
        assert(calls[0].name === 'accept_customer_invite_by_code' && JSON.stringify(calls[0].args) === JSON.stringify({ p_invite_code: 'invitation-token', p_property_id: 'chosen-home' }), 'Connect only the used invitation to the selected home, without picking a directory company.');
        for (const invalidReceipt of [null, [], [{ company_id: 'inviting-company', property_id: 'other-home', status: 'accepted' }], [{ company_id: 'inviting-company', property_id: 'chosen-home', status: 'pending' }]]) {
            response = { data: invalidReceipt, error: null };
            let denied = false;
            try { await connectCustomerInvitationToHome('/customer-invite?code=invitation-token', 'chosen-home'); } catch { denied = true; }
            assert(denied, 'Never report success without the correct confirmed home connection.');
        }
        response = { data: null, error: { message: 'Connection unavailable' } };
        let denied = false;
        try { await connectCustomerInvitationToHome('/customer-invite?code=invitation-token', 'chosen-home'); } catch { denied = true; }
        assert(denied, 'Failed connection must keep onboarding in a retryable state.');
    } finally { supabase.rpc = originalRpc; }
    console.log('PASS: invitation-only routing, exact home confirmation, connection failure handling');
}
