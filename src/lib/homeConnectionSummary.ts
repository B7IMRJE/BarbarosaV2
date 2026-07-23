export type HomeConnectionSummaryRow = {
    id: string;
    property_id: string;
    company_id: string;
    status: string | null;
    request_source: string | null;
    can_view_documents: boolean | null;
    can_view_photos: boolean | null;
    can_view_service_history: boolean | null;
    can_view_quotes: boolean | null;
    created_at: string | null;
    expires_at: string | null;
};

export type PreferredProviderSummaryRow = {
    property_id: string;
    company_id: string;
    property_connection_id: string | null;
    status: string | null;
    source: string | null;
    selected_at: string | null;
};

export function buildCurrentProviderConnections(
    connections: HomeConnectionSummaryRow[],
    preferredProviders: PreferredProviderSummaryRow[]
) {
    const includedProviderKeys = new Set<string>();
    const activePreferredConnections = preferredProviders
        .filter((provider) => normalizeStatus(provider.status) === 'active')
        .map((provider) => {
            const providerKey = connectionKey(provider.property_id, provider.company_id);
            const matchingConnection = connections.find(
                (connection) => connectionKey(connection.property_id, connection.company_id) === providerKey
            );

            includedProviderKeys.add(providerKey);

            if (matchingConnection) {
                return {
                    ...matchingConnection,
                    status: 'connected',
                    created_at: provider.selected_at || matchingConnection.created_at,
                };
            }

            return preferredProviderToConnection(provider);
        });
    const fallbackConnections = connections.filter((connection) => {
        const providerKey = connectionKey(connection.property_id, connection.company_id);

        if (!isChosenProviderConnection(connection) || includedProviderKeys.has(providerKey)) {
            return false;
        }

        includedProviderKeys.add(providerKey);
        return true;
    });

    return [...activePreferredConnections, ...fallbackConnections];
}

export function isChosenProviderConnection(connection: HomeConnectionSummaryRow) {
    const source = normalizeRequestSource(connection.request_source);
    const status = normalizeStatus(connection.status);

    return (
        source === 'homeowner_provider_request' &&
        status !== 'revoked' &&
        status !== 'expired' &&
        status !== 'declined'
    );
}

function preferredProviderToConnection(
    provider: PreferredProviderSummaryRow
): HomeConnectionSummaryRow {
    return {
        id: provider.property_connection_id || `preferred-${provider.property_id}-${provider.company_id}`,
        property_id: provider.property_id,
        company_id: provider.company_id,
        status: 'connected',
        request_source: provider.source || 'preferred_provider',
        can_view_documents: false,
        can_view_photos: false,
        can_view_service_history: false,
        can_view_quotes: false,
        created_at: provider.selected_at,
        expires_at: null,
    };
}

function connectionKey(propertyId: string, companyId: string) {
    return `${propertyId.trim()}|${companyId.trim()}`;
}

function normalizeStatus(status: string | null) {
    return String(status || 'pending').trim().toLowerCase();
}

function normalizeRequestSource(source: string | null) {
    return String(source || '').trim().toLowerCase();
}
