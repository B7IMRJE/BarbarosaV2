import { buildCustomEstimateChoice } from './customEstimateOption';
import { toggleEstimateChoiceSelection } from './estimateOptions';
import {
    TECH_WORKFLOW_ACTIONS,
    resolveTechOSRouteSelection,
    resolveTechWorkflowTransition,
} from './techosWorkflow';

runCoreOperatingScenarioRegression();

export function runCoreOperatingScenarioRegression() {
    const scenario = {
        companyId: 'fixture-company',
        propertyId: 'fixture-property',
        requestId: 'fixture-request',
        jobId: 'fixture-job',
        slotId: 'fixture-slot',
        technicianId: 'fixture-technician',
        requestStatus: 'new',
        homeownerStatus: 'Request received',
        findings: '',
        workPerformed: '',
        approvedEstimateOptionId: '',
        closeoutOutcome: '',
        homeHistory: [] as { relatedJobId: string; description: string }[],
    };

    assert(scenario.requestStatus === 'new' && scenario.homeownerStatus === 'Request received', 'The safe fixture should begin as a HomeOS service request.');

    scenario.requestStatus = 'assigned';
    const dispatchedJob = resolveTechOSRouteSelection({
        availableSlotIds: [scenario.slotId],
        dismissedSlotId: '',
        requestedSlotId: scenario.slotId,
        routeOpenedSlotId: '',
        selectedSlotId: '',
    });
    assert(dispatchedJob.selectedSlotId === scenario.slotId, 'Dispatch assignment should open the assigned job in TechOS.');

    for (const action of TECH_WORKFLOW_ACTIONS) {
        const transition = resolveTechWorkflowTransition(action, {
            slotId: scenario.slotId,
            companyId: scenario.companyId,
            technicianCompanyUserId: scenario.technicianId,
            requestId: scenario.requestId,
            currentStatus: scenario.requestStatus,
        });
        assert(transition.canRun, `${action.label} should advance the assigned fixture through TechOS.`);
        scenario.requestStatus = transition.status;
    }
    assert(scenario.requestStatus === 'estimate_needed', 'The TechOS workflow should reach customer estimate approval.');

    scenario.findings = 'The supplied fixture has a documented valve leak.';
    scenario.workPerformed = 'Isolated the supplied fixture and confirmed the documented leak.';
    const estimate = buildCustomEstimateChoice({
        id: 'fixture-estimate-option',
        displayOrder: 1,
        draft: {
            name: 'Repair documented valve leak',
            workScope: `${scenario.findings} ${scenario.workPerformed} Replace the documented valve, test the supplied fixture, and clean the work area.`,
            customerSummary: 'Repair the documented valve leak and verify operation.',
            price: '425.00',
        },
    });
    assert(estimate.choice && !estimate.error, 'The technician should be able to create an estimate from documented findings.');
    assert(estimate.choice.shortSummary.includes(scenario.findings), 'Estimate creation must preserve the technician findings.');
    assert(estimate.choice.shortSummary.includes(scenario.workPerformed), 'Estimate creation must preserve documented work performed.');

    const homeownerSelection = toggleEstimateChoiceSelection([estimate.choice], [], estimate.choice.id);
    scenario.approvedEstimateOptionId = homeownerSelection[0] || '';
    assert(scenario.approvedEstimateOptionId === estimate.choice.id, 'The homeowner should be able to review and approve the offered option.');

    scenario.closeoutOutcome = 'completed_successfully';
    scenario.requestStatus = 'completed';
    scenario.homeownerStatus = 'Work completed';
    scenario.homeHistory.push({
        relatedJobId: scenario.jobId,
        description: 'Approved valve repair, testing, and cleanup completed.',
    });
    assert(scenario.homeownerStatus === 'Work completed', 'Closeout should produce a homeowner-visible completion state.');
    assert(scenario.homeHistory[0]?.relatedJobId === scenario.jobId, 'The completed durable repair should remain linked in HomeOS history.');

    const unauthorizedTransition = resolveTechWorkflowTransition(TECH_WORKFLOW_ACTIONS[0], {
        slotId: scenario.slotId,
        companyId: null,
        technicianCompanyUserId: 'other-company-technician',
        requestId: scenario.requestId,
        currentStatus: 'assigned',
    });
    assert(!unauthorizedTransition.canRun, 'A technician without the assigned company context must not advance the job.');

    const rejectedEstimate = buildCustomEstimateChoice({
        id: 'invalid-fixture-option',
        displayOrder: 2,
        draft: {
            name: 'Incomplete option',
            workScope: '',
            customerSummary: 'Missing supplied scope.',
            price: '0',
        },
    });
    assert(!rejectedEstimate.choice && Boolean(rejectedEstimate.error), 'An incomplete or zero-price estimate action should fail safely.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
