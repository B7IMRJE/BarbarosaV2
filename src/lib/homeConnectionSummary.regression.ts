import {
    buildCurrentProviderConnections,
    type HomeConnectionSummaryRow,
} from './homeConnectionSummary';

export function runHomeConnectionSummaryRegressions() {
    activePreferredProviderCountsAsConnected();
    preferredAndLegacyRowsDoNotDoubleCount();
    revokedLegacyProviderDoesNotCount();
    acceptedCompanyInviteCountsAsConnected();
    pendingCompanyInviteDoesNotCount();
}

function activePreferredProviderCountsAsConnected() {
    const currentProviders = buildCurrentProviderConnections([], [
        preferredProvider('company-1'),
    ]);

    assert(currentProviders.length === 1, 'One visible current provider must produce a connected count of one.');
    assert(currentProviders[0]?.company_id === 'company-1', 'The current provider company must be preserved.');
}

function preferredAndLegacyRowsDoNotDoubleCount() {
    const currentProviders = buildCurrentProviderConnections(
        [connection('connection-1', 'company-1', 'connected')],
        [preferredProvider('company-1')]
    );

    assert(currentProviders.length === 1, 'A preferred provider and its legacy connection must count once.');
}

function revokedLegacyProviderDoesNotCount() {
    const currentProviders = buildCurrentProviderConnections(
        [connection('connection-2', 'company-2', 'revoked')],
        []
    );

    assert(currentProviders.length === 0, 'A revoked provider connection must not count as current.');
}

function acceptedCompanyInviteCountsAsConnected() {
    const currentProviders = buildCurrentProviderConnections(
        [connection('connection-3', 'company-3', 'connected', 'company_customer_invite')],
        []
    );

    assert(
        currentProviders.length === 1,
        'An accepted company-created customer invitation must remain the current provider relationship.'
    );
}

function pendingCompanyInviteDoesNotCount() {
    const currentProviders = buildCurrentProviderConnections(
        [connection('connection-4', 'company-4', 'pending', 'company_customer_invite')],
        []
    );

    assert(
        currentProviders.length === 0,
        'A pending company invitation must not bypass provider classification and acceptance.'
    );
}

function preferredProvider(companyId: string) {
    return {
        property_id: 'property-1',
        company_id: companyId,
        property_connection_id: null,
        status: 'active',
        source: 'preferred_provider',
        selected_at: '2026-07-23T00:00:00.000Z',
    };
}

function connection(
    id: string,
    companyId: string,
    status: string,
    requestSource = 'homeowner_provider_request'
): HomeConnectionSummaryRow {
    return {
        id,
        property_id: 'property-1',
        company_id: companyId,
        status,
        request_source: requestSource,
        can_view_documents: false,
        can_view_photos: false,
        can_view_service_history: false,
        can_view_quotes: false,
        created_at: '2026-07-23T00:00:00.000Z',
        expires_at: null,
    };
}

runHomeConnectionSummaryRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
