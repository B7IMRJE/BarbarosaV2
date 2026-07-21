import {
    TECHOS_DASHBOARD_VISUAL_VARIANTS,
    TECHOS_JOB_DETAIL_VISUAL_VARIANTS,
    buildTechOSCurrentJobRoute,
    buildTechOSEstimateRoute,
    buildTechOSProviderHomeRoute,
    getProviderReturnActionLabel,
    getTechOSEstimateActionLabel,
    hasTechOSClientHomeContext,
    resolveTechOSEstimateReturnRoute,
} from './techosClientAccess';

runTechOSClientAccessRegressions();

export function runTechOSClientAccessRegressions() {
    assignedJobWithPropertyCanOpenClientHomeOS();
    clientHomeOSRoutePreservesProviderAndReturnContext();
    currentJobReturnRouteTargetsTheSelectedTechOSJob();
    estimateRouteCarriesJobAndRequestContext();
    techOSEstimateBackUsesCurrentJobContext();
    techOSEstimateBackFallsBackToCompanyWorkspace();
    nonTechOSEstimateKeepsItsExistingBackBehavior();
    existingDraftUsesContinueLabel();
    providerReturnToTechOSUsesCurrentJobLabel();
    dashboardCardsUseDistinctVisualVariants();
    jobDetailSectionsUseDistinctVisualVariants();
}

function assignedJobWithPropertyCanOpenClientHomeOS() {
    assert(hasTechOSClientHomeContext(createContext()), 'Assigned job with property id should show Open Client HomeOS.');
    assert(!hasTechOSClientHomeContext({ ...createContext(), propertyId: null }), 'Missing property id should block client HomeOS opening.');
}

function clientHomeOSRoutePreservesProviderAndReturnContext() {
    const route = buildTechOSProviderHomeRoute(createContext());

    assert(route.pathname === '/', 'Client HomeOS should open the HomeOS dashboard route.');
    assert(route.params.providerMode === '1', 'Client HomeOS route should preserve provider mode.');
    assert(route.params.companyId === 'company-1', 'Client HomeOS route should preserve company id.');
    assert(route.params.propertyId === 'property-1', 'Client HomeOS route should preserve property id.');
    assert(route.params.returnTo === '/techos?companyId=company-1&slotId=slot-1', 'Client HomeOS route should preserve current-job return context.');
    assert(route.params.serviceRequestId === 'request-1', 'Client HomeOS route should preserve service request context.');
    assert(route.params.scheduleSlotId === 'slot-1', 'Client HomeOS route should preserve schedule slot context.');
    assert(route.params.jobId === 'job-1', 'Client HomeOS route should preserve job context.');
}

function currentJobReturnRouteTargetsTheSelectedTechOSJob() {
    assert(
        buildTechOSCurrentJobRoute(createContext()) === '/techos?companyId=company-1&slotId=slot-1',
        'Back to Current Job should return to TechOS with company and slot context.'
    );
}

function estimateRouteCarriesJobAndRequestContext() {
    const route = buildTechOSEstimateRoute(createContext());

    assert(route.pathname === '/estimate', 'Estimate action should open the existing estimate route.');
    assert(route.params.companyId === 'company-1', 'Estimate route should preserve company id.');
    assert(route.params.propertyId === 'property-1', 'Estimate route should preserve property id.');
    assert(route.params.providerMode === '1', 'Estimate route should preserve provider mode for client-scoped drafts.');
    assert(route.params.serviceRequestId === 'request-1', 'Estimate route should preserve service request context.');
    assert(route.params.jobId === 'job-1', 'Estimate route should preserve job context.');
    assert(route.params.returnTo === '/techos?companyId=company-1&slotId=slot-1', 'Estimate route should preserve its current-job return destination.');
}

function techOSEstimateBackUsesCurrentJobContext() {
    assert(
        resolveTechOSEstimateReturnRoute({
            mode: 'techos',
            returnTo: '/techos?companyId=company-1&slotId=slot-1',
            companyId: 'company-1',
        }) === '/techos?companyId=company-1&slotId=slot-1',
        'TechOS estimate Back should return to the selected job instead of browser history.'
    );
}

function techOSEstimateBackFallsBackToCompanyWorkspace() {
    assert(
        resolveTechOSEstimateReturnRoute({
            mode: 'techos',
            returnTo: '/onboarding/create-home',
            companyId: 'company-1',
        }) === '/techos?companyId=company-1',
        'Company estimate Back should return to TechOS and ignore unrelated return routes.'
    );
}

function nonTechOSEstimateKeepsItsExistingBackBehavior() {
    assert(
        resolveTechOSEstimateReturnRoute({
            mode: 'management',
            companyId: 'company-1',
        }) === null,
        'Non-TechOS estimates should keep their existing back behavior.'
    );
}

function existingDraftUsesContinueLabel() {
    assert(getTechOSEstimateActionLabel(0) === 'Create Estimate / Quote', 'Empty draft should use create label.');
    assert(getTechOSEstimateActionLabel(2) === 'Continue Estimate / Quote', 'Existing draft should use continue label.');
}

function providerReturnToTechOSUsesCurrentJobLabel() {
    assert(getProviderReturnActionLabel('/techos?companyId=company-1&slotId=slot-1') === 'Back to Current Job', 'TechOS return route should use current job label.');
}

function dashboardCardsUseDistinctVisualVariants() {
    const accentColors = Object.values(TECHOS_DASHBOARD_VISUAL_VARIANTS).map((variant) => variant.accentColor);

    assert(new Set(accentColors).size === accentColors.length, 'Dashboard cards should resolve to distinct visual variants.');
}

function jobDetailSectionsUseDistinctVisualVariants() {
    const accentColors = Object.values(TECHOS_JOB_DETAIL_VISUAL_VARIANTS).map((variant) => variant.accentColor);

    assert(new Set(accentColors).size >= 6, 'Job-detail sections should resolve to distinct visual variants.');
}

function createContext() {
    return {
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
