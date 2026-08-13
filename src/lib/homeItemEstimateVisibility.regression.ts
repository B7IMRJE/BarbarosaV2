import { canShowHomeItemEstimateTools } from './homeItemEstimateVisibility';

runHomeItemEstimateVisibilityRegressions();

export function runHomeItemEstimateVisibilityRegressions() {
    normalHomeOSNeverShowsProviderEstimateTools();
    providerAndManagementWorkspacesRespectEstimateAccess();
}

function normalHomeOSNeverShowsProviderEstimateTools() {
    assert(!canShowHomeItemEstimateTools({
        hasEstimateAccess: true,
        isManagementMode: false,
        isProviderMode: false,
    }), 'A homeowner must not see estimate creation tools, even when the same account also belongs to a company.');
}

function providerAndManagementWorkspacesRespectEstimateAccess() {
    assert(canShowHomeItemEstimateTools({
        hasEstimateAccess: true,
        isManagementMode: false,
        isProviderMode: true,
    }), 'Authorized provider mode should show estimate tools.');
    assert(canShowHomeItemEstimateTools({
        hasEstimateAccess: true,
        isManagementMode: true,
        isProviderMode: false,
    }), 'Authorized ManagementOS should show estimate tools.');
    assert(!canShowHomeItemEstimateTools({
        hasEstimateAccess: false,
        isManagementMode: true,
        isProviderMode: false,
    }), 'A company workspace without estimate access must not show estimate tools.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
