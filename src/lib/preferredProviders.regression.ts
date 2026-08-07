import {
    getEmergencyProviderReturnTo,
    selectConnectedProviderCompanyId,
} from './preferredProviders';

runPreferredProviderRegressions();

export function runPreferredProviderRegressions() {
    classifiedActiveConnectionCanRestoreRequestFlow();
    unclassifiedOrInactiveConnectionsStayUnavailable();
    emergencyReturnRouteIsRestricted();
}

function classifiedActiveConnectionCanRestoreRequestFlow() {
    const selectedId = selectConnectedProviderCompanyId(
        [
            { company_id: 'inactive-client', status: 'archived' },
            { company_id: 'active-plumber', status: 'active' },
        ],
        [
            company('inactive-client', ['Plumbing'], 'active'),
            company('active-plumber', ['Leak Detection'], 'active'),
        ]
    );

    assert(selectedId === 'active-plumber', 'An active, classified connected provider should restore emergency sending.');
}

function unclassifiedOrInactiveConnectionsStayUnavailable() {
    const selectedId = selectConnectedProviderCompanyId(
        [
            { company_id: 'unclassified', status: 'active' },
            { company_id: 'inactive-company', status: 'connected' },
        ],
        [
            company('unclassified', ['No category'], 'active'),
            company('inactive-company', ['Plumbing'], 'inactive'),
        ]
    );

    assert(!selectedId, 'Unclassified or inactive providers must not receive an emergency request.');
}

function emergencyReturnRouteIsRestricted() {
    assert(
        getEmergencyProviderReturnTo('/emergency/emergency-1') === '/emergency/emergency-1',
        'Provider selection should return to the originating emergency.'
    );
    assert(!getEmergencyProviderReturnTo('/management'), 'Provider selection must not accept unrelated return routes.');
    assert(!getEmergencyProviderReturnTo('//example.com'), 'Provider selection must not accept external return routes.');
}

function company(id: string, serviceCategories: string[] | null, status: string) {
    return {
        id,
        service_categories: serviceCategories,
        status,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
