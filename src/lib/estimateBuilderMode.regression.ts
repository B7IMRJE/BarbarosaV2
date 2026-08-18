import {
    clearEstimateSelectionDraft,
    createSelectedEstimateServiceTransitionController,
    deferEstimateEvidence,
    getEstimateEvidenceReminder,
    getEstimateRequirementControlState,
    getEstimateRequirementReasonChoices,
    getSelectedEstimateServiceActionState,
    hasMeaningfulEstimateSelectionDraft,
    isPredefinedEstimateWorkPathActive,
    isHydratedEstimateSessionReadyForService,
    selectCustomEstimateWorkPath,
    selectPredefinedEstimateWorkPath,
    shouldResetEstimateChecklistForServiceSelection,
    shouldStackEstimateBuilderHeading,
    type EstimateSelectionDraftState,
} from './estimateBuilderMode';

void runEstimateBuilderModeRegressions();

export async function runEstimateBuilderModeRegressions() {
    predefinedAndCustomWorkPathsStayMutuallyExclusive();
    customModeRequiresAnExplicitAction();
    returningToPredefinedRestoresOnlyTheChosenService();
    clearSelectionPreservesUnrelatedEstimateState();
    clearSelectionConfirmsMeaningfulDraftWork();
    evidenceCanBeDeferredWithoutBeingWaived();
    requiredEvidenceReasonsCannotWaiveFinalRequirements();
    capturedPhotoFailureStaysRetryable();
    mobileHeadingsStackBeforeTextCollapses();
    selectedServiceLooksAndActsEnabled();
    reselectingTheCurrentServicePreservesDraftAnswers();
    resumedAssignedDraftIsReadyWithoutSourceReResolution();
    await selectedServiceContinuesThroughTheRealTransition();
    await selectedServiceResolutionIsSingleFlightAndRetryable();
}

function clearSelectionPreservesUnrelatedEstimateState() {
    const state = createDraftState({
        selectedWorkType: 'repair',
        estimateCategoryChosen: true,
        answers: { existing_condition: 'leaking' },
        measurementDraftByKey: { rough_in: '12' },
        persistedOptionChoices: [{ id: 'saved-option' }],
        items: [{ id: 'home-item' }],
        draftContext: { propertyId: 'property-1' },
    });
    const cleared = clearEstimateSelectionDraft(state);

    assert(cleared.selectedWorkType === null, 'Start Over should return Step 1 with no service path active.');
    assert(!cleared.estimateCategoryChosen, 'Start Over should clear the current predefined-service choice.');
    assert(Object.keys(cleared.answers).length === 0, 'Start Over should clear only current draft answers.');
    assert(cleared.persistedOptionChoices[0]?.id === 'saved-option', 'Saved quote options must use their separate remove-option workflow.');
    assert(cleared.items[0]?.id === 'home-item', 'Start Over must preserve the source HomeOS item.');
    assert(cleared.draftContext.propertyId === 'property-1', 'Start Over must preserve customer and property context.');
    assert(cleared.clearedAnswerQuestionIds.includes('existing_condition'), 'Cleared answers must remain cleared after a cross-device resume.');
}

function clearSelectionConfirmsMeaningfulDraftWork() {
    assert(!hasMeaningfulEstimateSelectionDraft(createDraftState()), 'A untouched selection should clear without an unnecessary warning.');
    assert(hasMeaningfulEstimateSelectionDraft(createDraftState({
        customQuoteDraft: { name: 'Custom repair', workScope: '', customerSummary: '', price: '' },
    })), 'Meaningful custom or findings work should require a clear confirmation.');
}

function evidenceCanBeDeferredWithoutBeingWaived() {
    const state = createDraftState({
        answers: { photo_existing: { storagePath: 'existing/photo.jpg' } },
        measurementDraftByKey: { measurement_rough_in: '12' },
    });
    const deferred = deferEstimateEvidence(state);
    const reminder = getEstimateEvidenceReminder({
        deferred: deferred.evidenceDeferred,
        missingPhotoCount: 1,
        missingMeasurementCount: 1,
    });

    assert(deferred.guidedBuildStep === 'price', 'Skip for now should advance the draft to price and summary.');
    assert(deferred.answers.photo_existing === state.answers.photo_existing, 'Deferring evidence must preserve captured photos.');
    assert(deferred.measurementDraftByKey.measurement_rough_in === '12', 'Deferring evidence must preserve measurement drafts.');
    assert(reminder.visible && reminder.blocksFinalization, 'Deferred required evidence must remain incomplete and gate finalization.');
    assert(reminder.title === 'Photos and measurements still needed', 'Review should use a plain durable reminder.');
    assert(!getEstimateEvidenceReminder({ deferred: true, missingPhotoCount: 0, missingMeasurementCount: 0 }).visible,
        'Optional or completed evidence must not create a false required reminder.');
}

function selectedServiceLooksAndActsEnabled() {
    const selected = getSelectedEstimateServiceActionState({ selected: true });
    const unavailable = getSelectedEstimateServiceActionState({ selected: true, unavailable: true });
    const saving = getSelectedEstimateServiceActionState({ selected: true, saving: true });

    assert(!selected.disabled, 'A selected service must remain visibly actionable.');
    assert(selected.label === 'Continue with this service →', 'The selected action must explain that it continues.');
    assert(selected.accessibilityState.selected && !selected.accessibilityState.disabled,
        'Assistive technology should hear selected without hearing disabled.');
    assert(unavailable.disabled && saving.disabled, 'Only truly unavailable or saving states should disable the action.');
    assert(saving.label === 'Opening findings…', 'Saving should show immediate feedback instead of looking unresponsive.');
}

function reselectingTheCurrentServicePreservesDraftAnswers() {
    assert(!shouldResetEstimateChecklistForServiceSelection({
        currentCategory: 'valve_replacement',
        nextCategory: 'valve_replacement',
        categoryChosen: true,
    }), 'Tapping the already-selected service must not erase its resumed findings.');
    assert(shouldResetEstimateChecklistForServiceSelection({
        currentCategory: 'valve_replacement',
        nextCategory: 'faucet_replacement',
        categoryChosen: true,
    }), 'Choosing a different service should start that service checklist.');
}

function resumedAssignedDraftIsReadyWithoutSourceReResolution() {
    const session = createEstimateSession();
    const context = {
        session,
        hydratedSessionId: session.id,
        companyId: session.companyId,
        propertyId: session.propertyId,
        serviceRequestId: session.serviceRequestId,
        jobId: session.jobId,
        scheduleSlotId: session.scheduleSlotId,
        homeItemId: session.homeItemId,
        category: session.category,
    };

    assert(isHydratedEstimateSessionReadyForService(context),
        'A securely hydrated assigned draft should continue without creating or re-resolving a session.');
    assert(!isHydratedEstimateSessionReadyForService({ ...context, hydratedSessionId: 'another-session' }),
        'A stale route session must not be treated as hydrated.');
    assert(!isHydratedEstimateSessionReadyForService({ ...context, jobId: 'another-job' }),
        'A draft from another assigned job must not be reused.');
    assert(!isHydratedEstimateSessionReadyForService({ ...context, category: 'faucet_replacement' }),
        'Changing services must resolve and persist the selected category before continuing.');
}

async function selectedServiceContinuesThroughTheRealTransition() {
    const controller = createSelectedEstimateServiceTransitionController();
    const answers = { existing_access: 'utility-room', pipe_material: 'copper' };
    const answerSnapshot = JSON.stringify(answers);
    let resolverCalls = 0;
    let advanceCalls = 0;
    let opened = false;
    let settled = false;
    let message = '';

    const result = await controller.run({
        selected: true,
        customQuoteMode: false,
        sessionReady: true,
        resolveSession: async () => {
            resolverCalls += 1;
            return createEstimateSession();
        },
        onOpening: () => { opened = true; },
        onAdvance: () => { advanceCalls += 1; },
        onSuccess: () => { message = 'ready'; },
        onFailure: (nextMessage) => { message = nextMessage; },
        onSettled: () => { settled = true; },
    });

    assert(result === 'advanced' && opened && settled, 'The selected-service handler should report immediate work and settle after advancing.');
    assert(resolverCalls === 0, 'A resumed hydrated draft must not enter the session upsert path again.');
    assert(advanceCalls === 1, 'One tap should advance to findings exactly once.');
    assert(message === 'ready', 'The successful transition should provide confirmation instead of a silent no-op.');
    assert(JSON.stringify(answers) === answerSnapshot, 'Continuing a resumed draft must preserve saved findings.');

    await controller.run({
        selected: true,
        customQuoteMode: false,
        sessionReady: true,
        resolveSession: async () => null,
        onOpening: () => undefined,
        onAdvance: () => { advanceCalls += 1; },
        onSuccess: () => undefined,
        onFailure: () => undefined,
        onSettled: () => undefined,
    });

    assert(Number(advanceCalls) === 2, 'After going back to Step 1, the same selected service should continue again without duplication.');
}

async function selectedServiceResolutionIsSingleFlightAndRetryable() {
    const controller = createSelectedEstimateServiceTransitionController();
    const pendingResolution = createDeferred<ReturnType<typeof createEstimateSession> | null>();
    let resolverCalls = 0;
    let advanceCalls = 0;
    let failureMessage = '';
    const resolveSession = () => {
        resolverCalls += 1;
        return pendingResolution.promise;
    };
    const input = {
        selected: true,
        customQuoteMode: false,
        sessionReady: false,
        resolveSession,
        onOpening: () => undefined,
        onAdvance: () => { advanceCalls += 1; },
        onSuccess: () => undefined,
        onFailure: (message: string) => { failureMessage = message; },
        onSettled: () => undefined,
    };
    const first = controller.run(input);
    const doubleTap = controller.run(input);

    assert(first === doubleTap, 'A mobile double tap must share the same in-flight transition.');
    pendingResolution.resolve(null);
    assert(await first === 'failed', 'A missing session should fail with retry guidance instead of silently doing nothing.');
    assert(resolverCalls === 1 && advanceCalls === 0, 'A failed single-flight resolution must not duplicate sessions or advance.');
    assert(failureMessage.includes('retry'), 'A session failure should surface an actionable retry message.');

    const retry = controller.run({
        ...input,
        resolveSession: async () => {
            resolverCalls += 1;
            return createEstimateSession();
        },
    });

    assert(await retry === 'advanced', 'The same action should be retryable after the failed flight settles.');
    assert(Number(resolverCalls) === 2 && Number(advanceCalls) === 1, 'Retry should resolve once and advance without creating parallel work.');
}

function createEstimateSession() {
    return {
        id: 'session-1',
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        jobId: 'job-1',
        scheduleSlotId: 'slot-1',
        homeItemId: 'item-1',
        category: 'valve_replacement',
        status: 'draft',
    };
}

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });

    return { promise, resolve };
}

function requiredEvidenceReasonsCannotWaiveFinalRequirements() {
    const requiredReasons = getEstimateRequirementReasonChoices({ required: true });
    const optionalReasons = getEstimateRequirementReasonChoices({ required: false });

    assert(!requiredReasons.some((choice) => choice.reason === 'not_applicable'),
        'Not Applicable must not appear for genuinely required sizing or safety evidence.');
    assert(optionalReasons.some((choice) => choice.reason === 'not_applicable'),
        'Optional evidence may explicitly record that it does not apply.');
    assert(requiredReasons.some((choice) => choice.reason === 'inaccessible'),
        'Required evidence must still support an auditable inaccessible status.');
    assert(requiredReasons.some((choice) => choice.reason === 'unsafe_to_capture'),
        'Required evidence must still support an auditable unsafe status.');
}

function capturedPhotoFailureStaysRetryable() {
    const failedStagedPhoto = getEstimateRequirementControlState({
        action: null,
        uploading: false,
        pendingPhoto: true,
        error: 'Estimate session unavailable.',
    });
    const savingPhoto = getEstimateRequirementControlState({
        action: 'saving',
        uploading: true,
        pendingPhoto: true,
        error: null,
    });
    const openingPicker = getEstimateRequirementControlState({
        action: 'resolving',
        uploading: false,
        pendingPhoto: false,
        error: null,
    });

    assert(failedStagedPhoto.retryVisible, 'A captured photo must remain available through an explicit Retry Save action.');
    assert(!failedStagedPhoto.reasonsEnabled, 'A retained photo cannot be silently replaced with a skip status.');
    assert(savingPhoto.working && !savingPhoto.retryVisible, 'Saving must prevent double taps until the current attachment finishes.');
    assert(openingPicker.working, 'Opening the camera or photo library must prevent duplicate picker taps.');
}

function mobileHeadingsStackBeforeTextCollapses() {
    assert(shouldStackEstimateBuilderHeading({ width: 320, fontScale: 1 }), 'The narrowest supported iPhone width should stack heading actions.');
    assert(shouldStackEstimateBuilderHeading({ width: 430, fontScale: 1 }), 'Larger iPhones should keep the heading copy at a readable word width.');
    assert(shouldStackEstimateBuilderHeading({ width: 768, fontScale: 1.3 }), 'Increased text scaling should stack controls before characters collapse.');
    assert(!shouldStackEstimateBuilderHeading({ width: 768, fontScale: 1 }), 'Tablet layouts may keep heading actions in one row.');
}

type RegressionDraftState = EstimateSelectionDraftState & {
    persistedOptionChoices: { id: string }[];
    items: { id: string }[];
    draftContext: { propertyId: string };
};

function createDraftState(overrides: Partial<RegressionDraftState> = {}): RegressionDraftState {
    return {
        selectedWorkType: null,
        estimateCategoryChosen: false,
        selectedChoiceId: '',
        answers: {} as Record<string, unknown>,
        measurementDraftByKey: {} as Record<string, string>,
        customQuoteMode: false,
        customQuoteDraft: { name: '', workScope: '', customerSummary: '', price: '' },
        guidedStep: 'build',
        guidedBuildStep: 'work',
        documentationExpanded: false,
        evidenceDeferred: false,
        clearedAnswerQuestionIds: [],
        persistedOptionChoices: [],
        items: [],
        draftContext: { propertyId: '' },
        ...overrides,
    };
}

function predefinedAndCustomWorkPathsStayMutuallyExclusive() {
    const predefined = selectPredefinedEstimateWorkPath('valve_replacement');
    const custom = selectCustomEstimateWorkPath(predefined.predefinedCategory);

    assert(isPredefinedEstimateWorkPathActive(predefined), 'A chosen Price Book service should be the active work path.');
    assert(!isPredefinedEstimateWorkPathActive(custom), 'Custom mode must visibly switch away from the predefined path.');
    assert(custom.mode === 'custom', 'Custom mode should be entered only through the custom action.');
}

function customModeRequiresAnExplicitAction() {
    const selected = selectPredefinedEstimateWorkPath('valve_replacement');

    assert(selected.mode === 'predefined', 'Selecting a predefined service must not advance into custom quote mode.');
    assert(selected.predefinedCategory === 'valve_replacement', 'The selected service must remain intact until an explicit mode change.');
}

function returningToPredefinedRestoresOnlyTheChosenService() {
    const custom = selectCustomEstimateWorkPath('valve_replacement');
    const restored = selectPredefinedEstimateWorkPath(custom.predefinedCategory || 'valve_replacement');

    assert(restored.mode === 'predefined', 'Choosing a service after custom mode should intentionally return to the predefined path.');
    assert(restored.predefinedCategory === 'valve_replacement', 'Returning to predefined mode should restore the chosen service without custom requirements.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Estimate builder mode regression failed: ${message}`);
}
