export type EstimateOptionCategory =
    | 'toilet_replacement'
    | 'water_heater'
    | 'garbage_disposal'
    | 'faucet_replacement'
    | 'whole_home_repipe';

export type EstimateRequirementPhotoAnswer = {
    kind: 'requirement_photo';
    requirementId: string;
    attachmentId: string;
    bucket: string;
    storagePath: string;
    fileName: string;
    contentType: string | null;
    sizeBytes: number | null;
    uploadedAt: string;
};

export type EstimateRequirementMeasurementAnswer = {
    kind: 'requirement_measurement';
    value: number;
    unit: string;
    capturedAt: string;
};

export type EstimateAnswerValue =
    | string
    | number
    | boolean
    | string[]
    | EstimateRequirementPhotoAnswer
    | EstimateRequirementMeasurementAnswer
    | null;
export type EstimateAnswerSet = Record<string, EstimateAnswerValue>;

export type CompanyPriceBookItemLike = {
    id: string;
    company_id: string;
    price_key: string;
    name: string;
    system: string;
    category: string;
    unit: string;
    base_price: number | null;
    labor_hours: number | null;
    material_cost: number | null;
    customer_description: string | null;
    internal_notes: string | null;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
    source?: string | null;
};

export type EstimateDraftItemLike = {
    id: string;
    property_id: string | null;
    customer_home_name?: string | null;
    name: string;
    item_slug: string;
    system: string;
    category: string;
    location: string | null;
    parent_area: string | null;
    status: string | null;
    install_state: string | null;
    company_id: string | null;
    company_user_id: string | null;
    source?: string | null;
    created_at: string | null;
};

export type EstimateDraftContextLike = {
    company_id?: string | null;
    property_id?: string | null;
    customer_home_name: string | null;
    service_request_id?: string | null;
    job_id?: string | null;
    schedule_slot_id?: string | null;
    technician_company_user_id?: string | null;
    technician_name?: string | null;
    issue_summary?: string | null;
    source?: string | null;
    updated_at?: string | null;
};

export type EstimateQuestionType =
    | 'single_select'
    | 'multi_select'
    | 'yes_no'
    | 'counter'
    | 'measurement'
    | 'photo'
    | 'short_note';

export type EstimateQuestionDefinition = {
    id: string;
    label: string;
    type: EstimateQuestionType;
    required: boolean;
    allowedAnswers?: string[];
    min?: number;
    max?: number;
};

export type EstimateCategoryTemplate = {
    id: EstimateOptionCategory;
    label: string;
    serviceCategory: string;
    requiredPhotoLabels: string[];
    requiredMeasurementLabels: string[];
    questions: EstimateQuestionDefinition[];
    productCategoryFilters: string[];
    pricingCategoryFilters: string[];
    requiredScopeCodes: string[];
    recommendedOptionStructures: string[];
    warnings: string[];
    blockingConditions: string[];
};

export type EstimateProductTier = 'Essential' | 'Professional' | 'Premium';

export type EstimateProductMedia = {
    id: string;
    companyId: string;
    productId: string;
    bucket: string;
    storagePath: string;
    altText: string | null;
    active: boolean;
};

export type EstimateApprovedProduct = {
    id: string;
    companyId: string;
    category: string;
    brand: string;
    model: string;
    tier: EstimateProductTier;
    internalProductCost: number | null;
    approvedSellingPrice: number | null;
    priceBookEntryId: string | null;
    minimumSellingPrice: number | null;
    maximumSellingPrice: number | null;
    mainMedia: EstimateProductMedia | null;
    additionalMedia: EstimateProductMedia[];
    specifications: Record<string, string>;
    compatibleApplications: string[];
    requiredAccessoryIds: string[];
    installationRequirements: string[];
    warranty: string | null;
    extendedWarrantyEligible: boolean;
    availabilityNote: string | null;
    manufacturerReference: string | null;
    companyNotes: string | null;
    approved: boolean;
    active: boolean;
};

export type EstimatePriceBookEntry = {
    id: string;
    companyId: string;
    code: string;
    serviceCategory: string;
    name: string;
    internalDescription: string | null;
    homeownerDescription: string | null;
    baseLaborInstallPrice: number | null;
    estimatedLaborHours: number | null;
    internalLaborCost: number | null;
    internalMaterialCost: number | null;
    recommendedSellingPrice: number | null;
    minimumPermittedSellingPrice: number | null;
    maximumPermittedSellingPrice: number | null;
    requiredMinimumGrossMargin: number | null;
    taxBehavior: string | null;
    active: boolean;
    effectiveAt: string | null;
    version: string | null;
    includedWarranty: string | null;
    eligibleExtendedWarrantyIds: string[];
    requiredAddOnCodes: string[];
    incompatibleCodes: string[];
    applicableSystems: string[];
    applicableAreas: string[];
    applicableCategories: string[];
    managementNotes: string | null;
};

export type EstimateLineInput = {
    priceBookEntryId: string;
    quantity: number;
    source: 'base_installation' | 'product' | 'modifier' | 'required_scope' | 'warranty' | 'repipe';
    required: boolean;
    removable: boolean;
};

export type EstimateCalculatedLine = {
    id: string;
    priceBookEntryId: string;
    code: string;
    name: string;
    quantity: number;
    unitAmount: number;
    totalAmount: number;
    cost: number;
    grossMargin: number | null;
    required: boolean;
    source: EstimateLineInput['source'];
};

export type EstimatePricingSnapshotEntry = {
    priceBookEntryId: string;
    code: string;
    name: string;
    recommendedSellingPrice: number | null;
    minimumPermittedSellingPrice: number | null;
    maximumPermittedSellingPrice: number | null;
    version: string | null;
    effectiveAt: string | null;
};

export type EstimatePricingResult = {
    id: string;
    lineItems: EstimateCalculatedLine[];
    totalAmount: number;
    totalCost: number;
    grossMargin: number | null;
    minimumAllowedTotal: number | null;
    recommendedTotal: number;
    maximumAllowedTotal: number | null;
    priceBookVersion: string;
    priceBookSnapshot: EstimatePricingSnapshotEntry[];
    warnings: string[];
    missingPricingInputs: string[];
    requiredManagementApproval: boolean;
};

export type EstimateChoiceKind = 'individual' | 'package';

export type EstimateChoice = {
    id: string;
    kind: EstimateChoiceKind;
    title: string;
    shortSummary: string;
    homeownerExplanation: string;
    keyBenefits: string[];
    whyItDiffers: string;
    recommendedReason: string | null;
    productIds: string[];
    scopeIds: string[];
    warrantyIds: string[];
    inclusionIds: string[];
    exclusionIds: string[];
    pricingResult: EstimatePricingResult;
    recommended: boolean;
    displayOrder: number;
};

export type EstimatePresentationGate = {
    canPresent: boolean;
    blockers: string[];
    warnings: string[];
};

export type EstimateAnswerValidation = {
    complete: boolean;
    missingRequiredQuestionIds: string[];
    missingRequiredQuestionLabels: string[];
    missingRequiredPhotoLabels: string[];
    missingRequiredMeasurementLabels: string[];
    blockingConditions: string[];
};

export type EstimateOptionWorkspace = {
    template: EstimateCategoryTemplate;
    answerValidation: EstimateAnswerValidation;
    approvedProducts: EstimateApprovedProduct[];
    eligiblePriceBookEntries: EstimatePriceBookEntry[];
    pricingResults: EstimatePricingResult[];
    choices: EstimateChoice[];
    individualOptions: EstimateChoice[];
    packages: EstimateChoice[];
    presentationGate: EstimatePresentationGate;
    pricingSetupRequired: boolean;
    statusMessage: string;
};

export type HomeownerPresentationChoice = {
    id: string;
    kind: EstimateChoiceKind;
    title: string;
    shortSummary: string;
    homeownerExplanation: string;
    keyBenefits: string[];
    whyItDiffers: string;
    recommendedReason: string | null;
    productIds: string[];
    inclusionIds: string[];
    exclusionIds: string[];
    totalAmount: number;
    recommended: boolean;
    displayOrder: number;
};

export type RepipeFixtureKey =
    | 'single_vanity'
    | 'double_vanity'
    | 'toilet'
    | 'shower'
    | 'tub_shower'
    | 'separate_tub'
    | 'roman_tub'
    | 'bidet'
    | 'additional_hot_point'
    | 'additional_cold_point'
    | 'kitchen_sink'
    | 'prep_sink'
    | 'dishwasher'
    | 'refrigerator_water_line'
    | 'filtration_faucet'
    | 'instant_hot_dispenser'
    | 'pot_filler'
    | 'ice_maker'
    | 'garbage_disposal'
    | 'utility_sink'
    | 'custom_fixture';

export type RepipeRoomType =
    | 'Kitchen'
    | 'Bathroom'
    | 'Laundry'
    | 'Water Heater / Mechanical'
    | 'Garage'
    | 'Exterior Hose Bibs'
    | 'Wet Bar'
    | 'Utility Sink'
    | 'Custom Area';

export type RepipeStructureInput = {
    stories: number;
    foundation: 'slab' | 'crawlspace' | 'raised_foundation' | 'basement';
    atticAccess: boolean;
    existingPipeMaterial: string;
    proposedPipeMaterial: string;
    approximateHomeSizeSqft: number | null;
    occupied: boolean;
    permitRequired: boolean;
    patchingIncluded: boolean;
    routingDifficulty: 'standard' | 'moderate' | 'difficult';
};

export type RepipeRoomBlock = {
    id: string;
    roomType: RepipeRoomType;
    label: string;
    fixtures: Partial<Record<RepipeFixtureKey, number>>;
    infrastructure: Partial<Record<string, number | boolean>>;
};

export type RepipeOverride = {
    field: keyof RepipeTotals;
    value: number;
    reason: string;
};

export type RepipeTotals = {
    hotFixturePoints: number;
    coldFixturePoints: number;
    totalValvesStops: number;
    branches: number;
    risers: number;
    fixtureBlocks: number;
    storyAccessModifier: number;
    routingDifficultyModifier: number;
    materialQuantityUnits: number;
    patchingQuantityUnits: number;
    permitInspectionItems: number;
};

export type RepipeCalculationResult = {
    totals: RepipeTotals;
    overrides: RepipeOverride[];
    auditTrail: string[];
    warnings: string[];
};

export type AiEstimateDraftChoice = {
    sourceChoiceId: string;
    kind: EstimateChoiceKind;
    title: string;
    shortSummary: string;
    homeownerExplanation: string;
    keyBenefits: string[];
    whyItDiffers: string;
    recommendedReason: string | null;
    productIds: string[];
    scopeIds: string[];
    warrantyIds: string[];
    inclusionIds: string[];
    exclusionIds: string[];
    displayOrder: number;
};

export type AiEstimateDraftValidation = {
    valid: boolean;
    choices: AiEstimateDraftChoice[];
    errors: string[];
};

export type ApprovedAiReferenceContext = {
    choiceIds: string[];
    productIds: string[];
    scopeIds: string[];
    warrantyIds: string[];
    inclusionIds: string[];
    exclusionIds: string[];
};

export type EstimatePermissionSubject = {
    role?: string | null;
    status?: string | null;
    permissions?: {
        can_create_estimates?: boolean | null;
        can_add_item_to_estimate?: boolean | null;
    } | null;
};

const EMPTY_REPIPE_TOTALS: RepipeTotals = {
    hotFixturePoints: 0,
    coldFixturePoints: 0,
    totalValvesStops: 0,
    branches: 0,
    risers: 0,
    fixtureBlocks: 0,
    storyAccessModifier: 0,
    routingDifficultyModifier: 0,
    materialQuantityUnits: 0,
    patchingQuantityUnits: 0,
    permitInspectionItems: 0,
};

export const repipeFixturePointDefaults: Record<RepipeFixtureKey, { hot: number; cold: number; valves: number }> = {
    single_vanity: { hot: 1, cold: 1, valves: 2 },
    double_vanity: { hot: 2, cold: 2, valves: 4 },
    toilet: { hot: 0, cold: 1, valves: 1 },
    shower: { hot: 1, cold: 1, valves: 0 },
    tub_shower: { hot: 1, cold: 1, valves: 0 },
    separate_tub: { hot: 1, cold: 1, valves: 0 },
    roman_tub: { hot: 1, cold: 1, valves: 0 },
    bidet: { hot: 0, cold: 1, valves: 1 },
    additional_hot_point: { hot: 1, cold: 0, valves: 1 },
    additional_cold_point: { hot: 0, cold: 1, valves: 1 },
    kitchen_sink: { hot: 1, cold: 1, valves: 2 },
    prep_sink: { hot: 1, cold: 1, valves: 2 },
    dishwasher: { hot: 1, cold: 0, valves: 1 },
    refrigerator_water_line: { hot: 0, cold: 1, valves: 1 },
    filtration_faucet: { hot: 0, cold: 1, valves: 1 },
    instant_hot_dispenser: { hot: 1, cold: 0, valves: 1 },
    pot_filler: { hot: 0, cold: 1, valves: 1 },
    ice_maker: { hot: 0, cold: 1, valves: 1 },
    garbage_disposal: { hot: 0, cold: 0, valves: 0 },
    utility_sink: { hot: 1, cold: 1, valves: 2 },
    custom_fixture: { hot: 0, cold: 0, valves: 0 },
};

export const estimateCategoryTemplates: EstimateCategoryTemplate[] = [
    {
        id: 'toilet_replacement',
        label: 'Toilet Replacement',
        serviceCategory: 'Toilets',
        requiredPhotoLabels: ['Existing toilet', 'Toilet base and floor', 'Shutoff valve'],
        requiredMeasurementLabels: ['Rough-in measurement'],
        productCategoryFilters: ['toilet', 'bidet'],
        pricingCategoryFilters: ['Toilets'],
        requiredScopeCodes: [],
        recommendedOptionStructures: ['Repair / Minimum Solution', 'Essential Replacement', 'Professional Upgrade', 'Premium Solution'],
        warnings: ['Round versus elongated should normally affect product selection, not automatic labor.'],
        blockingConditions: ['Required toilet measurements and site conditions must be answered before presentation.'],
        questions: [
            selectQuestion('rough_in', 'Rough-in', true, ['10 in', '12 in', '14 in']),
            selectQuestion('bowl_shape', 'Round or elongated', true, ['round', 'elongated']),
            selectQuestion('height', 'Height', true, ['standard', 'comfort / chair height']),
            selectQuestion('construction', 'One-piece or two-piece', true, ['one-piece', 'two-piece']),
            selectQuestion('color', 'Color', true, ['white', 'bone / almond', 'other']),
            yesNoQuestion('clearance_restrictions', 'Clearance or height restrictions', true),
            selectQuestion('flush_type', 'Flush type', true, ['gravity', 'pressure assist', 'dual flush', 'other']),
            selectQuestion('flange_condition', 'Flange condition', true, ['good', 'damaged', 'unknown until removal']),
            selectQuestion('angle_stop_condition', 'Angle-stop condition', true, ['good', 'replace recommended', 'replace required']),
            yesNoQuestion('supply_line_replacement', 'Supply-line replacement', true),
            selectQuestion('seat', 'Seat', true, ['included', 'upgraded', 'customer supplied']),
            yesNoQuestion('haul_away', 'Haul-away', true),
            selectQuestion('floor_stair_access', 'Floor / stair access', true, ['ground floor', 'stairs', 'difficult access']),
            multiQuestion('accessibility_requirements', 'Accessibility requirements', false, ['grab bars', 'chair height', 'bidet', 'clearance needs']),
            selectQuestion('bidet_electrical_needs', 'Bidet / electrical needs', false, ['none', 'bidet water only', 'electrical outlet needed']),
            noteQuestion('unusual_installation_conditions', 'Unusual installation conditions', false),
        ],
    },
    {
        id: 'water_heater',
        label: 'Water Heater / Tankless',
        serviceCategory: 'Water Heaters',
        requiredPhotoLabels: ['Existing unit photo', 'Model / serial label', 'Full installation area', 'Venting or flue', 'Water and fuel connections'],
        requiredMeasurementLabels: ['Tank size or tankless demand'],
        productCategoryFilters: ['tank water heater', 'tankless water heater', 'expansion tank', 'recirculation'],
        pricingCategoryFilters: ['Water Heaters', 'Gas', 'Valves / Shutoffs'],
        requiredScopeCodes: [],
        recommendedOptionStructures: ['Minimum Code-Safe Repair', 'Essential Replacement', 'Professional Replacement', 'Premium Hot Water Protection'],
        warnings: ['Preserve the guided water-heater checklist and block presentation until required safety questions are answered.'],
        blockingConditions: ['Fuel, venting, safety, and code requirements must be answered before presentation.'],
        questions: [
            selectQuestion('fuel_type', 'Fuel type', true, ['gas', 'electric', 'propane', 'heat pump', 'unknown']),
            selectQuestion('tank_or_tankless', 'Tank size or tankless demand', true, ['30 gallon', '40 gallon', '50 gallon', '75 gallon', 'tankless like-kind', 'tankless conversion']),
            selectQuestion('location', 'Location', true, ['garage', 'closet', 'attic', 'basement', 'exterior', 'other']),
            selectQuestion('venting', 'Venting', true, ['standard draft', 'power vent', 'direct vent', 'tankless vent', 'unknown']),
            selectQuestion('gas_valve_line', 'Gas valve and line', true, ['acceptable', 'replace recommended', 'needs sizing review', 'not applicable']),
            selectQuestion('electrical_needs', 'Electrical needs', true, ['none', 'existing outlet', 'new outlet needed', 'dedicated circuit review']),
            selectQuestion('expansion_tank', 'Expansion tank', true, ['existing good', 'replace', 'add', 'not required / unknown']),
            selectQuestion('prv_pressure', 'PRV and pressure', true, ['acceptable', 'high pressure', 'PRV replacement recommended', 'unknown']),
            selectQuestion('drain_pan_route', 'Drain pan / drain route', true, ['existing good', 'add pan', 'add drain route', 'not possible / explain']),
            selectQuestion('tp_discharge', 'T&P discharge', true, ['acceptable', 'correct route', 'unknown']),
            yesNoQuestion('straps', 'Straps required or present', true),
            yesNoQuestion('sediment_trap', 'Sediment trap required or present', true),
            selectQuestion('combustion_air', 'Combustion air', true, ['acceptable', 'needs review', 'not applicable']),
            selectQuestion('clearances', 'Clearances', true, ['acceptable', 'limited', 'blocked']),
            selectQuestion('platform', 'Platform', true, ['acceptable', 'replace / build', 'not applicable']),
            selectQuestion('recirculation', 'Recirculation', false, ['none', 'existing', 'add option', 'repair / replace']),
            multiQuestion('code_corrections', 'Code corrections', true, ['permit', 'pan', 'straps', 'T&P', 'venting', 'gas connector', 'sediment trap', 'expansion tank']),
            selectQuestion('desired_warranty', 'Desired warranty', true, ['standard', 'extended', 'premium']),
            multiQuestion('homeowner_priorities', 'Homeowner priorities', true, ['lowest cost', 'reliability', 'efficiency', 'faster hot water', 'warranty', 'space saving']),
        ],
    },
    {
        id: 'garbage_disposal',
        label: 'Garbage Disposal',
        serviceCategory: 'Drains / Sewer',
        requiredPhotoLabels: ['Existing disposal', 'Under-sink drain piping', 'Electrical connection area'],
        requiredMeasurementLabels: [],
        productCategoryFilters: ['garbage disposal'],
        pricingCategoryFilters: ['Drains / Sewer'],
        requiredScopeCodes: [],
        recommendedOptionStructures: ['Minimum Disposal Replacement', 'Essential Disposal', 'Quiet Professional Disposal', 'Premium Disposal Protection'],
        warnings: ['Electrical work must be scoped only when approved and configured.'],
        blockingConditions: ['Power, drain, dishwasher, and model selection questions are required.'],
        questions: [
            selectQuestion('install_type', 'Replacement or new installation', true, ['replacement', 'new installation']),
            selectQuestion('horsepower', 'Horsepower', true, ['1/3 HP', '1/2 HP', '3/4 HP', '1 HP']),
            selectQuestion('approved_model', 'Approved brand/model', true, ['approved model selected', 'customer supplied', 'needs management approval']),
            selectQuestion('feed_type', 'Continuous or batch feed', true, ['continuous feed', 'batch feed']),
            selectQuestion('existing_power', 'Existing power', true, ['corded outlet', 'hardwired', 'no power', 'unknown']),
            selectQuestion('switch_type', 'Wall switch or air switch', true, ['wall switch', 'air switch', 'no switch', 'unknown']),
            yesNoQuestion('dishwasher_connection', 'Dishwasher connection', true),
            selectQuestion('sink_flange_condition', 'Sink flange condition', true, ['good', 'replace', 'unknown']),
            selectQuestion('drain_configuration', 'Drain configuration', true, ['standard', 'needs correction', 'unknown']),
            yesNoQuestion('removal', 'Disposal / removal', true),
            selectQuestion('noise_preference', 'Noise preference', false, ['standard', 'quiet', 'quietest available']),
            selectQuestion('warranty_tier', 'Warranty tier', true, ['standard', 'extended', 'premium']),
        ],
    },
    {
        id: 'faucet_replacement',
        label: 'Faucet Replacement',
        serviceCategory: 'Faucets / Sinks',
        requiredPhotoLabels: ['Existing faucet', 'Under-sink connections', 'Sink hole layout'],
        requiredMeasurementLabels: ['Hole spread'],
        productCategoryFilters: ['faucet', 'sink'],
        pricingCategoryFilters: ['Faucets / Sinks', 'Valves / Shutoffs'],
        requiredScopeCodes: [],
        recommendedOptionStructures: ['Minimum Faucet Replacement', 'Essential Faucet Replacement', 'Professional Faucet Upgrade', 'Premium Fixture Package'],
        warnings: ['Accessories and shutoff replacements must be priced through approved entries.'],
        blockingConditions: ['Sink holes, shutoff condition, supply lines, and product approval are required.'],
        questions: [
            selectQuestion('fixture_area', 'Fixture area', true, ['kitchen', 'bathroom', 'laundry', 'utility']),
            selectQuestion('hole_spread', 'Hole spread', true, ['single hole', '4 in centerset', '8 in widespread', 'wall mount', 'unknown']),
            selectQuestion('customer_supplied', 'Fixture source', true, ['company approved product', 'customer supplied', 'needs product approval']),
            selectQuestion('shutoff_condition', 'Shutoff condition', true, ['good', 'replace recommended', 'replace required']),
            yesNoQuestion('supply_lines', 'Supply-line replacement', true),
            yesNoQuestion('pop_up_or_drain', 'Pop-up or drain assembly involved', true),
            multiQuestion('accessories', 'Accessories', false, ['sprayer', 'soap dispenser', 'RO faucet', 'instant hot', 'air gap']),
            noteQuestion('unusual_conditions', 'Unusual installation conditions', false),
        ],
    },
    {
        id: 'whole_home_repipe',
        label: 'Whole-Home Repipe',
        serviceCategory: 'Water Service',
        requiredPhotoLabels: ['Main water entry', 'Water heater area', 'Typical fixture access', 'Attic / crawl / slab access'],
        requiredMeasurementLabels: ['Approximate home size'],
        productCategoryFilters: ['repipe materials', 'valves', 'shutoff valves', 'supply lines'],
        pricingCategoryFilters: ['Water Service', 'Valves / Shutoffs', 'Other Plumbing'],
        requiredScopeCodes: [],
        recommendedOptionStructures: ['Partial Repipe Scope', 'Essential Repipe', 'Professional Whole-Home Repipe', 'Protection Package'],
        warnings: ['Generated totals remain editable and auditable; overrides require a reason.'],
        blockingConditions: ['Structure, access, material, permit, patching, and block totals are required.'],
        questions: [
            selectQuestion('stories', 'Number of stories', true, ['1', '2', '3+']),
            selectQuestion('foundation', 'Foundation', true, ['slab', 'crawlspace', 'raised foundation', 'basement']),
            yesNoQuestion('attic_access', 'Attic access', true),
            selectQuestion('existing_pipe_material', 'Existing pipe material', true, ['copper', 'PEX', 'CPVC', 'galvanized', 'polybutylene', 'mixed / unknown']),
            selectQuestion('proposed_pipe_material', 'Proposed pipe material', true, ['PEX', 'copper', 'management selected']),
            measurementQuestion('approximate_home_size', 'Approximate home size', true),
            yesNoQuestion('occupied', 'Occupied during work', true),
            yesNoQuestion('permit', 'Permit', true),
            selectQuestion('patching', 'Patching', true, ['included', 'excluded', 'allowance / separate']),
            selectQuestion('routing_access_difficulty', 'Routing / access difficulty', true, ['standard', 'moderate', 'difficult']),
        ],
    },
];

export function getEstimateCategoryTemplate(category: EstimateOptionCategory) {
    return estimateCategoryTemplates.find((template) => template.id === category) || estimateCategoryTemplates[0];
}

export function inferEstimateCategoryFromDraft(
    items: EstimateDraftItemLike[],
    context?: EstimateDraftContextLike | null
): EstimateOptionCategory {
    const searchable = [
        ...items.map((item) => `${item.name} ${item.system} ${item.category} ${item.location || ''} ${item.parent_area || ''}`),
        context?.issue_summary || '',
        context?.customer_home_name || '',
        context?.source || '',
    ]
        .join(' ')
        .toLowerCase();

    if (searchable.includes('repipe') || searchable.includes('whole home') || searchable.includes('whole-home')) return 'whole_home_repipe';
    if (searchable.includes('water heater') || searchable.includes('tankless')) return 'water_heater';
    if (searchable.includes('garbage disposal') || searchable.includes('disposal')) return 'garbage_disposal';
    if (searchable.includes('toilet') || searchable.includes('bidet')) return 'toilet_replacement';
    if (searchable.includes('faucet') || searchable.includes('sink')) return 'faucet_replacement';

    return 'faucet_replacement';
}

export function validateEstimateAnswers(template: EstimateCategoryTemplate, answers: EstimateAnswerSet): EstimateAnswerValidation {
    const missingRequiredQuestions = template.questions
        .filter((question) => question.required && !isAnswerComplete(answers[question.id]));
    const missingRequiredQuestionIds = missingRequiredQuestions.map((question) => question.id);
    const missingRequiredQuestionLabels = missingRequiredQuestions.map((question) => question.label);

    const missingRequiredPhotoLabels = template.requiredPhotoLabels.filter((label) =>
        !isPhotoRequirementComplete(answers[photoRequirementAnswerKey(label)])
    );
    const missingRequiredMeasurementLabels = template.requiredMeasurementLabels.filter((label) =>
        !isMeasurementRequirementComplete(answers[measurementRequirementAnswerKey(label)])
    );
    const blockingConditions = missingRequiredQuestionIds.length > 0 ||
        missingRequiredPhotoLabels.length > 0 ||
        missingRequiredMeasurementLabels.length > 0
        ? template.blockingConditions
        : [];

    return {
        complete: missingRequiredQuestionIds.length === 0 &&
            missingRequiredPhotoLabels.length === 0 &&
            missingRequiredMeasurementLabels.length === 0,
        missingRequiredQuestionIds,
        missingRequiredQuestionLabels,
        missingRequiredPhotoLabels,
        missingRequiredMeasurementLabels,
        blockingConditions,
    };
}

export function mapCompanyPriceBookItemToEstimateEntry(item: CompanyPriceBookItemLike): EstimatePriceBookEntry {
    const record = item as CompanyPriceBookItemLike & Record<string, unknown>;

    return {
        id: item.id,
        companyId: item.company_id,
        code: item.price_key,
        serviceCategory: readNullableText(record.service_category) || item.category,
        name: item.name,
        internalDescription: readNullableText(record.internal_description) || item.internal_notes,
        homeownerDescription: readNullableText(record.homeowner_description) || item.customer_description,
        baseLaborInstallPrice: readNullableNumber(record.base_labor_install_price) ?? item.base_price,
        estimatedLaborHours: readNullableNumber(record.estimated_labor_hours) ?? item.labor_hours,
        internalLaborCost: readNullableNumber(record.internal_labor_cost),
        internalMaterialCost: readNullableNumber(record.internal_material_cost) ?? item.material_cost,
        recommendedSellingPrice: readNullableNumber(record.recommended_selling_price) ?? item.base_price,
        minimumPermittedSellingPrice: readNullableNumber(record.minimum_permitted_selling_price),
        maximumPermittedSellingPrice: readNullableNumber(record.maximum_permitted_selling_price),
        requiredMinimumGrossMargin: readNullableNumber(record.required_minimum_gross_margin),
        taxBehavior: readNullableText(record.tax_behavior),
        active: item.active,
        effectiveAt: readNullableText(record.effective_at),
        version: readNullableText(record.version_label) || item.updated_at,
        includedWarranty: readNullableText(record.included_warranty),
        eligibleExtendedWarrantyIds: readTextArray(record.eligible_extended_warranties),
        requiredAddOnCodes: readTextArray(record.required_add_on_price_keys),
        incompatibleCodes: readTextArray(record.incompatible_price_keys),
        applicableSystems: readTextArray(record.applicable_systems),
        applicableAreas: readTextArray(record.applicable_areas),
        applicableCategories: readTextArray(record.applicable_categories),
        managementNotes: readNullableText(record.management_notes) || item.internal_notes,
    };
}

export function filterApprovedActiveProducts(
    products: EstimateApprovedProduct[],
    companyId: string,
    template: EstimateCategoryTemplate
) {
    return products.filter((product) =>
        product.companyId === companyId &&
        product.approved &&
        product.active &&
        template.productCategoryFilters.some((filter) => normalizeText(product.category).includes(normalizeText(filter)))
    );
}

export function isProductSelectable(product: EstimateApprovedProduct, companyId: string) {
    return product.companyId === companyId && product.approved && product.active;
}

export function filterRuleCompatibleProducts(
    products: EstimateApprovedProduct[],
    rules: { categoryFilters?: string[]; incompatibleProductIds?: string[]; application?: string | null }
) {
    const categoryFilters = (rules.categoryFilters || []).map(normalizeText);
    const incompatibleIds = new Set(rules.incompatibleProductIds || []);
    const application = normalizeText(rules.application || '');

    return products.filter((product) => {
        if (!product.approved || !product.active || incompatibleIds.has(product.id)) return false;
        if (
            categoryFilters.length > 0 &&
            !categoryFilters.some((filter) => normalizeText(product.category).includes(filter))
        ) {
            return false;
        }
        if (
            application &&
            product.compatibleApplications.length > 0 &&
            !product.compatibleApplications.some((candidate) => normalizeText(candidate).includes(application))
        ) {
            return false;
        }

        return true;
    });
}

export function canManageEstimatePricing(subject: EstimatePermissionSubject) {
    if (normalizeText(subject.status || '') !== 'active') return false;

    return ['owner', 'admin', 'manager'].includes(normalizeText(subject.role || ''));
}

export function canUseEstimatePricing(subject: EstimatePermissionSubject) {
    if (normalizeText(subject.status || '') !== 'active') return false;
    if (canManageEstimatePricing(subject)) return true;

    return normalizeText(subject.role || '') === 'technician' ||
        normalizeText(subject.role || '') === 'tech' ||
        subject.permissions?.can_create_estimates === true ||
        subject.permissions?.can_add_item_to_estimate === true;
}

export function dedupeEstimateDraftItems(items: EstimateDraftItemLike[]) {
    const seen = new Set<string>();

    return items.filter((item) => {
        const key = `${item.company_id || ''}:${item.property_id || ''}:${item.id}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

export function resolveEstimatePresentationLayout(width: number) {
    if (width < 640) return 'phone';
    if (width < 1024) return 'tablet';

    return 'desktop';
}

export function resolveProductImageState(product: EstimateApprovedProduct) {
    if (!product.mainMedia) return 'missing' as const;
    if (!product.mainMedia.active || !product.mainMedia.bucket || !product.mainMedia.storagePath) return 'error' as const;

    return 'available' as const;
}

export function toHomeownerPresentationChoice(choice: EstimateChoice): HomeownerPresentationChoice {
    return {
        id: choice.id,
        kind: choice.kind,
        title: choice.title,
        shortSummary: choice.shortSummary,
        homeownerExplanation: choice.homeownerExplanation,
        keyBenefits: [...choice.keyBenefits],
        whyItDiffers: choice.whyItDiffers,
        recommendedReason: choice.recommendedReason,
        productIds: [...choice.productIds],
        inclusionIds: [...choice.inclusionIds],
        exclusionIds: [...choice.exclusionIds],
        totalAmount: choice.pricingResult.totalAmount,
        recommended: choice.recommended,
        displayOrder: choice.displayOrder,
    };
}

export function calculateRepipeTotals(
    structure: RepipeStructureInput,
    blocks: RepipeRoomBlock[],
    overrides: RepipeOverride[] = []
): RepipeCalculationResult {
    const totals: RepipeTotals = { ...EMPTY_REPIPE_TOTALS };
    const auditTrail: string[] = [];
    const warnings: string[] = [];

    blocks.forEach((block) => {
        totals.fixtureBlocks += 1;
        auditTrail.push(`${block.label || block.roomType}: block counted.`);

        for (const [fixtureKey, rawCount] of Object.entries(block.fixtures)) {
            const count = normalizeQuantity(rawCount);
            const defaults = repipeFixturePointDefaults[fixtureKey as RepipeFixtureKey];

            if (!defaults || count <= 0) continue;

            totals.hotFixturePoints += defaults.hot * count;
            totals.coldFixturePoints += defaults.cold * count;
            totals.totalValvesStops += defaults.valves * count;
            auditTrail.push(`${block.label || block.roomType}: ${count} ${fixtureKey} added.`);
        }

        totals.branches += Math.max(1, Object.values(block.fixtures).filter((value) => normalizeQuantity(value) > 0).length);
        totals.risers += normalizeQuantity(block.infrastructure.risers);
        totals.materialQuantityUnits += normalizeQuantity(block.infrastructure.pipe_runs) ||
            Object.values(block.fixtures).reduce((sum, value) => sum + normalizeQuantity(value), 0);
        totals.patchingQuantityUnits += structure.patchingIncluded ? normalizeQuantity(block.infrastructure.drywall_openings) : 0;
        totals.permitInspectionItems += block.infrastructure.inspection === true ? 1 : 0;
    });

    totals.storyAccessModifier = Math.max(0, structure.stories - 1);
    totals.routingDifficultyModifier = structure.routingDifficulty === 'difficult' ? 2 : structure.routingDifficulty === 'moderate' ? 1 : 0;
    totals.permitInspectionItems += structure.permitRequired ? 1 : 0;

    overrides.forEach((override) => {
        if (!override.reason.trim()) {
            warnings.push(`Override for ${override.field} requires a reason.`);
            return;
        }

        totals[override.field] = Math.max(0, Math.round(override.value));
        auditTrail.push(`Override ${override.field} to ${override.value}: ${override.reason}`);
    });

    if (blocks.length === 0) warnings.push('Add at least one repipe room block before pricing.');
    if (!structure.proposedPipeMaterial.trim()) warnings.push('Proposed pipe material is required.');

    return { totals, overrides, auditTrail, warnings };
}

export function calculateEstimateOptionPrice(input: {
    id: string;
    companyId: string;
    priceBookEntries: EstimatePriceBookEntry[];
    lineInputs: EstimateLineInput[];
    priceBookVersion: string;
    requiredScopeCodes?: string[];
    requestedTotalAmount?: number | null;
}): EstimatePricingResult {
    const entriesById = new Map(input.priceBookEntries.map((entry) => [entry.id, entry]));
    const selectedCodes = new Set<string>();
    const lineItems: EstimateCalculatedLine[] = [];
    const warnings: string[] = [];
    const missingPricingInputs: string[] = [];

    input.lineInputs.forEach((lineInput, index) => {
        const entry = entriesById.get(lineInput.priceBookEntryId);
        const quantity = Math.max(1, Math.round(lineInput.quantity || 1));

        if (!entry) {
            missingPricingInputs.push(`Missing price book entry for line ${index + 1}.`);
            return;
        }

        selectedCodes.add(entry.code);

        if (entry.companyId !== input.companyId) {
            missingPricingInputs.push(`${entry.name} belongs to another company.`);
            return;
        }

        if (!entry.active) {
            missingPricingInputs.push(`${entry.name} is inactive and cannot be used in a new option.`);
            return;
        }

        if (entry.recommendedSellingPrice === null) {
            missingPricingInputs.push(`${entry.name} is missing a recommended selling price.`);
            return;
        }

        const unitAmount = roundMoney(entry.recommendedSellingPrice);
        const totalAmount = roundMoney(unitAmount * quantity);
        const cost = roundMoney(((entry.internalLaborCost || 0) + (entry.internalMaterialCost || 0)) * quantity);
        const grossMargin = totalAmount > 0 ? roundPercent((totalAmount - cost) / totalAmount) : null;

        lineItems.push({
            id: `${input.id}-line-${index + 1}`,
            priceBookEntryId: entry.id,
            code: entry.code,
            name: entry.name,
            quantity,
            unitAmount,
            totalAmount,
            cost,
            grossMargin,
            required: lineInput.required,
            source: lineInput.source,
        });
    });

    (input.requiredScopeCodes || []).forEach((requiredCode) => {
        if (!selectedCodes.has(requiredCode)) {
            missingPricingInputs.push(`Required safety/code scope is missing: ${requiredCode}.`);
        }
    });

    const totalAmount = roundMoney(lineItems.reduce((sum, line) => sum + line.totalAmount, 0));
    const totalCost = roundMoney(lineItems.reduce((sum, line) => sum + line.cost, 0));
    const grossMargin = totalAmount > 0 ? roundPercent((totalAmount - totalCost) / totalAmount) : null;
    const minimumAllowedTotal = sumOptionalAmounts(lineItems, input.priceBookEntries, 'minimumPermittedSellingPrice');
    const maximumAllowedTotal = sumOptionalAmounts(lineItems, input.priceBookEntries, 'maximumPermittedSellingPrice');
    const priceBookSnapshot = lineItems.map((line) => {
        const entry = entriesById.get(line.priceBookEntryId);

        return {
            priceBookEntryId: line.priceBookEntryId,
            code: line.code,
            name: line.name,
            recommendedSellingPrice: entry?.recommendedSellingPrice ?? null,
            minimumPermittedSellingPrice: entry?.minimumPermittedSellingPrice ?? null,
            maximumPermittedSellingPrice: entry?.maximumPermittedSellingPrice ?? null,
            version: entry?.version ?? null,
            effectiveAt: entry?.effectiveAt ?? null,
        };
    });
    const requestedTotal = input.requestedTotalAmount ?? totalAmount;
    const belowMinimum = minimumAllowedTotal !== null && requestedTotal < minimumAllowedTotal;
    const aboveMaximum = maximumAllowedTotal !== null && requestedTotal > maximumAllowedTotal;
    const belowMargin = input.priceBookEntries.some((entry) => {
        if (entry.requiredMinimumGrossMargin === null || grossMargin === null) return false;
        return grossMargin < entry.requiredMinimumGrossMargin;
    });

    if (belowMinimum) warnings.push('Below-minimum total requires management approval.');
    if (aboveMaximum) warnings.push('Above-maximum total requires management justification.');
    if (belowMargin) warnings.push('Required minimum gross margin is not met.');

    return {
        id: input.id,
        lineItems,
        totalAmount,
        totalCost,
        grossMargin,
        minimumAllowedTotal,
        recommendedTotal: totalAmount,
        maximumAllowedTotal,
        priceBookVersion: input.priceBookVersion,
        priceBookSnapshot,
        warnings,
        missingPricingInputs,
        requiredManagementApproval: belowMinimum || aboveMaximum || belowMargin,
    };
}

export function buildEstimateOptionWorkspace(input: {
    companyId: string;
    draftItems: EstimateDraftItemLike[];
    draftContext: EstimateDraftContextLike | null;
    category: EstimateOptionCategory;
    answers: EstimateAnswerSet;
    priceBookItems: CompanyPriceBookItemLike[];
    approvedProducts?: EstimateApprovedProduct[];
    technicianApproved: boolean;
    aiValidationFailed?: boolean;
}): EstimateOptionWorkspace {
    const template = getEstimateCategoryTemplate(input.category);
    const answerValidation = validateEstimateAnswers(template, input.answers);
    const approvedProducts = filterApprovedActiveProducts(input.approvedProducts || [], input.companyId, template);
    const priceBookEntries = input.priceBookItems.map(mapCompanyPriceBookItemToEstimateEntry);
    const eligiblePriceBookEntries = selectEligiblePriceBookEntries(priceBookEntries, input.companyId, template);
    const pricingSetupRequired = eligiblePriceBookEntries.length === 0;
    const pricingResults = pricingSetupRequired
        ? []
        : buildPricingResults(input.companyId, eligiblePriceBookEntries, template);
    const choices = buildDeterministicChoices({
        category: input.category,
        template,
        pricingResults,
        products: approvedProducts,
        draftContext: input.draftContext,
    });
    const individualOptions = choices.filter((choice) => choice.kind === 'individual');
    const packages = choices.filter((choice) => choice.kind === 'package');
    const presentationGate = buildPresentationGate({
        answerValidation,
        pricingResults,
        choices,
        technicianApproved: input.technicianApproved,
        aiValidationFailed: input.aiValidationFailed || false,
        pricingSetupRequired,
        approvedProducts,
    });

    return {
        template,
        answerValidation,
        approvedProducts,
        eligiblePriceBookEntries,
        pricingResults,
        choices,
        individualOptions,
        packages,
        presentationGate,
        pricingSetupRequired,
        statusMessage: pricingSetupRequired
            ? 'Pricing setup required'
            : presentationGate.canPresent
                ? 'Ready for homeowner presentation'
                : 'Technician review required',
    };
}

export function validateAiEstimateDraftResponse(
    response: unknown,
    context: ApprovedAiReferenceContext
): AiEstimateDraftValidation {
    const errors: string[] = [];
    const record = readRecord(response);
    const rawChoices = readChoiceArray(record);

    if (rawChoices.length === 0) {
        errors.push('AI response did not include any choices.');
    }

    const disallowedNumericPaths = collectDisallowedNumericFields(response);
    disallowedNumericPaths.forEach((path) => {
        errors.push(`AI response attempted to set a numeric price or quantity at ${path}.`);
    });

    const choices = rawChoices
        .map((choice, index) => readAiChoice(choice, index, context, errors))
        .filter((choice): choice is AiEstimateDraftChoice => Boolean(choice));
    const individualCount = choices.filter((choice) => choice.kind === 'individual').length;
    const packageCount = choices.filter((choice) => choice.kind === 'package').length;

    if (individualCount < 2 || individualCount > 4) {
        errors.push('AI response must include 2 to 4 individual options.');
    }

    if (packageCount > 2) {
        errors.push('AI response must include no more than 2 packages.');
    }

    if (choices.length > 6) {
        errors.push('AI response must not include more than 6 homeowner-facing choices.');
    }

    return {
        valid: errors.length === 0,
        choices,
        errors,
    };
}

export function buildApprovedAiReferenceContext(choices: EstimateChoice[]): ApprovedAiReferenceContext {
    return {
        choiceIds: choices.map((choice) => choice.id),
        productIds: uniqueText(choices.flatMap((choice) => choice.productIds)),
        scopeIds: uniqueText(choices.flatMap((choice) => choice.scopeIds)),
        warrantyIds: uniqueText(choices.flatMap((choice) => choice.warrantyIds)),
        inclusionIds: uniqueText(choices.flatMap((choice) => choice.inclusionIds)),
        exclusionIds: uniqueText(choices.flatMap((choice) => choice.exclusionIds)),
    };
}

export function formatMoney(amount: number | null | undefined) {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Not priced';

    return `$${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function buildPricingResults(companyId: string, entries: EstimatePriceBookEntry[], template: EstimateCategoryTemplate) {
    const cappedEntries = entries.slice(0, 4);

    return cappedEntries.map((entry, index) => {
        const lineInputs: EstimateLineInput[] = cappedEntries.slice(0, index + 1).map((candidate, candidateIndex) => ({
            priceBookEntryId: candidate.id,
            quantity: 1,
            source: candidateIndex === 0 ? 'base_installation' : 'modifier',
            required: candidate.requiredAddOnCodes.length > 0 || template.requiredScopeCodes.includes(candidate.code),
            removable: candidateIndex !== 0,
        }));

        return calculateEstimateOptionPrice({
            id: `pricing-${index + 1}`,
            companyId,
            priceBookEntries: entries,
            lineInputs,
            priceBookVersion: createPriceBookVersion(entries),
            requiredScopeCodes: template.requiredScopeCodes,
        });
    });
}

function buildDeterministicChoices(input: {
    category: EstimateOptionCategory;
    template: EstimateCategoryTemplate;
    pricingResults: EstimatePricingResult[];
    products: EstimateApprovedProduct[];
    draftContext: EstimateDraftContextLike | null;
}) {
    const validPricingResults = input.pricingResults.filter((result) => result.missingPricingInputs.length === 0);
    const individualResults = validPricingResults.slice(0, 4);
    const homeownerName = preferredHomeownerFirstName(input.draftContext);
    const choices: EstimateChoice[] = individualResults.map((pricingResult, index) => {
        const structureName = input.template.recommendedOptionStructures[index] || `Option ${index + 1}`;
        const title = homeownerName
            ? `${homeownerName}'s ${structureName}`
            : structureName;
        const lineNames = pricingResult.lineItems.map((line) => line.name);

        return {
            id: `individual-${index + 1}`,
            kind: 'individual',
            title,
            shortSummary: lineNames.slice(0, 2).join(' + ') || input.template.label,
            homeownerExplanation: buildHomeownerExplanation(input.template.label, lineNames),
            keyBenefits: buildKeyBenefits(input.category, index),
            whyItDiffers: index === 0
                ? 'Focused minimum approved scope.'
                : `Adds ${lineNames[lineNames.length - 1] || 'approved scope'} compared with the previous option.`,
            recommendedReason: index === Math.min(1, individualResults.length - 1)
                ? 'Balanced scope with approved pricing and fewer missing decisions.'
                : null,
            productIds: input.products.slice(index, index + 1).map((product) => product.id),
            scopeIds: pricingResult.lineItems.map((line) => line.priceBookEntryId),
            warrantyIds: pricingResult.priceBookSnapshot
                .map((snapshot) => snapshot.priceBookEntryId)
                .filter((id) => id.toLowerCase().includes('warranty')),
            inclusionIds: pricingResult.lineItems.map((line) => line.code),
            exclusionIds: [],
            pricingResult,
            recommended: index === Math.min(1, individualResults.length - 1),
            displayOrder: index + 1,
        };
    });

    if (validPricingResults.length >= 3) {
        const packagePricingResult = validPricingResults[validPricingResults.length - 1];

        choices.push({
            id: 'package-1',
            kind: 'package',
            title: homeownerName
                ? `${homeownerName}'s Home Reliability Package`
                : 'Home Reliability Package',
            shortSummary: 'Combines approved related improvements into one reviewed package.',
            homeownerExplanation: buildHomeownerExplanation(input.template.label, packagePricingResult.lineItems.map((line) => line.name)),
            keyBenefits: ['Combines related work', 'Keeps pricing deterministic', 'Reduces repeat visits when approved'],
            whyItDiffers: 'Packages related approved improvements instead of presenting another renamed single option.',
            recommendedReason: 'Best fit when the homeowner wants broader reliability from the same visit.',
            productIds: input.products.slice(0, 2).map((product) => product.id),
            scopeIds: packagePricingResult.lineItems.map((line) => line.priceBookEntryId),
            warrantyIds: [],
            inclusionIds: packagePricingResult.lineItems.map((line) => line.code),
            exclusionIds: [],
            pricingResult: packagePricingResult,
            recommended: false,
            displayOrder: choices.length + 1,
        });
    }

    return choices.slice(0, 6);
}

function buildPresentationGate(input: {
    answerValidation: EstimateAnswerValidation;
    pricingResults: EstimatePricingResult[];
    choices: EstimateChoice[];
    technicianApproved: boolean;
    aiValidationFailed: boolean;
    pricingSetupRequired: boolean;
    approvedProducts: EstimateApprovedProduct[];
}): EstimatePresentationGate {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!input.answerValidation.complete) {
        blockers.push(...formatMissingAnswerBlockers(input.answerValidation));
    }

    if (input.pricingSetupRequired) {
        blockers.push('Pricing setup required.');

        return {
            canPresent: false,
            blockers,
            warnings,
        };
    }

    if (input.pricingResults.some((result) => result.missingPricingInputs.length > 0)) blockers.push('Pricing inputs are missing.');
    if (input.pricingResults.some((result) => result.requiredManagementApproval)) blockers.push('Management approval is required for pricing guardrails.');
    if (input.aiValidationFailed) blockers.push('AI validation failed.');
    const individualChoiceCount = input.choices.filter((choice) => choice.kind === 'individual').length;
    const hasEnoughIndividualChoices = individualChoiceCount >= 2;

    if (!hasEnoughIndividualChoices) blockers.push('At least two materially different individual options are required.');
    if (input.choices.filter((choice) => choice.kind === 'package').length > 2) blockers.push('No more than two packages may be presented.');
    if (input.choices.length > 6) blockers.push('No more than six homeowner-facing choices may be presented.');
    if (hasEnoughIndividualChoices && !input.technicianApproved) blockers.push('Technician approval is required before presentation.');
    if (input.approvedProducts.some((product) => !product.approved || !product.active)) blockers.push('Unapproved or inactive product selected.');

    input.pricingResults.forEach((result) => {
        result.warnings.forEach((warning) => warnings.push(warning));
    });

    return {
        canPresent: blockers.length === 0,
        blockers,
        warnings,
    };
}

function selectEligiblePriceBookEntries(
    entries: EstimatePriceBookEntry[],
    companyId: string,
    template: EstimateCategoryTemplate
) {
    const exactMatches = entries.filter((entry) =>
        entry.companyId === companyId &&
        entry.active &&
        entry.recommendedSellingPrice !== null &&
        template.pricingCategoryFilters.some((filter) =>
            normalizeText(entry.serviceCategory).includes(normalizeText(filter)) ||
            normalizeText(entry.name).includes(normalizeText(filter)) ||
            entry.applicableCategories.some((category) => normalizeText(category).includes(normalizeText(filter)))
        )
    );

    if (exactMatches.length > 0) return sortPriceEntries(exactMatches);

    return sortPriceEntries(entries.filter((entry) =>
        entry.companyId === companyId &&
        entry.active &&
        entry.recommendedSellingPrice !== null
    ));
}

function sortPriceEntries(entries: EstimatePriceBookEntry[]) {
    return [...entries].sort((first, second) =>
        first.serviceCategory.localeCompare(second.serviceCategory) ||
        first.name.localeCompare(second.name) ||
        first.code.localeCompare(second.code)
    );
}

function readAiChoice(
    value: unknown,
    index: number,
    context: ApprovedAiReferenceContext,
    errors: string[]
): AiEstimateDraftChoice | null {
    const record = readRecord(value);

    if (!record) {
        errors.push(`AI choice ${index + 1} is not an object.`);
        return null;
    }

    const sourceChoiceId = readText(record.source_choice_id) || readText(record.sourceChoiceId) || readText(record.id);
    const kindText = normalizeText(readText(record.kind));
    const kind: EstimateChoiceKind = kindText === 'package' ? 'package' : 'individual';
    const title = readText(record.title);
    const shortSummary = readText(record.short_summary) || readText(record.shortSummary);
    const homeownerExplanation = readText(record.homeowner_explanation) || readText(record.homeownerExplanation);
    const displayOrder = readNumber(record.display_order) ?? readNumber(record.displayOrder) ?? index + 1;
    const choice: AiEstimateDraftChoice = {
        sourceChoiceId,
        kind,
        title,
        shortSummary,
        homeownerExplanation,
        keyBenefits: readTextArray(record.key_benefits || record.keyBenefits),
        whyItDiffers: readText(record.why_it_differs) || readText(record.whyItDiffers),
        recommendedReason: readNullableText(record.recommended_reason || record.recommendedReason),
        productIds: readTextArray(record.approved_product_ids || record.productIds),
        scopeIds: readTextArray(record.approved_scope_ids || record.scopeIds),
        warrantyIds: readTextArray(record.approved_warranty_ids || record.warrantyIds),
        inclusionIds: readTextArray(record.inclusion_ids || record.inclusionIds),
        exclusionIds: readTextArray(record.exclusion_ids || record.exclusionIds),
        displayOrder,
    };

    if (!context.choiceIds.includes(sourceChoiceId)) errors.push(`AI choice references unknown choice id: ${sourceChoiceId || 'blank'}.`);
    if (!title) errors.push(`AI choice ${sourceChoiceId || index + 1} is missing a title.`);
    if (!shortSummary) errors.push(`AI choice ${sourceChoiceId || index + 1} is missing a short summary.`);
    if (!homeownerExplanation) errors.push(`AI choice ${sourceChoiceId || index + 1} is missing a homeowner explanation.`);

    assertAllowedReferences(choice.productIds, context.productIds, 'product', sourceChoiceId, errors);
    assertAllowedReferences(choice.scopeIds, context.scopeIds, 'scope', sourceChoiceId, errors);
    assertAllowedReferences(choice.warrantyIds, context.warrantyIds, 'warranty', sourceChoiceId, errors);
    assertAllowedReferences(choice.inclusionIds, context.inclusionIds, 'inclusion', sourceChoiceId, errors);
    assertAllowedReferences(choice.exclusionIds, context.exclusionIds, 'exclusion', sourceChoiceId, errors);

    return choice;
}

function readChoiceArray(record: Record<string, unknown> | null) {
    if (!record) return [];
    const directChoices = record.choices;

    if (Array.isArray(directChoices)) return directChoices;

    return [
        ...(Array.isArray(record.individual_options) ? record.individual_options : []),
        ...(Array.isArray(record.packages) ? record.packages : []),
    ];
}

function collectDisallowedNumericFields(value: unknown, path = 'response'): string[] {
    if (typeof value === 'number') {
        return isAllowedAiNumericPath(path) ? [] : [path];
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => collectDisallowedNumericFields(entry, `${path}[${index}]`));
    }

    const record = readRecord(value);

    if (!record) return [];

    return Object.entries(record).flatMap(([key, nestedValue]) =>
        collectDisallowedNumericFields(nestedValue, `${path}.${key}`)
    );
}

function isAllowedAiNumericPath(path: string) {
    const normalized = path.toLowerCase();

    return normalized.endsWith('.display_order') || normalized.endsWith('.displayorder');
}

function assertAllowedReferences(
    values: string[],
    allowedValues: string[],
    label: string,
    sourceChoiceId: string,
    errors: string[]
) {
    values.forEach((value) => {
        if (!allowedValues.includes(value)) {
            errors.push(`AI choice ${sourceChoiceId || 'unknown'} references unapproved ${label} id: ${value}.`);
        }
    });
}

function sumOptionalAmounts(
    lines: EstimateCalculatedLine[],
    entries: EstimatePriceBookEntry[],
    field: 'minimumPermittedSellingPrice' | 'maximumPermittedSellingPrice'
) {
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    let total = 0;
    let hasAnyAmount = false;

    lines.forEach((line) => {
        const amount = entriesById.get(line.priceBookEntryId)?.[field] ?? null;

        if (amount !== null) {
            hasAnyAmount = true;
            total += amount * line.quantity;
        }
    });

    return hasAnyAmount ? roundMoney(total) : null;
}

function createPriceBookVersion(entries: EstimatePriceBookEntry[]) {
    return entries
        .map((entry) => `${entry.code}:${entry.version || entry.effectiveAt || 'unversioned'}`)
        .join('|') || 'unversioned';
}

function buildHomeownerExplanation(label: string, lineNames: string[]) {
    if (lineNames.length === 0) return `Reviewed ${label.toLowerCase()} option with approved company pricing.`;

    return `Reviewed ${label.toLowerCase()} option including ${lineNames.join(', ')}. Pricing comes from the approved company price book.`;
}

function buildKeyBenefits(category: EstimateOptionCategory, index: number) {
    const baseBenefits: Record<EstimateOptionCategory, string[]> = {
        toilet_replacement: ['Correct fit confirmed', 'Approved scope only', 'Leak and flush check included'],
        water_heater: ['Safety checklist reviewed', 'Approved hot water scope', 'Warranty path visible'],
        garbage_disposal: ['Power and drain fit checked', 'Approved model path', 'Leak and operation check included'],
        faucet_replacement: ['Sink fit confirmed', 'Shutoffs reviewed', 'Approved fixture path'],
        whole_home_repipe: ['Fixture point count audited', 'Access factors visible', 'Scope totals remain editable'],
    };

    return baseBenefits[category].slice(0, Math.min(3, 1 + index));
}

function preferredHomeownerFirstName(context: EstimateDraftContextLike | null) {
    const name = String(context?.customer_home_name || '').trim();

    if (!name || /^client homeos/i.test(name)) return '';

    return name.split(/\s+/)[0] || '';
}

export function isAnswerComplete(value: EstimateAnswerValue | undefined) {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (isPhotoRequirementAnswer(value)) return isPhotoRequirementComplete(value);
    if (isMeasurementRequirementAnswer(value)) return isMeasurementRequirementComplete(value);

    return false;
}

export function photoRequirementAnswerKey(label: string) {
    return `photo:${label}`;
}

export function measurementRequirementAnswerKey(label: string) {
    return `measurement:${label}`;
}

export function estimateRequirementId(label: string) {
    const normalized = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'requirement';
}

export function isPhotoRequirementAnswer(value: EstimateAnswerValue | undefined): value is EstimateRequirementPhotoAnswer {
    const record = readRecord(value);

    return record?.kind === 'requirement_photo' &&
        readText(record.requirementId).length > 0 &&
        readText(record.attachmentId).length > 0 &&
        readText(record.bucket).length > 0 &&
        readText(record.storagePath).length > 0;
}

export function isMeasurementRequirementAnswer(value: EstimateAnswerValue | undefined): value is EstimateRequirementMeasurementAnswer {
    const record = readRecord(value);
    const amount = typeof record?.value === 'number' ? record.value : Number(record?.value);

    return record?.kind === 'requirement_measurement' &&
        Number.isFinite(amount) &&
        amount > 0 &&
        readText(record.unit).length > 0;
}

export function isPhotoRequirementComplete(value: EstimateAnswerValue | undefined) {
    return isPhotoRequirementAnswer(value);
}

export function isMeasurementRequirementComplete(value: EstimateAnswerValue | undefined) {
    return isMeasurementRequirementAnswer(value);
}

function formatMissingAnswerBlockers(validation: EstimateAnswerValidation) {
    const blockers: string[] = [];

    if (validation.missingRequiredQuestionLabels.length > 0) {
        blockers.push(`Required questions still missing: ${validation.missingRequiredQuestionLabels.join(', ')}.`);
    }

    if (validation.missingRequiredPhotoLabels.length > 0) {
        blockers.push(`Required photos still missing: ${validation.missingRequiredPhotoLabels.join(', ')}.`);
    }

    if (validation.missingRequiredMeasurementLabels.length > 0) {
        blockers.push(`Required measurements still missing: ${validation.missingRequiredMeasurementLabels.join(', ')}.`);
    }

    return blockers;
}

function selectQuestion(id: string, label: string, required: boolean, allowedAnswers: string[]): EstimateQuestionDefinition {
    return { id, label, type: 'single_select', required, allowedAnswers };
}

function multiQuestion(id: string, label: string, required: boolean, allowedAnswers: string[]): EstimateQuestionDefinition {
    return { id, label, type: 'multi_select', required, allowedAnswers };
}

function yesNoQuestion(id: string, label: string, required: boolean): EstimateQuestionDefinition {
    return { id, label, type: 'yes_no', required, allowedAnswers: ['yes', 'no'] };
}

function measurementQuestion(id: string, label: string, required: boolean): EstimateQuestionDefinition {
    return { id, label, type: 'measurement', required, min: 0 };
}

function noteQuestion(id: string, label: string, required: boolean): EstimateQuestionDefinition {
    return { id, label, type: 'short_note', required };
}

function normalizeQuantity(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === 'boolean') return value ? 1 : 0;

    return 0;
}

function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function uniqueText(values: string[]) {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function normalizeText(value: string) {
    return value.trim().toLowerCase().replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ');
}

function readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    return value as Record<string, unknown>;
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableText(value: unknown) {
    const text = readText(value);

    return text || null;
}

function readNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsed = Number.parseFloat(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(value: unknown) {
    const numberValue = readNullableNumber(value);

    return numberValue === null ? null : numberValue;
}

function readTextArray(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => readText(entry))
        .filter((entry) => entry.length > 0);
}
