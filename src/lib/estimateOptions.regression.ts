import {
    buildEstimateOptionWorkspace,
    calculateEstimateOptionPrice,
    calculateRepipeTotals,
    canManageEstimatePricing,
    canUseEstimatePricing,
    createEstimateRequirementSkipAnswer,
    dedupeEstimateDraftItems,
    filterApprovedActiveProducts,
    filterRuleCompatibleProducts,
    getEstimateRequirementState,
    getEstimateCategoryTemplate,
    isPhotoRequirementComplete,
    measurementRequirementAnswerKey,
    photoRequirementAnswerKey,
    isProductSelectable,
    isRequirementSkipAnswer,
    mapCompanyPriceBookItemToEstimateEntry,
    resolveEstimatePresentationLayout,
    resolveProductImageState,
    toHomeownerPresentationChoice,
    toggleEstimateMultiSelectAnswer,
    validateAiEstimateDraftResponse,
    validateEstimateAnswers,
    type EstimateApprovedProduct,
    type EstimateAnswerSet,
    type CompanyPriceBookItemLike,
    type EstimateDraftContextLike,
    type EstimateDraftItemLike,
    type EstimateOptionCategory,
    type EstimateRequirementMeasurementAnswer,
    type EstimateRequirementPhotoAnswer,
    type EstimatePriceBookEntry,
    type RepipeRoomBlock,
    type RepipeStructureInput,
} from './estimateOptions';

runEstimateOptionsRegressions();

export function runEstimateOptionsRegressions() {
    technicianCannotEditManagementPricing();
    anotherCompanyCannotReadPriceBook();
    inactiveEntriesCannotBeUsedInNewOptions();
    missingPriceBookBlocksPresentation();
    priceSnapshotsRemainStableAfterEdits();
    belowMinimumRequiresApproval();
    maximumRulesAreEnforced();
    onlyApprovedActiveProductsCanBeSelected();
    productMediaRemainsCompanyScoped();
    aiCannotReferenceUnprovidedProduct();
    anotherCompanyProductNeverAppears();
    noneRequiredIsExclusiveForCodeCorrections();
    unansweredPrioritiesDoNotBlockAiDrafting();
    notDiscussedWarrantyDoesNotBlockFirstDraft();
    skippedPhotosDoNotCountAsUploadedPhotos();
    skippedNoncriticalEvidenceAllowsDraftCreation();
    criticalSafetyEvidenceStillBlocksPresentation();
    incompleteDraftShowsAssumptionsAndWarnings();
    toiletRequiredQuestionsAreEnforced();
    disposalRequiredQuestionsAreEnforced();
    waterHeaterChecklistIsEnforced();
    faucetSelectionsClearQuestionRequirementsBeforeChecklistIsComplete();
    faucetPhotosRequirePersistedAttachmentMetadata();
    eachFaucetPhotoClearsOnlyItsMatchingBlocker();
    validHoleSpreadInputClearsMeasurementBlocker();
    completedFaucetRequirementsSurviveJsonRoundTrip();
    removingFaucetPhotoMakesRequirementIncompleteAgain();
    failedPhotoUploadDoesNotMarkRequirementDone();
    faucetChecklistCompletionClearsAnswerGate();
    completedFaucetRequirementsLeavePricingAsOnlyMissingSetupBlocker();
    completeFaucetRequirementsWithTwoPricedEntriesClearPricingSetup();
    faucetPricedEntriesGenerateMateriallyDifferentChoices();
    inactiveOrIncompatibleFaucetEntriesDoNotCount();
    faucetSourceSelectionFiltersApprovedProductScope();
    technicianApprovalRemainsRequiredAfterFaucetPricingSucceeds();
    rulesFilterIncompatibleProducts();
    doubleVanityCountsTwoHotAndTwoCold();
    toiletCountsOneColdPoint();
    repeatableBathroomBlocksTotalCorrectly();
    kitchenFixtureSelectionsTotalCorrectly();
    technicianOverridesAreRecorded();
    repipeCalculationIsDeterministic();
    aiOutputCannotAlterNumericPrices();
    aiCanDraftSingleWorkingOption();
    pricingCalculationIsDeterministic();
    storyAndAccessModifiersOnlyApplyWhenSelected();
    requiredSafetyLinesCannotBeRemoved();
    generatesTwoToFourOptions();
    generatesNoMoreThanTwoPackages();
    maximumChoicesIsSix();
    optionsAreMateriallyDifferent();
    personalizedTitleUsesFirstNameSafely();
    missingFirstNameUsesFallback();
    invalidAiReferencesAreRejected();
    technicianApprovalRequiredBeforePresentation();
    estimateContextIsPreserved();
    duplicateHomeOsItemsAreDeduped();
    companyScopeBlocksUrlManipulation();
    estimateActionsDoNotMutateHomeownerRecords();
    presentationLayoutCoversPhoneTabletDesktop();
    productImagesHaveLoadingStates();
    homeownerPresentationHidesInternalPricing();
}

function technicianCannotEditManagementPricing() {
    assert(!canManageEstimatePricing({ role: 'technician', status: 'active' }), 'Technicians must not edit management pricing.');
    assert(canUseEstimatePricing({ role: 'technician', status: 'active' }), 'Active technicians should use estimate pricing for TechOS/provider estimates.');
    assert(canUseEstimatePricing({ role: 'tech', status: 'active' }), 'Active tech alias should use estimate pricing for TechOS/provider estimates.');
    assert(!canUseEstimatePricing({ role: 'technician', status: 'inactive' }), 'Inactive technicians must not use estimate pricing.');
    assert(canManageEstimatePricing({ role: 'manager', status: 'active' }), 'Managers should edit management pricing.');
}

function anotherCompanyCannotReadPriceBook() {
    const workspace = buildWorkspace({
        companyId: 'company-a',
        priceBookItems: [priceBookItem('company-b', 1, 'Toilets', 100)],
    });

    assert(workspace.eligiblePriceBookEntries.length === 0, 'Another company price book must not be eligible.');
    assert(workspace.pricingSetupRequired, 'Wrong-company price book should behave as missing setup.');
}

function inactiveEntriesCannotBeUsedInNewOptions() {
    const entry = estimateEntry('company-a', 'inactive', 100, { active: false });
    const result = calculateEstimateOptionPrice({
        id: 'inactive-option',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 1, source: 'base_installation', required: true, removable: false }],
        priceBookVersion: 'v1',
    });

    assert(result.missingPricingInputs.some((message) => message.includes('inactive')), 'Inactive entries should block pricing.');
}

function missingPriceBookBlocksPresentation() {
    const workspace = buildWorkspace({ priceBookItems: [], technicianApproved: true });

    assert(workspace.pricingSetupRequired, 'Empty price book should require pricing setup.');
    assert(workspace.presentationGate.blockers.includes('Pricing setup required.'), 'Missing pricing must block presentation.');
}

function priceSnapshotsRemainStableAfterEdits() {
    const entry = estimateEntry('company-a', 'snapshot', 125);
    const result = calculateEstimateOptionPrice({
        id: 'snapshot-option',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 1, source: 'base_installation', required: true, removable: false }],
        priceBookVersion: 'v1',
    });

    entry.recommendedSellingPrice = 999;

    assert(result.priceBookSnapshot[0]?.recommendedSellingPrice === 125, 'Snapshot should not change after later price book edits.');
}

function belowMinimumRequiresApproval() {
    const entry = estimateEntry('company-a', 'minimum', 100, { minimumPermittedSellingPrice: 90 });
    const result = calculateEstimateOptionPrice({
        id: 'minimum-option',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 1, source: 'base_installation', required: true, removable: false }],
        priceBookVersion: 'v1',
        requestedTotalAmount: 50,
    });

    assert(result.requiredManagementApproval, 'Below-minimum totals must require approval.');
}

function maximumRulesAreEnforced() {
    const entry = estimateEntry('company-a', 'maximum', 100, { maximumPermittedSellingPrice: 120 });
    const result = calculateEstimateOptionPrice({
        id: 'maximum-option',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 1, source: 'base_installation', required: true, removable: false }],
        priceBookVersion: 'v1',
        requestedTotalAmount: 150,
    });

    assert(result.requiredManagementApproval, 'Above-maximum totals must require approval.');
}

function onlyApprovedActiveProductsCanBeSelected() {
    assert(isProductSelectable(product('company-a', 'product-a', true, true), 'company-a'), 'Approved active product should be selectable.');
    assert(!isProductSelectable(product('company-a', 'product-b', false, true), 'company-a'), 'Unapproved product should not be selectable.');
    assert(!isProductSelectable(product('company-a', 'product-c', true, false), 'company-a'), 'Inactive product should not be selectable.');
}

function productMediaRemainsCompanyScoped() {
    const template = getEstimateCategoryTemplate('toilet_replacement');
    const products = [
        product('company-a', 'company-a-product', true, true),
        product('company-b', 'company-b-product', true, true),
    ];

    const filtered = filterApprovedActiveProducts(products, 'company-a', template);

    assert(filtered.length === 1 && filtered[0]?.companyId === 'company-a', 'Product media/catalog choices must remain company-scoped.');
}

function aiCannotReferenceUnprovidedProduct() {
    const result = validateAiEstimateDraftResponse(aiResponse({ productIds: ['outside-product'] }), approvedAiContext());

    assert(!result.valid, 'AI must not reference a product outside the approved candidate list.');
}

function anotherCompanyProductNeverAppears() {
    const template = getEstimateCategoryTemplate('toilet_replacement');
    const filtered = filterApprovedActiveProducts([product('company-b', 'foreign-product', true, true)], 'company-a', template);

    assert(filtered.length === 0, 'Another company product should never appear.');
}

function noneRequiredIsExclusiveForCodeCorrections() {
    const question = getEstimateCategoryTemplate('water_heater').questions.find((candidate) => candidate.id === 'code_corrections');

    assert(question?.allowedAnswers?.includes('None required'), 'Water-heater code corrections should include None required.');

    const noneOnly = toggleEstimateMultiSelectAnswer(question!, ['permit', 'straps'], 'None required');
    const correctionOnly = toggleEstimateMultiSelectAnswer(question!, ['None required'], 'permit');

    assert(noneOnly.length === 1 && noneOnly[0] === 'None required', 'Selecting None required should clear code corrections.');
    assert(correctionOnly.length === 1 && correctionOnly[0] === 'permit', 'Selecting a code correction should clear None required.');
}

function unansweredPrioritiesDoNotBlockAiDrafting() {
    const answers = completeAnswers('water_heater');

    delete answers.homeowner_priorities;

    const workspace = buildWorkspace({
        category: 'water_heater',
        answers,
        priceBookItems: pricedItems('Water Heaters'),
    });

    assert(workspace.draftGate.canDraft, 'Unanswered homeowner priorities should not block the first AI draft.');
    assert(workspace.draftGate.assumptionsUsedInDraft.some((entry) => entry.includes('Homeowner priorities')), 'Priority gaps should be shown as draft assumptions.');
}

function notDiscussedWarrantyDoesNotBlockFirstDraft() {
    const answers = completeAnswers('water_heater');

    answers.desired_warranty = 'Not discussed yet';

    const workspace = buildWorkspace({
        category: 'water_heater',
        answers,
        priceBookItems: pricedItems('Water Heaters'),
    });

    assert(workspace.draftGate.canDraft, 'Not discussed yet warranty should not block first AI drafting.');
    assert(!workspace.answerValidation.missingRequiredQuestionIds.includes('desired_warranty'), 'Warranty should no longer be a required first-draft question.');
}

function skippedPhotosDoNotCountAsUploadedPhotos() {
    const skip = createEstimateRequirementSkipAnswer('Existing unit photo', 'inaccessible', '2026-07-15T12:00:00.000Z');

    assert(isRequirementSkipAnswer(skip), 'Skipped requirement should save a structured skip state.');
    assert(!isPhotoRequirementComplete(skip), 'Skipped photo requirement should not count as an uploaded photo.');
    assert(getEstimateRequirementState(skip, isPhotoRequirementComplete(skip)) === 'skipped', 'Skipped requirement should report skipped state.');
}

function skippedNoncriticalEvidenceAllowsDraftCreation() {
    const answers = completeAnswers('water_heater');

    answers[photoRequirementAnswerKey('Existing unit photo')] = createEstimateRequirementSkipAnswer('Existing unit photo', 'customer_unavailable', '2026-07-15T12:00:00.000Z');

    const workspace = buildWorkspace({
        category: 'water_heater',
        answers,
        priceBookItems: pricedItems('Water Heaters'),
    });

    assert(workspace.draftGate.canDraft, 'Skipped noncritical evidence should still allow a working AI draft.');
    assert(workspace.draftGate.skippedForNow.some((entry) => entry.includes('Existing unit photo')), 'Skipped evidence should be listed separately.');
    assert(workspace.presentationGate.blockers.some((entry) => entry.includes('Required photos still missing')), 'Skipped photo evidence should still block final presentation.');
}

function criticalSafetyEvidenceStillBlocksPresentation() {
    const answers = completeAnswers('water_heater');

    delete answers.venting;
    delete answers.tp_discharge;

    const workspace = buildWorkspace({
        category: 'water_heater',
        answers,
        priceBookItems: pricedItems('Water Heaters'),
        technicianApproved: true,
    });

    assert(workspace.draftGate.canDraft, 'Missing safety checklist answers should be draft warnings, not draft blockers.');
    assert(workspace.presentationGate.blockers.some((entry) => entry.includes('Venting')), 'Critical safety answers should still block presentation.');
}

function incompleteDraftShowsAssumptionsAndWarnings() {
    const workspace = buildWorkspace({
        category: 'water_heater',
        answers: {
            fuel_type: 'gas',
            tank_or_tankless: '50 gallon',
            code_corrections: ['None required'],
        },
        priceBookItems: [priceBookItem('company-a', 1, 'Water Heaters', 2400)],
    });

    assert(workspace.draftGate.canDraft, 'Minimum context and one deterministic price path should allow an incomplete working draft.');
    assert(workspace.draftGate.warnings.length > 0, 'Incomplete drafts should show warnings.');
    assert(workspace.draftGate.assumptionsUsedInDraft.length > 0, 'Incomplete drafts should show assumptions.');
    assert(workspace.draftGate.missingBeforeFinalPresentation.length > 0, 'Incomplete drafts should list remaining presentation requirements.');
}

function toiletRequiredQuestionsAreEnforced() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('toilet_replacement'), {});

    assert(validation.missingRequiredQuestionIds.includes('rough_in'), 'Toilet rough-in question should be required.');
    assert(validation.missingRequiredQuestionIds.includes('bowl_shape'), 'Toilet shape question should be required.');
    assert(validation.missingRequiredQuestionIds.includes('height'), 'Toilet height question should be required.');
    assert(validation.missingRequiredQuestionLabels.includes('Rough-in'), 'Missing required question warnings should use display labels.');
}

function disposalRequiredQuestionsAreEnforced() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('garbage_disposal'), {});

    assert(validation.missingRequiredQuestionIds.includes('horsepower'), 'Disposal horsepower should be required.');
    assert(validation.missingRequiredQuestionIds.includes('existing_power'), 'Disposal electrical question should be required.');
}

function waterHeaterChecklistIsEnforced() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('water_heater'), {});

    assert(validation.missingRequiredQuestionIds.includes('fuel_type'), 'Water-heater fuel type should be required.');
    assert(validation.missingRequiredQuestionIds.includes('venting'), 'Water-heater venting should be required.');
    assert(validation.missingRequiredQuestionIds.includes('tp_discharge'), 'Water-heater T&P discharge should be required.');
}

function faucetSelectionsClearQuestionRequirementsBeforeChecklistIsComplete() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), {
        fixture_area: 'kitchen',
        hole_spread: '8 in widespread',
        customer_supplied: 'company approved product',
        shutoff_condition: 'replace required',
        supply_lines: 'yes',
        pop_up_or_drain: 'yes',
    });

    assert(validation.missingRequiredQuestionIds.length === 0, 'Selected faucet chips should satisfy required question cards.');
    assert(validation.missingRequiredPhotoLabels.includes('Existing faucet'), 'Faucet photos should remain separately required.');
    assert(validation.missingRequiredMeasurementLabels.includes('Hole spread'), 'Faucet hole-spread measurement should remain separately required.');
    assert(!validation.complete, 'Faucet validation should remain incomplete until checklist requirements are complete.');
}

function faucetPhotosRequirePersistedAttachmentMetadata() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), {
        ...faucetQuestionAnswers(),
        [photoRequirementAnswerKey('Existing faucet')]: true,
    });

    assert(validation.missingRequiredPhotoLabels.includes('Existing faucet'), 'Boolean photo completion should not satisfy a persisted photo requirement.');
}

function eachFaucetPhotoClearsOnlyItsMatchingBlocker() {
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), {
        ...faucetQuestionAnswers(),
        [photoRequirementAnswerKey('Existing faucet')]: photoAnswer('Existing faucet'),
    });

    assert(!validation.missingRequiredPhotoLabels.includes('Existing faucet'), 'Persisted existing-faucet photo should clear its matching blocker.');
    assert(validation.missingRequiredPhotoLabels.includes('Under-sink connections'), 'Existing faucet photo should not clear under-sink photo blocker.');
    assert(validation.missingRequiredPhotoLabels.includes('Sink hole layout'), 'Existing faucet photo should not clear sink-hole photo blocker.');
}

function validHoleSpreadInputClearsMeasurementBlocker() {
    const blankValidation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), {
        ...faucetQuestionAnswers(),
        [measurementRequirementAnswerKey('Hole spread')]: {
            kind: 'requirement_measurement',
            value: 0,
            unit: 'in',
            capturedAt: '2026-07-14T00:00:00.000Z',
        },
    });
    const validValidation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), {
        ...faucetQuestionAnswers(),
        [measurementRequirementAnswerKey('Hole spread')]: measurementAnswer(8, 'in'),
    });

    assert(blankValidation.missingRequiredMeasurementLabels.includes('Hole spread'), 'Non-positive hole spread should remain blocked.');
    assert(!validValidation.missingRequiredMeasurementLabels.includes('Hole spread'), 'Positive hole spread should clear the measurement blocker.');
}

function completedFaucetRequirementsSurviveJsonRoundTrip() {
    const restoredAnswers = JSON.parse(JSON.stringify(completeAnswers('faucet_replacement'))) as EstimateAnswerSet;
    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), restoredAnswers);

    assert(validation.complete, 'Persisted JSON photo and measurement answers should restore completed faucet requirements.');
}

function removingFaucetPhotoMakesRequirementIncompleteAgain() {
    const answers = completeAnswers('faucet_replacement');

    delete answers[photoRequirementAnswerKey('Existing faucet')];

    const validation = validateEstimateAnswers(getEstimateCategoryTemplate('faucet_replacement'), answers);

    assert(validation.missingRequiredPhotoLabels.includes('Existing faucet'), 'Removing a persisted photo should make that requirement incomplete again.');
}

function failedPhotoUploadDoesNotMarkRequirementDone() {
    assert(!isPhotoRequirementComplete(null), 'Missing photo answer should not be done after a failed upload.');
    assert(!isPhotoRequirementComplete(false), 'Failed upload flags should not satisfy photo requirements.');
}

function faucetChecklistCompletionClearsAnswerGate() {
    const validation = validateEstimateAnswers(
        getEstimateCategoryTemplate('faucet_replacement'),
        completeAnswers('faucet_replacement')
    );

    assert(validation.complete, 'Complete faucet questions, photos, and measurements should clear the answer gate.');
    assert(validation.missingRequiredQuestionIds.length === 0, 'No faucet questions should remain missing.');
    assert(validation.missingRequiredPhotoLabels.length === 0, 'No faucet photos should remain missing.');
    assert(validation.missingRequiredMeasurementLabels.length === 0, 'No faucet measurements should remain missing.');
}

function completedFaucetRequirementsLeavePricingAsOnlyMissingSetupBlocker() {
    const workspace = buildWorkspace({
        category: 'faucet_replacement',
        answers: completeAnswers('faucet_replacement'),
        priceBookItems: [],
        technicianApproved: false,
    });

    assert(workspace.presentationGate.blockers.length === 1, 'Complete faucet requirements with empty price book should leave only one blocker.');
    assert(workspace.presentationGate.blockers[0] === 'Pricing setup required.', 'Pricing setup should be the remaining blocker.');
}

function completeFaucetRequirementsWithTwoPricedEntriesClearPricingSetup() {
    const workspace = faucetWorkspace();

    assert(!workspace.pricingSetupRequired, 'Two compatible faucet entries should clear pricing setup.');
    assert(!workspace.presentationGate.blockers.includes('Pricing setup required.'), 'Faucet pricing entries should remove the setup blocker.');
}

function faucetPricedEntriesGenerateMateriallyDifferentChoices() {
    const workspace = faucetWorkspace();
    const individualTitles = workspace.individualOptions.map((choice) => choice.title);
    const individualTotals = workspace.individualOptions.map((choice) => choice.pricingResult.totalAmount).sort((first, second) => first - second);
    const approvedChoice = workspace.individualOptions.find((choice) => choice.title === 'Install Company-Approved Faucet');

    assert(workspace.individualOptions.length >= 2, 'Faucet pricing should produce at least two individual choices.');
    assert(individualTitles.includes('Reinstall Existing Faucet'), 'Existing-faucet reinstall option should be generated.');
    assert(individualTitles.includes('Install Company-Approved Faucet'), 'Company-approved faucet option should be generated.');
    assert(individualTotals[0] === 375 && individualTotals[1] === 725, 'Faucet choices should use the provisional Bravo deterministic prices.');
    assert(approvedChoice?.homeownerExplanation.includes('$200 faucet allowance'), 'Company-approved faucet option should disclose the allowance.');
    assert(workspace.individualOptions[0]?.pricingResult.totalAmount !== workspace.individualOptions[1]?.pricingResult.totalAmount, 'Faucet options should have materially different deterministic totals.');
}

function inactiveOrIncompatibleFaucetEntriesDoNotCount() {
    const inactiveApproved = faucetPriceBookItem('faucet-install-company-approved', 725, {
        active: false,
    });
    const incompatibleApproved = faucetPriceBookItem('faucet-install-company-approved', 725, {
        applicable_categories: ['wall mount'],
    });
    const inactiveWorkspace = faucetWorkspace({ priceBookItems: [faucetPriceBookItem('faucet-reinstall-existing', 375), inactiveApproved] });
    const incompatibleWorkspace = faucetWorkspace({ priceBookItems: [faucetPriceBookItem('faucet-reinstall-existing', 375), incompatibleApproved] });

    assert(inactiveWorkspace.individualOptions.length === 1, 'Inactive faucet entry should not count as a valid option.');
    assert(incompatibleWorkspace.individualOptions.length === 1, 'Hole-spread-incompatible faucet entry should not count as a valid option.');
    assert(inactiveWorkspace.presentationGate.blockers.includes('At least two materially different individual options are required.'), 'Inactive entry should leave the two-option gate blocked.');
    assert(incompatibleWorkspace.presentationGate.blockers.includes('At least two materially different individual options are required.'), 'Incompatible entry should leave the two-option gate blocked.');
}

function faucetSourceSelectionFiltersApprovedProductScope() {
    const customerSuppliedAnswers = {
        ...completeAnswers('faucet_replacement'),
        customer_supplied: 'customer supplied',
    };
    const companyApprovedWorkspace = faucetWorkspace();
    const customerSuppliedWorkspace = faucetWorkspace({ answers: customerSuppliedAnswers });

    assert(companyApprovedWorkspace.individualOptions.some((choice) => choice.title === 'Install Company-Approved Faucet'), 'Company-approved fixture source should include approved faucet install scope.');
    assert(!customerSuppliedWorkspace.individualOptions.some((choice) => choice.title === 'Install Company-Approved Faucet'), 'Customer-supplied fixture source should not include company-approved faucet install scope.');
    assert(customerSuppliedWorkspace.individualOptions.some((choice) => choice.title === 'Reinstall Existing Faucet'), 'Customer-supplied fixture source should still allow existing/supplied faucet reinstall scope.');
}

function technicianApprovalRemainsRequiredAfterFaucetPricingSucceeds() {
    const workspace = faucetWorkspace({ technicianApproved: false });

    assert(!workspace.pricingSetupRequired, 'Faucet pricing should be available before technician approval.');
    assert(workspace.presentationGate.blockers.includes('Technician approval is required before presentation.'), 'Technician approval should still gate presentation after faucet pricing succeeds.');
}

function rulesFilterIncompatibleProducts() {
    const products = [
        product('company-a', 'allowed', true, true),
        product('company-a', 'blocked', true, true),
    ];
    const filtered = filterRuleCompatibleProducts(products, {
        categoryFilters: ['toilet'],
        incompatibleProductIds: ['blocked'],
    });

    assert(filtered.length === 1 && filtered[0]?.id === 'allowed', 'Incompatible products should be filtered out.');
}

function doubleVanityCountsTwoHotAndTwoCold() {
    const result = calculateRepipeTotals(structure(), [roomBlock('bath-1', 'Bathroom', { double_vanity: 1 })]);

    assert(result.totals.hotFixturePoints === 2, 'Double vanity should produce 2 hot points.');
    assert(result.totals.coldFixturePoints === 2, 'Double vanity should produce 2 cold points.');
}

function toiletCountsOneColdPoint() {
    const result = calculateRepipeTotals(structure(), [roomBlock('bath-1', 'Bathroom', { toilet: 1 })]);

    assert(result.totals.hotFixturePoints === 0, 'Toilet should not add hot points.');
    assert(result.totals.coldFixturePoints === 1, 'Toilet should produce one cold point.');
}

function repeatableBathroomBlocksTotalCorrectly() {
    const result = calculateRepipeTotals(structure(), [
        roomBlock('bath-1', 'Bathroom', { single_vanity: 1, toilet: 1, shower: 1 }),
        roomBlock('bath-2', 'Bathroom', { double_vanity: 1, toilet: 1, tub_shower: 1 }),
    ]);

    assert(result.totals.fixtureBlocks === 2, 'Repeatable bathroom blocks should total fixture blocks.');
    assert(result.totals.hotFixturePoints === 5, 'Bathroom hot points should total correctly.');
    assert(result.totals.coldFixturePoints === 7, 'Bathroom cold points should total correctly.');
}

function kitchenFixtureSelectionsTotalCorrectly() {
    const result = calculateRepipeTotals(structure(), [
        roomBlock('kitchen', 'Kitchen', {
            kitchen_sink: 1,
            dishwasher: 1,
            refrigerator_water_line: 1,
            filtration_faucet: 1,
            instant_hot_dispenser: 1,
            pot_filler: 1,
            ice_maker: 1,
            garbage_disposal: 1,
        }),
    ]);

    assert(result.totals.hotFixturePoints === 3, 'Kitchen hot points should total correctly.');
    assert(result.totals.coldFixturePoints === 5, 'Kitchen cold points should total correctly.');
}

function technicianOverridesAreRecorded() {
    const result = calculateRepipeTotals(structure(), [roomBlock('bath-1', 'Bathroom', { toilet: 1 })], [
        { field: 'coldFixturePoints', value: 3, reason: 'Two extra cold points verified onsite.' },
    ]);

    assert(result.totals.coldFixturePoints === 3, 'Override should update the calculated count.');
    assert(result.auditTrail.some((entry) => entry.includes('Override coldFixturePoints')), 'Override should be auditable.');
}

function repipeCalculationIsDeterministic() {
    const blocks = [roomBlock('bath-1', 'Bathroom', { double_vanity: 1, toilet: 1 })];
    const first = calculateRepipeTotals(structure(), blocks);
    const second = calculateRepipeTotals(structure(), blocks);

    assert(JSON.stringify(first.totals) === JSON.stringify(second.totals), 'Repipe calculation should be deterministic.');
}

function aiOutputCannotAlterNumericPrices() {
    const result = validateAiEstimateDraftResponse({
        choices: [
            {
                ...aiChoice(),
                total_price: 100,
            },
            aiChoice({ sourceChoiceId: 'individual-2', displayOrder: 2 }),
        ],
    }, approvedAiContext());

    assert(!result.valid, 'AI numeric price fields must be rejected.');
}

function aiCanDraftSingleWorkingOption() {
    const result = validateAiEstimateDraftResponse({
        choices: [aiChoice()],
    }, approvedAiContext());

    assert(result.valid, 'AI may draft copy for one deterministic working option before final presentation.');
}

function pricingCalculationIsDeterministic() {
    const entry = estimateEntry('company-a', 'deterministic', 100);
    const input = {
        id: 'deterministic-option',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 2, source: 'base_installation' as const, required: true, removable: false }],
        priceBookVersion: 'v1',
    };
    const first = calculateEstimateOptionPrice(input);
    const second = calculateEstimateOptionPrice(input);

    assert(JSON.stringify(first) === JSON.stringify(second), 'Same inputs and price book version should produce the same price.');
}

function storyAndAccessModifiersOnlyApplyWhenSelected() {
    const standard = calculateRepipeTotals({ ...structure(), stories: 1, routingDifficulty: 'standard' }, []);
    const difficult = calculateRepipeTotals({ ...structure(), stories: 2, routingDifficulty: 'difficult' }, []);

    assert(standard.totals.storyAccessModifier === 0, 'One-story structure should have no story modifier.');
    assert(standard.totals.routingDifficultyModifier === 0, 'Standard routing should have no difficulty modifier.');
    assert(difficult.totals.storyAccessModifier === 1, 'Second story should add a story modifier.');
    assert(difficult.totals.routingDifficultyModifier === 2, 'Difficult routing should add only when selected.');
}

function requiredSafetyLinesCannotBeRemoved() {
    const entry = estimateEntry('company-a', 'base', 100);
    const result = calculateEstimateOptionPrice({
        id: 'missing-safety',
        companyId: 'company-a',
        priceBookEntries: [entry],
        lineInputs: [{ priceBookEntryId: entry.id, quantity: 1, source: 'base_installation', required: true, removable: false }],
        priceBookVersion: 'v1',
        requiredScopeCodes: ['required-safety-code'],
    });

    assert(result.missingPricingInputs.some((message) => message.includes('Required safety/code scope')), 'Required safety/code lines cannot be removed.');
}

function generatesTwoToFourOptions() {
    const workspace = completeWorkspace();

    assert(workspace.individualOptions.length >= 2, 'Should generate at least 2 individual options.');
    assert(workspace.individualOptions.length <= 4, 'Should generate no more than 4 individual options.');
}

function generatesNoMoreThanTwoPackages() {
    const workspace = completeWorkspace();

    assert(workspace.packages.length <= 2, 'Should generate no more than 2 packages.');
}

function maximumChoicesIsSix() {
    const workspace = completeWorkspace();

    assert(workspace.choices.length <= 6, 'Should generate no more than 6 homeowner-facing choices.');
}

function optionsAreMateriallyDifferent() {
    const workspace = completeWorkspace();
    const inclusionSets = workspace.individualOptions.map((choice) => choice.inclusionIds.join('|'));

    assert(new Set(inclusionSets).size === inclusionSets.length, 'Options should differ by approved scope/inclusions.');
}

function personalizedTitleUsesFirstNameSafely() {
    const workspace = completeWorkspace({ draftContext: context('Alfredo Garcia') });

    assert(workspace.choices[0]?.title.startsWith("Alfredo's"), 'Preferred first name should personalize titles safely.');
}

function missingFirstNameUsesFallback() {
    const workspace = completeWorkspace({ draftContext: context(null) });

    assert(!workspace.choices[0]?.title.includes("'s"), 'Missing first name should use a professional fallback title.');
}

function invalidAiReferencesAreRejected() {
    const result = validateAiEstimateDraftResponse(aiResponse({ scopeIds: ['missing-scope'] }), approvedAiContext());

    assert(!result.valid, 'Invalid AI references should be rejected.');
}

function technicianApprovalRequiredBeforePresentation() {
    const workspace = completeWorkspace({ technicianApproved: false });

    assert(workspace.presentationGate.blockers.includes('Technician approval is required before presentation.'), 'Technician approval should gate presentation.');
}

function estimateContextIsPreserved() {
    const draftContext = context('Alfredo Garcia');
    const workspace = completeWorkspace({ draftContext });

    assert(workspace.choices.length > 0, 'Context-backed workspace should build choices.');
    assert(draftContext.service_request_id === 'request-1', 'Estimate context should preserve request id.');
    assert(draftContext.job_id === 'job-1', 'Estimate context should preserve job id.');
    assert(draftContext.schedule_slot_id === 'slot-1', 'Estimate context should preserve schedule slot id.');
}

function duplicateHomeOsItemsAreDeduped() {
    const items = [draftItem('item-1'), draftItem('item-1'), draftItem('item-2')];
    const deduped = dedupeEstimateDraftItems(items);

    assert(deduped.length === 2, 'Adding the same HomeOS item twice should not duplicate it.');
}

function companyScopeBlocksUrlManipulation() {
    const workspace = buildWorkspace({
        companyId: 'company-a',
        priceBookItems: [priceBookItem('company-b', 1, 'Toilets', 100)],
        technicianApproved: true,
    });

    assert(!workspace.presentationGate.canPresent, 'URL manipulation to another company price book should not present.');
}

function estimateActionsDoNotMutateHomeownerRecords() {
    const item = draftItem('item-1');
    const before = JSON.stringify(item);

    buildWorkspace({ draftItems: [item], priceBookItems: pricedItems() });

    assert(JSON.stringify(item) === before, 'Estimate option building must not mutate HomeOS item records.');
}

function presentationLayoutCoversPhoneTabletDesktop() {
    assert(resolveEstimatePresentationLayout(390) === 'phone', 'Phone layout should be selected for narrow width.');
    assert(resolveEstimatePresentationLayout(800) === 'tablet', 'Tablet layout should be selected for medium width.');
    assert(resolveEstimatePresentationLayout(1200) === 'desktop', 'Desktop layout should be selected for wide width.');
}

function productImagesHaveLoadingStates() {
    assert(resolveProductImageState(product('company-a', 'with-image', true, true)) === 'available', 'Approved image should be available.');
    assert(resolveProductImageState({ ...product('company-a', 'missing-image', true, true), mainMedia: null }) === 'missing', 'Missing image should have a missing state.');
}

function homeownerPresentationHidesInternalPricing() {
    const choice = completeWorkspace().choices[0];

    assert(choice, 'Workspace should produce a choice.');

    const presentation = toHomeownerPresentationChoice(choice);
    const serialized = JSON.stringify(presentation);

    assert(!serialized.includes('totalCost'), 'Homeowner presentation must hide internal cost.');
    assert(!serialized.includes('grossMargin'), 'Homeowner presentation must hide margin.');
    assert(!serialized.includes('minimumAllowedTotal'), 'Homeowner presentation must hide minimum limits.');
    assert(!serialized.includes('maximumAllowedTotal'), 'Homeowner presentation must hide maximum limits.');
}

function completeWorkspace(options: {
    draftContext?: EstimateDraftContextLike | null;
    technicianApproved?: boolean;
    category?: EstimateOptionCategory;
} = {}) {
    const category = options.category || 'toilet_replacement';

    return buildWorkspace({
        category,
        answers: completeAnswers(category),
        priceBookItems: pricedItems(),
        technicianApproved: options.technicianApproved ?? true,
        draftContext: options.draftContext === undefined ? context('Alfredo Garcia') : options.draftContext,
    });
}

function buildWorkspace(options: {
    companyId?: string;
    category?: EstimateOptionCategory;
    answers?: EstimateAnswerSet;
    priceBookItems?: CompanyPriceBookItemLike[];
    technicianApproved?: boolean;
    draftContext?: EstimateDraftContextLike | null;
    draftItems?: EstimateDraftItemLike[];
}) {
    const category = options.category || 'toilet_replacement';

    return buildEstimateOptionWorkspace({
        companyId: options.companyId || 'company-a',
        draftItems: options.draftItems || [draftItem('item-1')],
        draftContext: options.draftContext ?? context('Alfredo Garcia'),
        category,
        answers: options.answers || {},
        priceBookItems: options.priceBookItems || [],
        approvedProducts: [product(options.companyId || 'company-a', 'product-1', true, true)],
        technicianApproved: options.technicianApproved ?? false,
    });
}

function faucetWorkspace(options: {
    answers?: EstimateAnswerSet;
    priceBookItems?: CompanyPriceBookItemLike[];
    technicianApproved?: boolean;
} = {}) {
    return buildWorkspace({
        category: 'faucet_replacement',
        answers: options.answers || completeAnswers('faucet_replacement'),
        priceBookItems: options.priceBookItems || faucetPriceBookItems(),
        technicianApproved: options.technicianApproved ?? false,
    });
}

function completeAnswers(category: EstimateOptionCategory): EstimateAnswerSet {
    const template = getEstimateCategoryTemplate(category);
    const answers: EstimateAnswerSet = {};

    template.questions.forEach((question) => {
        if (!question.required) return;
        if (question.type === 'yes_no') {
            answers[question.id] = true;
        } else if (question.type === 'counter' || question.type === 'measurement') {
            answers[question.id] = 1;
        } else if (question.type === 'multi_select') {
            answers[question.id] = question.allowedAnswers?.slice(0, 1) || ['selected'];
        } else {
            answers[question.id] = question.allowedAnswers?.[0] || 'selected';
        }
    });

    template.requiredPhotoLabels.forEach((label) => {
        answers[photoRequirementAnswerKey(label)] = photoAnswer(label);
    });
    template.requiredMeasurementLabels.forEach((label) => {
        answers[measurementRequirementAnswerKey(label)] = measurementAnswer(1, label.toLowerCase().includes('size') ? 'sq ft' : 'in');
    });

    return answers;
}

function faucetQuestionAnswers(): EstimateAnswerSet {
    return {
        fixture_area: 'kitchen',
        hole_spread: '8 in widespread',
        customer_supplied: 'company approved product',
        shutoff_condition: 'replace required',
        supply_lines: 'yes',
        pop_up_or_drain: 'yes',
    };
}

function photoAnswer(label: string): EstimateRequirementPhotoAnswer {
    const requirementId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    return {
        kind: 'requirement_photo',
        requirementId,
        attachmentId: `${requirementId}-attachment`,
        bucket: 'estimate-requirement-files',
        storagePath: `company-a/session-a/${requirementId}/${requirementId}-attachment/photo.jpg`,
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
        uploadedAt: '2026-07-14T00:00:00.000Z',
    };
}

function measurementAnswer(value: number, unit: string): EstimateRequirementMeasurementAnswer {
    return {
        kind: 'requirement_measurement',
        value,
        unit,
        capturedAt: '2026-07-14T00:00:00.000Z',
    };
}

function pricedItems(category = 'Toilets') {
    return [
        priceBookItem('company-a', 1, category, 100),
        priceBookItem('company-a', 2, category, 150),
        priceBookItem('company-a', 3, category, 200),
        priceBookItem('company-a', 4, category, 250),
    ];
}

function faucetPriceBookItems() {
    return [
        faucetPriceBookItem('faucet-reinstall-existing', 375),
        faucetPriceBookItem('faucet-install-company-approved', 725),
    ];
}

function faucetPriceBookItem(
    priceKey: string,
    price: number,
    overrides: Partial<CompanyPriceBookItemLike> = {}
): CompanyPriceBookItemLike {
    const approved = priceKey === 'faucet-install-company-approved';

    return {
        id: `company-a-${priceKey}`,
        company_id: 'company-a',
        price_key: priceKey,
        name: approved ? 'Install Company-Approved Faucet' : 'Reinstall Existing Faucet',
        system: 'Plumbing',
        category: 'Faucets / Sinks',
        unit: 'each',
        base_price: price,
        labor_hours: approved ? 2.2 : 1.2,
        material_cost: approved ? 200 : 35,
        customer_description: approved
            ? 'Remove existing faucet, install approved replacement with a $200 faucet allowance, reconnect applicable supply and drain components, and test operation.'
            : 'Remove, clean, reseat, secure, reconnect, and test the existing or homeowner-supplied faucet with minor reconnect materials.',
        internal_notes: approved
            ? 'Company-approved replacement path. Includes a configurable $200 faucet allowance; faucet cost above allowance must be added deterministically.'
            : 'Labor and minor reconnect materials only. No fixture warranty on homeowner-supplied or existing faucet.',
        active: true,
        created_at: '2026-07-14T00:00:00.000Z',
        updated_at: '2026-07-14T00:00:00.000Z',
        source: 'backend',
        service_category: 'Faucets / Sinks',
        homeowner_description: approved
            ? 'Install an approved replacement faucet with a $200 faucet allowance and test operation.'
            : 'Reinstall and test the existing or supplied faucet. Fixture warranty is not included.',
        base_labor_install_price: price,
        estimated_labor_hours: approved ? 2.2 : 1.2,
        internal_material_cost: approved ? 200 : 35,
        recommended_selling_price: price,
        included_warranty: approved
            ? 'Company-approved faucet: workmanship warranty plus manufacturer warranty where applicable.'
            : 'Existing/homeowner-supplied faucet: no fixture warranty.',
        applicable_systems: ['Plumbing'],
        applicable_categories: approved
            ? ['faucet replacement', 'single hole', '4 in centerset', '8 in widespread']
            : ['faucet replacement', 'single hole', '4 in centerset', '8 in widespread', 'wall mount', 'unknown'],
        management_notes: approved
            ? 'Company-approved fixture source only.'
            : 'Existing or homeowner-supplied faucet source.',
        ...overrides,
    };
}

function priceBookItem(companyId: string, index: number, category: string, price: number): CompanyPriceBookItemLike {
    return {
        id: `${companyId}-price-${index}`,
        company_id: companyId,
        price_key: `price-key-${index}`,
        name: `Approved ${category} Scope ${index}`,
        system: 'Plumbing',
        category,
        unit: 'each',
        base_price: price,
        labor_hours: 1,
        material_cost: 25,
        customer_description: `Approved ${category} scope`,
        internal_notes: null,
        active: true,
        created_at: '2026-07-13T00:00:00.000Z',
        updated_at: '2026-07-13T00:00:00.000Z',
        source: 'backend',
    };
}

function estimateEntry(
    companyId: string,
    code: string,
    price: number,
    overrides: Partial<EstimatePriceBookEntry> = {}
): EstimatePriceBookEntry {
    return {
        ...mapCompanyPriceBookItemToEstimateEntry(priceBookItem(companyId, 1, 'Toilets', price)),
        id: `${companyId}-${code}`,
        code,
        active: true,
        minimumPermittedSellingPrice: null,
        maximumPermittedSellingPrice: null,
        ...overrides,
    };
}

function product(companyId: string, id: string, approved: boolean, active: boolean): EstimateApprovedProduct {
    return {
        id,
        companyId,
        category: 'toilet',
        brand: 'Approved Brand',
        model: 'Approved Model',
        tier: 'Professional',
        internalProductCost: 50,
        approvedSellingPrice: 100,
        priceBookEntryId: null,
        minimumSellingPrice: null,
        maximumSellingPrice: null,
        mainMedia: {
            id: `${id}-media`,
            companyId,
            productId: id,
            bucket: 'item-files',
            storagePath: `${companyId}/products/${id}.jpg`,
            altText: 'Approved product image',
            active: true,
        },
        additionalMedia: [],
        specifications: {},
        compatibleApplications: ['toilet replacement'],
        requiredAccessoryIds: [],
        installationRequirements: [],
        warranty: 'Company-approved warranty',
        extendedWarrantyEligible: true,
        availabilityNote: null,
        manufacturerReference: null,
        companyNotes: null,
        approved,
        active,
    };
}

function draftItem(id: string): EstimateDraftItemLike {
    return {
        id,
        property_id: 'property-1',
        customer_home_name: 'Alfredo Garcia',
        name: 'Toilet',
        item_slug: id,
        system: 'Plumbing',
        category: 'Toilets',
        location: 'Bathroom',
        parent_area: 'Bathroom',
        status: 'Needs Estimate',
        install_state: 'Existing',
        company_id: 'company-a',
        company_user_id: 'company-user-1',
        source: 'provider_mode',
        created_at: '2026-07-13T00:00:00.000Z',
    };
}

function context(customerHomeName: string | null): EstimateDraftContextLike {
    return {
        company_id: 'company-a',
        property_id: 'property-1',
        customer_home_name: customerHomeName,
        service_request_id: 'request-1',
        job_id: 'job-1',
        schedule_slot_id: 'slot-1',
        technician_company_user_id: 'company-user-1',
        technician_name: 'Tech User',
        issue_summary: 'Toilet replacement',
        source: 'provider_mode',
        updated_at: '2026-07-13T00:00:00.000Z',
    };
}

function structure(): RepipeStructureInput {
    return {
        stories: 1,
        foundation: 'slab',
        atticAccess: true,
        existingPipeMaterial: 'copper',
        proposedPipeMaterial: 'PEX',
        approximateHomeSizeSqft: 1800,
        occupied: true,
        permitRequired: true,
        patchingIncluded: true,
        routingDifficulty: 'standard',
    };
}

function roomBlock(
    id: string,
    roomType: RepipeRoomBlock['roomType'],
    fixtures: RepipeRoomBlock['fixtures']
): RepipeRoomBlock {
    return {
        id,
        roomType,
        label: id,
        fixtures,
        infrastructure: {},
    };
}

function approvedAiContext() {
    return {
        choiceIds: ['individual-1', 'individual-2'],
        productIds: ['product-1'],
        scopeIds: ['scope-1', 'scope-2'],
        warrantyIds: ['warranty-1'],
        inclusionIds: ['include-1'],
        exclusionIds: ['exclude-1'],
    };
}

function aiResponse(overrides: {
    productIds?: string[];
    scopeIds?: string[];
} = {}) {
    return {
        choices: [
            aiChoice({
                sourceChoiceId: 'individual-1',
                productIds: overrides.productIds || ['product-1'],
                scopeIds: overrides.scopeIds || ['scope-1'],
            }),
            aiChoice({
                sourceChoiceId: 'individual-2',
                productIds: ['product-1'],
                scopeIds: ['scope-2'],
                displayOrder: 2,
            }),
        ],
    };
}

function aiChoice(overrides: {
    sourceChoiceId?: string;
    productIds?: string[];
    scopeIds?: string[];
    displayOrder?: number;
} = {}) {
    return {
        source_choice_id: overrides.sourceChoiceId || 'individual-1',
        kind: 'individual',
        title: 'Alfredo\'s Essential Toilet Replacement',
        short_summary: 'Approved toilet replacement scope.',
        homeowner_explanation: 'This option uses approved scope and deterministic company pricing.',
        key_benefits: ['Approved scope'],
        why_it_differs: 'Different approved scope.',
        recommended_reason: 'Balanced option.',
        approved_product_ids: overrides.productIds || ['product-1'],
        approved_scope_ids: overrides.scopeIds || ['scope-1'],
        approved_warranty_ids: ['warranty-1'],
        inclusion_ids: ['include-1'],
        exclusion_ids: ['exclude-1'],
        display_order: overrides.displayOrder || 1,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
