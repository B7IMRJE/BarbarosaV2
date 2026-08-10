import {
    classifyCompanyInvitationCode,
    invitationCodeStateMessage,
} from '../_shared/companyInvitationCodePolicy.ts';

runInvitationCodeRegressions();

export function runInvitationCodeRegressions() {
    freshPendingCodeIsEligible();
    acceptedOrUsedCodeIsNotReusable();
    expiredAndRevokedCodesStayDistinct();
    safeMessagesDoNotExposeInvitationContent();
}

function freshPendingCodeIsEligible() {
    assert(classifyCompanyInvitationCode({
        status: 'pending',
        manual_invite_expires_at: '2030-01-02T00:00:00.000Z',
    }, Date.parse('2030-01-01T00:00:00.000Z')) === 'eligible', 'A fresh pending code should be redeemable.');
}

function acceptedOrUsedCodeIsNotReusable() {
    assert(classifyCompanyInvitationCode({
        status: 'accepted',
    }) === 'used', 'An accepted invitation must report a used one-time code.');
    assert(classifyCompanyInvitationCode({
        status: 'pending',
        login_code_used_at: '2030-01-01T00:00:00.000Z',
    }) === 'used', 'A recorded code use must remain one-time even if stale status says pending.');
}

function expiredAndRevokedCodesStayDistinct() {
    assert(classifyCompanyInvitationCode({
        status: 'pending',
        expires_at: '2029-12-31T23:59:59.000Z',
    }, Date.parse('2030-01-01T00:00:00.000Z')) === 'expired', 'Expired invitations should not be reported as arbitrary invalid codes.');
    assert(classifyCompanyInvitationCode({
        status: 'pending',
        revoked_at: '2030-01-01T00:00:00.000Z',
    }) === 'revoked', 'Revoked invitations should remain inactive.');
}

function safeMessagesDoNotExposeInvitationContent() {
    for (const state of ['used', 'expired', 'revoked', 'inactive'] as const) {
        const message = invitationCodeStateMessage(state).toLowerCase();
        assert(!message.includes('email'), 'Safe code-state messages must not expose invitation email data.');
        assert(!message.includes('token'), 'Safe code-state messages must not expose auth tokens.');
        assert(!message.includes('supabase'), 'Safe code-state messages must not expose the provider.');
    }
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
