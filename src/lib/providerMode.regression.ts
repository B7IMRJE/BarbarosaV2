import {
    hasProviderModeRouteSignal,
    providerModeItemPath,
    providerModePath,
    providerModeQueryParams,
    readProviderModeParams,
} from './providerMode';
import { getProviderReturnActionLabel } from './techosClientAccess';

runProviderModeRegressions();

export function runProviderModeRegressions() {
    providerModeParamsPreserveTechOSJobContext();
    providerModeItemPathPreservesEstimateContext();
    providerModeItemPathPreservesFocusedView();
    providerModeItemPathPreservesCardPresentation();
    providerModePathKeepsBackToCurrentJob();
    providerModePathPreservesExistingAreaQuery();
    providerContextDoesNotInventOptionalIds();
    missingProviderContextIsDetected();
    providerEstimateRouteParamsRemainIntact();
}

function providerModeItemPathPreservesCardPresentation() {
    const itemPath = String(providerModeItemPath('bathroom-vanity', createContext(), {
        presentation: 'assembly',
    }));

    assert(itemPath.includes('presentation=assembly'), 'Nested provider cards should retain the modern card presentation.');
    assert(itemPath.includes('jobId=job-1'), 'Nested provider cards should retain assigned job context.');
}

function providerModeParamsPreserveTechOSJobContext() {
    const context = readProviderModeParams({
        providerMode: '1',
        companyId: 'company-1',
        propertyId: 'property-1',
        returnTo: '/techos?companyId=company-1&slotId=slot-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
    });

    assert(context, 'Provider mode context should be readable from TechOS route params.');
    assert(context.companyId === 'company-1', 'Provider context should keep company id.');
    assert(context.propertyId === 'property-1', 'Provider context should keep property id.');
    assert(context.serviceRequestId === 'request-1', 'Provider context should keep service request id.');
    assert(context.scheduleSlotId === 'slot-1', 'Provider context should keep schedule slot id.');
    assert(context.jobId === 'job-1', 'Provider context should keep job id.');
}

function providerModeItemPathPreservesEstimateContext() {
    const itemPath = String(providerModeItemPath('kitchen-kitchen-faucet', createContext()));

    assert(itemPath.startsWith('/item/kitchen-kitchen-faucet?'), 'Provider item path should target the existing item route.');
    assert(itemPath.includes('providerMode=1'), 'Provider item path should preserve provider mode.');
    assert(itemPath.includes('companyId=company-1'), 'Provider item path should preserve company id.');
    assert(itemPath.includes('propertyId=property-1'), 'Provider item path should preserve property id.');
    assert(itemPath.includes('serviceRequestId=request-1'), 'Provider item path should preserve service request id.');
    assert(itemPath.includes('scheduleSlotId=slot-1'), 'Provider item path should preserve schedule slot id.');
    assert(itemPath.includes('jobId=job-1'), 'Provider item path should preserve job id.');
}

function providerModeItemPathPreservesFocusedView() {
    const itemPath = String(providerModeItemPath('kitchen-angle-stop', createContext(), {
        itemView: 'edit-information',
        saved: '1',
    }));

    assert(itemPath.includes('itemView=edit-information'), 'Provider item path should preserve a focused item-management view.');
    assert(itemPath.includes('saved=1'), 'Provider item path should preserve focused-view confirmation state.');
    assert(itemPath.includes('jobId=job-1'), 'Focused item routes should preserve provider job context.');
}

function providerModePathKeepsBackToCurrentJob() {
    const homePath = String(providerModePath('/', createContext()));

    assert(homePath.includes('returnTo=%2Ftechos%3FcompanyId%3Dcompany-1%26slotId%3Dslot-1'), 'Provider path should keep the TechOS current-job return route.');
    assert(getProviderReturnActionLabel(createContext().returnTo) === 'Back to Current Job', 'TechOS return route should still label Back to Current Job.');
}

function providerModePathPreservesExistingAreaQuery() {
    const areaPath = String(providerModePath('/home/area/Kitchen?parentArea=Guest%20House', createContext()));

    assert(areaPath.includes('?parentArea=Guest%20House&providerMode=1'), 'Provider area routes should append context without replacing the existing area query.');
    assert(areaPath.split('?').length === 2, 'Provider area routes should contain exactly one query delimiter.');
}

function providerContextDoesNotInventOptionalIds() {
    const params = providerModeQueryParams({
        providerMode: true,
        companyId: 'company-1',
        propertyId: 'property-1',
        returnTo: '',
        serviceRequestId: '',
        scheduleSlotId: '',
        jobId: '',
    });

    assert(!('serviceRequestId' in params), 'Empty provider service request id should not be added to route params.');
    assert(!('scheduleSlotId' in params), 'Empty provider schedule slot id should not be added to route params.');
    assert(!('jobId' in params), 'Empty provider job id should not be added to route params.');
}

function missingProviderContextIsDetected() {
    const partialContext = {
        serviceRequestId: 'request-1',
        companyId: 'company-1',
    };

    assert(hasProviderModeRouteSignal(partialContext), 'Partial provider params should be detected as provider context.');
    assert(!readProviderModeParams(partialContext), 'Partial provider params should not silently become a usable provider context.');
}

function providerEstimateRouteParamsRemainIntact() {
    const params = providerModeQueryParams(createContext());

    assert(params.providerMode === '1', 'Provider estimate route should keep provider mode marker.');
    assert(params.companyId === 'company-1', 'Provider estimate route should keep company id.');
    assert(params.propertyId === 'property-1', 'Provider estimate route should keep property id.');
    assert(params.serviceRequestId === 'request-1', 'Provider estimate route should keep service request id.');
    assert(params.scheduleSlotId === 'slot-1', 'Provider estimate route should keep schedule slot id.');
    assert(params.jobId === 'job-1', 'Provider estimate route should keep job id.');
}

function createContext() {
    return {
        providerMode: true,
        companyId: 'company-1',
        propertyId: 'property-1',
        returnTo: '/techos?companyId=company-1&slotId=slot-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
