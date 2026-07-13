import {
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
    providerModePathKeepsBackToCurrentJob();
    providerContextDoesNotInventOptionalIds();
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

function providerModePathKeepsBackToCurrentJob() {
    const homePath = String(providerModePath('/', createContext()));

    assert(homePath.includes('returnTo=%2Ftechos%3FcompanyId%3Dcompany-1%26slotId%3Dslot-1'), 'Provider path should keep the TechOS current-job return route.');
    assert(getProviderReturnActionLabel(createContext().returnTo) === 'Back to Current Job', 'TechOS return route should still label Back to Current Job.');
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
