import { plumbingPriceBookCatalogItems } from './plumbingPriceBookCatalog';

export type EstimateWorkType = 'repair_service' | 'replacement';

export type EstimateOptionCategory =
    | 'toilet_replacement'
    | 'water_heater'
    | 'garbage_disposal'
    | 'faucet_replacement'
    | 'whole_home_repipe'
    | 'valve_replacement'
    | 'riser_replacement'
    | 'water_main_replacement'
    | 'sewer_line_replacement'
    | 'gas_line_replacement'
    | 'water_filtration_replacement'
    | 'irrigation_installation'
    | 'toilet_repair'
    | 'water_heater_service'
    | 'garbage_disposal_repair'
    | 'faucet_repair'
    | 'water_main_repair'
    | 'sewer_service_repair'
    | 'gas_service_repair'
    | 'water_filtration_service'
    | 'plumbing_reroute'
    | 'leak_search_isolation'
    | 'irrigation_service_repair';

const FAUCET_REINSTALL_EXISTING_PRICE_KEY = 'faucet-reinstall-existing';
const FAUCET_INSTALL_COMPANY_APPROVED_PRICE_KEY = 'faucet-install-company-approved';
const WATER_HEATER_CUSTOM_SCOPE_LABEL = 'Custom repair / service';
const WATER_HEATER_CUSTOM_SCOPE_ANSWER_ID = 'water_heater_service_custom_scope';

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

export type EstimateRequirementSkipReason =
    | 'inaccessible'
    | 'unsafe_to_capture'
    | 'label_unreadable'
    | 'customer_unavailable'
    | 'not_applicable'
    | 'other';

export type EstimateRequirementState = 'completed' | 'skipped' | 'missing';

export type EstimateRequirementSkipAnswer = {
    kind: 'requirement_skip';
    requirementId: string;
    state: 'skipped';
    reason: EstimateRequirementSkipReason | null;
    skippedAt: string;
};

export type EstimateAnswerValue =
    | string
    | number
    | boolean
    | string[]
    | EstimateRequirementPhotoAnswer
    | EstimateRequirementMeasurementAnswer
    | EstimateRequirementSkipAnswer
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
    service_category?: string | null;
    internal_description?: string | null;
    homeowner_description?: string | null;
    base_labor_install_price?: number | null;
    estimated_labor_hours?: number | null;
    internal_labor_cost?: number | null;
    internal_material_cost?: number | null;
    recommended_selling_price?: number | null;
    minimum_permitted_selling_price?: number | null;
    maximum_permitted_selling_price?: number | null;
    required_minimum_gross_margin?: number | null;
    tax_behavior?: string | null;
    effective_at?: string | null;
    version_label?: string | null;
    included_warranty?: string | null;
    eligible_extended_warranties?: string[];
    required_add_on_price_keys?: string[];
    incompatible_price_keys?: string[];
    applicable_systems?: string[];
    applicable_areas?: string[];
    applicable_categories?: string[];
    management_notes?: string | null;
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
    customAnswer?: {
        optionLabel: string;
        answerId: string;
        label: string;
        placeholder: string;
    };
};

export type EstimateCategoryTemplate = {
    id: EstimateOptionCategory;
    label: string;
    workType: EstimateWorkType;
    serviceCategory: string;
    requiredPhotoLabels: string[];
    requiredMeasurementLabels: string[];
    questions: EstimateQuestionDefinition[];
    productCategoryFilters: string[];
    pricingCategoryFilters: string[];
    scopePriceKeys: string[];
    scopeQuestionId?: string;
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
    priceAdjustmentPercentage?: number;
    priceAdjustmentLabel?: string | null;
};

export type EstimatePresentationGate = {
    canPresent: boolean;
    blockers: string[];
    warnings: string[];
};

export type EstimateDraftGate = {
    canDraft: boolean;
    blockers: string[];
    warnings: string[];
    missingBeforeFinalPresentation: string[];
    skippedForNow: string[];
    assumptionsUsedInDraft: string[];
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
    draftGate: EstimateDraftGate;
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
    priceAdjustmentPercentage: number;
    priceAdjustmentLabel: string | null;
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
        workType: 'replacement',
        serviceCategory: 'Toilets',
        requiredPhotoLabels: ['Existing toilet', 'Toilet base and floor', 'Shutoff valve'],
        requiredMeasurementLabels: ['Rough-in measurement'],
        productCategoryFilters: ['toilet', 'bidet'],
        pricingCategoryFilters: ['Toilets'],
        scopePriceKeys: [
            'water_service_bathroom_toilet_replacement',
            'water_service_bathroom_round_front_toilet_replacement',
            'water_service_bathroom_elongated_toilet_replacement',
            'water_service_bathroom_one_piece_toilet_replacement',
            'water_service_bathroom_pressure_assist_toilet_replacement',
            'water_service_bathroom_toilet_installation_customer_supplied',
        ],
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
        label: 'Water Heater / Tankless Replacement',
        workType: 'replacement',
        serviceCategory: 'Water Heaters',
        requiredPhotoLabels: ['Existing unit photo', 'Model / serial label', 'Full installation area', 'Venting or flue', 'Water and fuel connections'],
        requiredMeasurementLabels: ['Tank size or tankless demand'],
        productCategoryFilters: ['tank water heater', 'tankless water heater', 'expansion tank', 'recirculation'],
        pricingCategoryFilters: ['Water Heaters', 'Gas', 'Valves / Shutoffs'],
        scopePriceKeys: [
            'water_service_garage_mechanical_standard_tank_water_heater_replacement',
            'water_service_garage_mechanical_tankless_water_heater_replacement',
            'water_service_garage_mechanical_water_heater_expansion_tank_installation',
            'water_service_garage_mechanical_water_heater_pan_installation',
            'water_service_garage_mechanical_water_heater_stand_installation',
            'water_service_garage_mechanical_water_heater_seismic_strap_installation',
            'water_service_garage_mechanical_water_heater_tp_valve_replacement',
            'water_service_garage_mechanical_water_heater_permit_code_correction',
            'drain_sewer_garage_mechanical_water_heater_drain_pan_line_installation',
            'gas_service_garage_mechanical_gas_shutoff_replacement',
            'gas_service_garage_mechanical_gas_flex_connector_replacement',
            'gas_service_garage_mechanical_gas_sediment_trap_installation',
        ],
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
            selectQuestion('water_quality_observation', 'Water quality observed', false, ['no concern observed', 'scale / sediment', 'hard water confirmed', 'unknown']),
            multiQuestion('code_corrections', 'Code corrections', true, ['None required', 'permit', 'pan', 'straps', 'T&P', 'venting', 'gas connector', 'sediment trap', 'expansion tank']),
            selectQuestion('desired_warranty', 'Desired warranty', false, ['Not discussed yet', 'Let homeowner choose', 'standard', 'extended', 'premium']),
            multiQuestion('homeowner_priorities', 'Homeowner priorities', false, ['lowest cost', 'reliability', 'efficiency', 'faster hot water', 'warranty', 'space saving']),
        ],
    },
    {
        id: 'garbage_disposal',
        label: 'Garbage Disposal Replacement',
        workType: 'replacement',
        serviceCategory: 'Drains / Sewer',
        requiredPhotoLabels: ['Existing disposal', 'Under-sink drain piping', 'Electrical connection area'],
        requiredMeasurementLabels: [],
        productCategoryFilters: ['garbage disposal'],
        pricingCategoryFilters: ['Drains / Sewer'],
        scopePriceKeys: ['drain_sewer_kitchen_garbage_disposal_replacement'],
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
        workType: 'replacement',
        serviceCategory: 'Faucets / Sinks',
        requiredPhotoLabels: ['Existing faucet', 'Under-sink connections', 'Sink hole layout'],
        requiredMeasurementLabels: ['Hole spread'],
        productCategoryFilters: ['faucet', 'sink'],
        pricingCategoryFilters: ['Faucets / Sinks', 'Valves / Shutoffs'],
        scopePriceKeys: [
            FAUCET_REINSTALL_EXISTING_PRICE_KEY,
            FAUCET_INSTALL_COMPANY_APPROVED_PRICE_KEY,
            'water_service_kitchen_kitchen_faucet_replacement',
            'water_service_kitchen_pull_down_kitchen_faucet_replacement',
            'water_service_bathroom_bathroom_faucet_replacement',
            'water_service_bathroom_widespread_faucet_replacement',
            'water_service_bathroom_single_handle_faucet_replacement',
            'water_service_laundry_utility_sink_faucet_replacement',
        ],
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
        workType: 'replacement',
        serviceCategory: 'Water Service',
        requiredPhotoLabels: ['Main water entry', 'Water heater area', 'Typical fixture access', 'Attic / crawl / slab access'],
        requiredMeasurementLabels: ['Approximate home size'],
        productCategoryFilters: ['repipe materials', 'valves', 'shutoff valves', 'supply lines'],
        pricingCategoryFilters: ['Water Service', 'Valves / Shutoffs', 'Other Plumbing'],
        scopePriceKeys: [
            'water_service_whole_home_repipe_estimate',
            'water_service_whole_home_partial_repipe_by_fixture',
        ],
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
            yesNoQuestion('occupied', 'Occupied during work', true),
            yesNoQuestion('permit', 'Permit', true),
            selectQuestion('patching', 'Patching', true, ['included', 'excluded', 'allowance / separate']),
            selectQuestion('routing_access_difficulty', 'Routing / access difficulty', true, ['standard', 'moderate', 'difficult']),
        ],
    },
    scopedEstimateTemplate({
        id: 'valve_replacement',
        label: 'Valve / Shutoff Replacement',
        workType: 'replacement',
        serviceCategory: 'Valves / Shutoffs',
        scopeQuestionId: 'valve_replacement_scope',
        scopeQuestionLabel: 'What valve or shutoff are we replacing?',
        scopePriceKeys: [
            'water_service_bathroom_shower_valve_replacement',
            'water_service_bathroom_tub_shower_valve_replacement',
            'water_service_bathroom_tub_spout_replacement',
            'water_service_garage_mechanical_main_water_shutoff_replacement',
            'water_service_garage_mechanical_prv_pressure_regulator_replacement',
            'water_service_kitchen_kitchen_sink_shutoff_replacement',
            'water_service_bathroom_bathroom_angle_stop_replacement',
            'water_service_bathroom_toilet_shutoff_replacement',
            'water_service_laundry_washing_machine_valve_replacement',
            'water_service_exterior_exterior_shutoff_replacement',
            'water_service_exterior_irrigation_tie_in_shutoff_replacement',
            'water_service_exterior_backflow_device_replacement',
            'water_service_exterior_hose_bib_replacement',
        ],
        requiredPhotoLabels: ['Existing valve', 'Valve access area', 'Connected piping'],
        requiredMeasurementLabels: ['Valve or pipe size'],
        questions: [
            selectQuestion('valve_type', 'Valve type', true, ['shower valve', 'main water shutoff', 'angle stop', 'pressure regulator', 'backflow assembly', 'hose bibb valve', 'other']),
            selectQuestion('shower_configuration', 'Shower or tub setup', true, ['shower only', 'tub and shower combination', 'tub only', 'not applicable - different valve type']),
            selectQuestion('tub_spout_scope', 'Tub spout', true, ['not applicable', 'existing tub spout remains', 'replace tub spout']),
            selectQuestion('valve_service', 'Service', true, ['domestic water', 'hot water', 'irrigation', 'fire protection', 'gas', 'other']),
            selectQuestion('valve_material', 'Existing valve / piping material', true, ['copper / brass', 'PEX', 'CPVC', 'galvanized', 'PVC', 'mixed / unknown']),
            selectQuestion('valve_access', 'Access', true, ['exposed', 'cabinet / under fixture', 'access panel', 'in wall', 'underground / valve box', 'no existing access']),
            selectQuestion('isolation_method', 'Isolation method', true, ['local shutoff works', 'building main shutoff', 'utility shutoff required', 'system drain-down required', 'unknown']),
            selectQuestion('connection_method', 'Connection method', true, ['soldered', 'threaded', 'pressed', 'compression', 'push-fit', 'flanged', 'unknown']),
            selectQuestion('finish_restoration', 'Wall, cabinet, or surface restoration', true, ['not required', 'access panel included', 'patching included', 'patching excluded', 'separate allowance']),
            yesNoQuestion('permit_or_testing', 'Permit, certification, or backflow testing required', true),
        ],
    }),
    scopedEstimateTemplate({
        id: 'riser_replacement',
        label: 'Riser Replacement',
        workType: 'replacement',
        serviceCategory: 'Water Service',
        scopeQuestionId: 'riser_replacement_scope',
        scopeQuestionLabel: 'What riser replacement are we performing?',
        scopePriceKeys: [
            'water_service_whole_home_domestic_water_riser_replacement_linear_foot',
        ],
        requiredPhotoLabels: ['Existing riser', 'Lower and upper connection points', 'Access route'],
        requiredMeasurementLabels: ['Approximate riser length', 'Pipe size'],
        questions: [
            selectQuestion('riser_service', 'Riser service', true, ['domestic cold water', 'domestic hot water', 'hot-water return', 'other']),
            selectQuestion('riser_material', 'Existing pipe material', true, ['copper', 'PEX', 'CPVC', 'galvanized', 'mixed / unknown']),
            selectQuestion('riser_access', 'Access route', true, ['open / exposed', 'existing chase', 'wall or ceiling opening', 'exterior access', 'limited / unknown']),
            yesNoQuestion('riser_permit', 'Permit or inspection required?', true),
        ],
        warnings: ['Risers are replacement work in this workflow; do not present a riser repair option.'],
    }),
    scopedEstimateTemplate({
        id: 'water_main_replacement',
        label: 'Water Main Replacement',
        workType: 'replacement',
        serviceCategory: 'Water Service',
        scopeQuestionId: 'water_main_replacement_scope',
        scopeQuestionLabel: 'What water-main replacement scope are we pricing?',
        scopePriceKeys: [
            'water_service_whole_home_main_water_service_replacement_estimate',
            'water_service_whole_home_main_water_service_replacement_linear_foot',
        ],
        requiredPhotoLabels: ['Water service route', 'Meter and building entry'],
        requiredMeasurementLabels: ['Approximate replacement length'],
        questions: [
            selectQuestion('water_main_material', 'Proposed pipe material', true, ['copper', 'PEX', 'HDPE / approved plastic', 'management selected']),
            selectQuestion('water_main_access', 'Route and access', true, ['open trench', 'landscape', 'hardscape crossing', 'bore / trenchless review']),
            yesNoQuestion('water_main_permit', 'Permit or inspection required?', true),
        ],
    }),
    scopedEstimateTemplate({
        id: 'sewer_line_replacement',
        label: 'Sewer Line Replacement',
        workType: 'replacement',
        serviceCategory: 'Drains / Sewer',
        scopeQuestionId: 'sewer_replacement_scope',
        scopeQuestionLabel: 'What sewer replacement scope are we pricing?',
        scopePriceKeys: ['drain_sewer_whole_home_sewer_line_replacement_linear_foot'],
        requiredPhotoLabels: ['Sewer route and access', 'Camera finding or failure area'],
        requiredMeasurementLabels: ['Approximate replacement length'],
        questions: [
            selectQuestion('sewer_replacement_method', 'Replacement method', true, ['open trench', 'trenchless review', 'under-structure access', 'management selected']),
            selectQuestion('sewer_pipe_material', 'Existing pipe material', true, ['cast iron', 'clay', 'ABS', 'PVC', 'Orangeburg', 'unknown']),
            yesNoQuestion('sewer_permit', 'Permit or inspection required?', true),
        ],
    }),
    scopedEstimateTemplate({
        id: 'gas_line_replacement',
        label: 'Gas Line Replacement / Reroute',
        workType: 'replacement',
        serviceCategory: 'Gas',
        scopeQuestionId: 'gas_replacement_scope',
        scopeQuestionLabel: 'What gas-line replacement scope are we pricing?',
        scopePriceKeys: [
            'gas_service_garage_mechanical_gas_line_replacement_linear_foot',
            'gas_service_exterior_gas_line_extension',
            'gas_service_kitchen_gas_line_extension_to_range',
        ],
        requiredPhotoLabels: ['Gas line route and connections'],
        requiredMeasurementLabels: ['Approximate gas line length'],
        questions: [
            selectQuestion('gas_appliance_load', 'Appliance or load served', true, ['water heater', 'range', 'dryer', 'BBQ / exterior', 'multiple appliances', 'other']),
            selectQuestion('gas_pipe_size', 'Existing or proposed pipe size', true, ['1/2 in', '3/4 in', '1 in', 'larger / sizing required', 'unknown']),
            yesNoQuestion('gas_test_permit', 'Pressure test or permit required?', true),
        ],
        warnings: ['Gas work must follow company licensing, testing, permit, and safety requirements.'],
    }),
    scopedEstimateTemplate({
        id: 'water_filtration_replacement',
        label: 'Water Filtration Installation / Replacement',
        workType: 'replacement',
        serviceCategory: 'Water Quality',
        scopeQuestionId: 'filtration_replacement_scope',
        scopeQuestionLabel: 'What treatment equipment are we installing or replacing?',
        scopePriceKeys: [
            'water_quality_garage_mechanical_whole_home_filter_installation',
            'water_quality_garage_mechanical_water_softener_installation',
            'water_quality_garage_mechanical_water_conditioner_installation',
            'water_quality_garage_mechanical_uv_light_installation',
            'water_quality_kitchen_reverse_osmosis_installation',
            'water_quality_kitchen_under_sink_filter_installation',
        ],
        requiredPhotoLabels: ['Main water entry', 'Proposed installation area', 'Drain and electrical access', 'Existing treatment equipment'],
        requiredMeasurementLabels: ['Water hardness', 'Peak service flow'],
        questions: [
            selectQuestion('water_source', 'Water source', true, ['municipal', 'private well', 'shared well', 'unknown']),
            multiQuestion('treatment_goals', 'Treatment goals', true, ['sediment', 'chlorine / taste', 'chloramine', 'hardness / scale', 'iron / manganese', 'sulfur / odor', 'microbial protection', 'other']),
            selectQuestion('water_test_status', 'Water testing', true, ['recent lab results available', 'onsite test completed', 'test required', 'customer declined testing']),
            selectQuestion('installation_scope', 'Installation scope', true, ['whole home', 'drinking water only', 'whole home plus drinking water', 'equipment replacement']),
            selectQuestion('main_line_size', 'Main water line size', true, ['3/4 in', '1 in', '1-1/4 in', '1-1/2 in', '2 in', 'unknown / measure']),
            selectQuestion('pre_filter_size', 'Pre-filter', true, ['none', '10 in slim', '20 in slim', '10 in Big Blue', '20 in Big Blue', 'needs sizing']),
            selectQuestion('pre_filter_micron', 'Pre-filter micron rating', true, ['1 micron', '5 micron', '10 micron', '20 micron', '50 micron', 'not applicable', 'needs water test']),
            selectQuestion('carbon_unit_size', 'Carbon unit', true, ['none', '10 in cartridge', '20 in cartridge', '10 in Big Blue', '20 in Big Blue', 'whole-home media tank', 'needs sizing']),
            selectQuestion('carbon_media', 'Carbon media', true, ['carbon block', 'GAC', 'catalytic carbon', 'specialty media', 'not applicable', 'needs water test']),
            selectQuestion('softener_size', 'Water softener', true, ['none', '24,000 grain', '32,000 grain', '40,000 grain', '48,000 grain', '64,000 grain', 'twin tank', 'needs sizing']),
            selectQuestion('post_filter_size', 'Post-filter', true, ['none', '10 in cartridge', '20 in cartridge', '10 in Big Blue', '20 in Big Blue', 'polishing filter', 'needs sizing']),
            selectQuestion('uv_disinfection', 'UV disinfection', true, ['not required', 'add for well', '8 gpm', '12 gpm', '20 gpm', 'replace existing', 'needs water test']),
            selectQuestion('installation_location', 'Equipment location', true, ['garage / mechanical', 'exterior enclosure', 'basement', 'crawlspace', 'utility room', 'other']),
            selectQuestion('drain_access', 'Drain access', true, ['existing drain available', 'new drain route required', 'discharge location needs review', 'not required']),
            selectQuestion('electrical_access', 'Electrical access', true, ['existing outlet', 'new outlet required', 'dedicated circuit review', 'not required']),
            selectQuestion('bypass_valves', 'Bypass and isolation valves', true, ['existing good', 'include new bypass', 'replace existing', 'needs inspection']),
            selectQuestion('maintenance_plan', 'Maintenance plan', false, ['customer maintained', 'company service plan', 'annual service', 'not discussed']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'irrigation_installation',
        label: 'Irrigation / Pool Fill Installation',
        workType: 'replacement',
        serviceCategory: 'Valves / Shutoffs',
        scopeQuestionId: 'irrigation_install_scope',
        scopeQuestionLabel: 'What exterior valve or fill component are we installing?',
        scopePriceKeys: [
            'water_service_exterior_irrigation_valve_installation',
            'water_service_exterior_pool_autofill_valve_installation',
            'water_service_exterior_pressure_vacuum_breaker_replacement',
            'water_service_exterior_backflow_device_replacement',
        ],
        requiredPhotoLabels: ['Exterior installation area', 'Water supply tie-in'],
        questions: [
            selectQuestion('irrigation_access', 'Installation access', true, ['exposed', 'valve box', 'shallow buried', 'hardscape / excavation review']),
            selectQuestion('irrigation_pipe_material', 'Connected pipe material', true, ['PVC', 'copper', 'PEX', 'poly', 'unknown']),
            yesNoQuestion('irrigation_backflow', 'Backflow protection reviewed?', true),
        ],
        warnings: ['Scope covers approved plumbing valves and water connections, not landscaping or full irrigation-system design unless separately configured.'],
    }),
    scopedEstimateTemplate({
        id: 'toilet_repair',
        label: 'Toilet Repair / Service',
        workType: 'repair_service',
        serviceCategory: 'Toilets',
        scopeQuestionId: 'toilet_repair_scope',
        scopeQuestionLabel: 'What are we repairing on the toilet?',
        scopePriceKeys: [
            'water_service_bathroom_toilet_leak_diagnostic',
            'water_service_bathroom_toilet_running_repair',
            'water_service_bathroom_fill_valve_replacement',
            'water_service_bathroom_flush_valve_replacement',
            'water_service_bathroom_flapper_replacement',
            'water_service_bathroom_toilet_trip_lever_replacement',
            'water_service_bathroom_toilet_tank_rebuild',
            'water_service_bathroom_toilet_supply_line_replacement',
            'water_service_bathroom_toilet_closet_bolts_caps_replacement',
            'water_service_bathroom_toilet_reset',
            'drain_sewer_bathroom_wax_ring_replacement',
            'drain_sewer_bathroom_toilet_flange_repair',
            'drain_sewer_bathroom_toilet_flange_replacement',
            'water_service_bathroom_round_soft_close_toilet_seat_installation',
            'water_service_bathroom_elongated_soft_close_toilet_seat_installation',
        ],
        requiredPhotoLabels: ['Toilet and visible problem area'],
        questions: [
            selectQuestion('toilet_repair_type', 'Toilet type', true, ['two-piece gravity', 'one-piece', 'pressure assist', 'dual flush', 'wall hung', 'unknown']),
            selectQuestion('toilet_repair_bowl_shape', 'Bowl / seat shape', true, ['round', 'elongated', 'not applicable / unknown']),
            multiQuestion('toilet_symptoms', 'Observed symptoms', true, ['running', 'leaking at base', 'leaking at tank', 'weak / incomplete flush', 'loose toilet', 'handle does not work', 'seat issue', 'stoppage']),
            selectQuestion('toilet_flange_observation', 'Flange condition', false, ['not exposed', 'appears sound', 'repair needed', 'replacement needed']),
            selectQuestion('toilet_fixture_condition', 'Overall fixture condition', false, ['serviceable', 'worn but serviceable', 'cracked / damaged', 'replacement recommended']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'water_heater_service',
        label: 'Water Heater / Tankless Service & Repair',
        workType: 'repair_service',
        serviceCategory: 'Water Heaters',
        scopeQuestionId: 'water_heater_service_scope',
        scopeQuestionLabel: 'What water-heater service or repair are we performing?',
        scopePriceKeys: [
            'water_service_garage_mechanical_water_heater_diagnostic',
            'water_service_garage_mechanical_water_heater_service',
            'water_service_garage_mechanical_water_heater_flush',
            'water_service_garage_mechanical_water_heater_sediment_flush',
            'water_service_garage_mechanical_tankless_water_heater_descaling',
            'water_service_garage_mechanical_water_heater_warranty_diagnostic',
            'water_service_garage_mechanical_water_heater_drain_valve_replacement',
            'water_service_garage_mechanical_water_heater_tp_valve_replacement',
            'water_service_garage_mechanical_water_heater_gas_control_valve_replacement',
            'water_service_garage_mechanical_water_heater_thermopile_replacement',
            'water_service_garage_mechanical_water_heater_thermocouple_replacement',
            'water_service_garage_mechanical_water_heater_anode_rod_replacement',
            'water_service_garage_mechanical_water_heater_heating_element_replacement',
            'water_service_garage_mechanical_water_heater_thermostat_replacement',
            'water_service_garage_mechanical_water_heater_pilot_igniter_service',
            'water_service_garage_mechanical_tankless_water_heater_igniter_flame_sensor_service',
            'water_service_garage_mechanical_tankless_water_heater_inlet_filter_service',
            'water_service_garage_mechanical_tankless_water_heater_flow_sensor_replacement',
            'water_service_garage_mechanical_tankless_water_heater_service_valve_replacement',
            'water_service_garage_mechanical_pressure_regulator_adjustment',
            'water_service_garage_mechanical_recirculation_timer_setup',
        ],
        customScope: {
            optionLabel: WATER_HEATER_CUSTOM_SCOPE_LABEL,
            answerId: WATER_HEATER_CUSTOM_SCOPE_ANSWER_ID,
            label: 'Describe the custom repair or service',
            placeholder: 'Enter the exact component, diagnosis, or work being proposed.',
        },
        scopeQuestionAfter: 2,
        requiredPhotoLabels: ['Unit and model / serial label', 'Visible problem or service connections'],
        questions: [
            selectQuestion('service_unit_type', 'Unit type', true, ['tank', 'tankless', 'heat pump', 'recirculation system', 'unknown']),
            selectQuestion('service_fuel_type', 'Fuel / power type', true, ['gas', 'electric', 'propane', 'heat pump', 'unknown']),
            multiQuestion('water_heater_symptoms', 'Symptoms or reason for service', true, ['no hot water', 'not hot enough', 'leak', 'noise / sediment', 'error code', 'maintenance due', 'warranty call', 'recirculation issue']),
            selectQuestion('warranty_status', 'Warranty status', false, ['not a warranty call', 'manufacturer warranty', 'company workmanship warranty', 'unknown']),
            selectQuestion('water_heater_repairability', 'Repairability finding', false, ['repair recommended', 'replacement recommended', 'unsafe / not repairable', 'needs more diagnosis']),
            selectQuestion('water_quality_observation', 'Water quality observed', false, ['no concern observed', 'scale / sediment', 'hard water confirmed', 'unknown']),
            multiQuestion('water_heater_safety_findings', 'Safety checks', false, ['burner condition acceptable', 'combustion reset / thermal cutoff tripped', 'gas leak concern', 'venting concern', 'no safety concern observed']),
        ],
        warnings: ['Do not promise warranty coverage until the manufacturer or company approves the claim.'],
    }),
    scopedEstimateTemplate({
        id: 'garbage_disposal_repair',
        label: 'Garbage Disposal Repair / Reinstall',
        workType: 'repair_service',
        serviceCategory: 'Drains / Sewer',
        scopeQuestionId: 'disposal_repair_scope',
        scopeQuestionLabel: 'What are we repairing or reconnecting?',
        scopePriceKeys: [
            'drain_sewer_kitchen_garbage_disposal_diagnostic_jam_service',
            'drain_sewer_kitchen_garbage_disposal_reinstall_resecure',
            'drain_sewer_kitchen_garbage_disposal_flange_reseal',
            'drain_sewer_kitchen_garbage_disposal_drain_connection',
            'drain_sewer_kitchen_garbage_disposal_cord_connection_service',
            'drain_sewer_kitchen_kitchen_tubular_waste_rebuild',
            'drain_sewer_kitchen_dishwasher_drain_line_replacement',
        ],
        requiredPhotoLabels: ['Disposal and under-sink connections'],
        questions: [
            selectQuestion('disposal_power_type', 'Existing power connection', true, ['corded outlet', 'hardwired', 'air switch', 'wall switch', 'unknown']),
            multiQuestion('disposal_symptoms', 'Observed symptoms', true, ['jammed / humming', 'not running', 'loose / vibrating', 'leak at flange', 'leak at drain', 'dishwasher drain issue', 'cord / connection concern']),
            yesNoQuestion('disposal_unit_serviceable', 'Existing disposal is serviceable and safe to reuse?', true),
        ],
        warnings: ['Electrical modifications must be separated and performed only within company licensing and approved scope.'],
    }),
    scopedEstimateTemplate({
        id: 'faucet_repair',
        label: 'Faucet Repair / Service',
        workType: 'repair_service',
        serviceCategory: 'Faucets / Sinks',
        scopeQuestionId: 'faucet_repair_scope',
        scopeQuestionLabel: 'What are we repairing on the faucet?',
        scopePriceKeys: [
            'water_service_kitchen_kitchen_faucet_repair',
            'water_service_bathroom_bathroom_faucet_repair',
            'water_service_kitchen_kitchen_faucet_resecure',
            'water_service_kitchen_kitchen_faucet_cartridge_replacement',
            'water_service_kitchen_kitchen_faucet_aerator_service',
            'water_service_kitchen_kitchen_faucet_sprayer_hose_replacement',
            'water_service_bathroom_shower_cartridge_replacement',
            'water_service_bathroom_shower_valve_repair',
            'water_service_bathroom_roman_tub_valve_service',
            'water_service_bathroom_dual_sink_faucet_service',
        ],
        requiredPhotoLabels: ['Faucet and visible problem', 'Accessible connections below or behind fixture'],
        questions: [
            selectQuestion('faucet_repair_area', 'Fixture area', true, ['kitchen', 'bathroom sink', 'shower / tub', 'roman tub', 'laundry / utility', 'exterior']),
            selectQuestion('faucet_repair_configuration', 'Faucet configuration', true, ['single handle', 'two handle centerset', 'widespread', 'pull-down / sprayer', 'wall mount', 'unknown']),
            multiQuestion('faucet_symptoms', 'Observed symptoms', true, ['loose', 'dripping', 'low / clogged flow', 'sprayer hose leak', 'handle problem', 'cartridge issue', 'leak below fixture']),
            selectQuestion('faucet_parts_available', 'Compatible repair parts', false, ['confirmed available', 'special order', 'unknown', 'obsolete / replacement recommended']),
            selectQuestion('valve_body_condition', 'Valve body condition', false, ['not exposed', 'good condition', 'rough / rusted / pitted', 'replacement recommended']),
            selectQuestion('faucet_mineral_condition', 'Mineral condition', false, ['none observed', 'visible mineral buildup', 'hard water confirmed', 'unknown']),
            selectQuestion('fixture_pressure_condition', 'Water pressure finding', false, ['acceptable', 'high pressure', 'low pressure', 'regulator failed', 'unknown']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'water_main_repair',
        label: 'Water Main Repair / Spot Repair',
        workType: 'repair_service',
        serviceCategory: 'Water Service',
        scopeQuestionId: 'water_main_repair_scope',
        scopeQuestionLabel: 'What water-service repair are we performing?',
        scopePriceKeys: [
            'water_service_whole_home_water_leak_diagnostic',
            'water_service_whole_home_water_service_line_repair',
            'water_service_whole_home_water_main_spot_repair',
            'water_service_exterior_main_water_service_repair_linear_foot',
            'water_service_exterior_yard_leak_repair',
            'water_service_exterior_exterior_copper_repair',
            'water_service_exterior_exterior_pex_repair',
        ],
        requiredPhotoLabels: ['Leak / failure area and service route'],
        requiredMeasurementLabels: ['Repair length'],
        questions: [
            selectQuestion('water_main_repair_material', 'Existing pipe material', true, ['copper', 'PEX', 'PVC / approved plastic', 'galvanized', 'unknown']),
            selectQuestion('water_main_repair_access', 'Repair access', true, ['exposed', 'soil / landscape excavation', 'hardscape', 'under structure']),
            yesNoQuestion('water_main_located', 'Leak location is confirmed?', true),
        ],
    }),
    scopedEstimateTemplate({
        id: 'sewer_service_repair',
        label: 'Sewer / Drain Service & Repair',
        workType: 'repair_service',
        serviceCategory: 'Drains / Sewer',
        scopeQuestionId: 'sewer_service_scope',
        scopeQuestionLabel: 'What drain or sewer service are we performing?',
        scopePriceKeys: [
            'drain_sewer_whole_home_drain_cleaning',
            'drain_sewer_whole_home_main_line_cleanout',
            'drain_sewer_whole_home_sewer_camera_inspection',
            'drain_sewer_whole_home_hydro_jetting_placeholder',
            'drain_sewer_whole_home_sewer_line_repair_estimate',
            'drain_sewer_whole_home_sewer_spot_repair',
            'drain_sewer_whole_home_sewer_line_repair_linear_foot',
            'drain_sewer_exterior_yard_sewer_repair',
        ],
        requiredPhotoLabels: ['Drain / sewer access point', 'Observed failure area or camera finding'],
        questions: [
            selectQuestion('sewer_problem_type', 'Problem type', true, ['stoppage', 'roots', 'offset / break', 'belly / standing water', 'leak', 'preventive service', 'unknown']),
            selectQuestion('sewer_access_point', 'Available access', true, ['exterior cleanout', 'interior cleanout', 'roof vent', 'fixture access', 'excavation needed']),
            yesNoQuestion('sewer_camera_completed', 'Camera inspection completed or included?', true),
        ],
    }),
    scopedEstimateTemplate({
        id: 'gas_service_repair',
        label: 'Gas Leak Search / Repair',
        workType: 'repair_service',
        serviceCategory: 'Gas',
        scopeQuestionId: 'gas_service_scope',
        scopeQuestionLabel: 'What gas diagnostic or repair are we performing?',
        scopePriceKeys: [
            'gas_service_garage_mechanical_gas_leak_diagnostic',
            'gas_service_garage_mechanical_electronic_gas_leak_detection',
            'gas_service_garage_mechanical_gas_pressure_test',
            'gas_service_garage_mechanical_gas_line_spot_repair',
            'gas_service_garage_mechanical_gas_line_repair_linear_foot',
            'gas_service_garage_mechanical_gas_shutoff_replacement',
            'gas_service_garage_mechanical_gas_flex_connector_replacement',
            'gas_service_garage_mechanical_gas_line_cap_disconnect',
        ],
        requiredPhotoLabels: ['Gas piping / appliance connection and suspected area'],
        questions: [
            selectQuestion('gas_concern_location', 'Concern location', true, ['water heater', 'range', 'dryer', 'fireplace', 'exterior / BBQ', 'main / branch piping', 'unknown']),
            multiQuestion('gas_test_method', 'Required diagnostic method', true, ['electronic detector / sniffer', 'bubble test', 'pressure test', 'isolation test', 'utility finding review']),
            yesNoQuestion('gas_system_safe', 'System has been made safe for testing?', true),
        ],
        warnings: ['Gas work must stop and follow emergency or utility procedures whenever an unsafe condition is present.'],
    }),
    scopedEstimateTemplate({
        id: 'water_filtration_service',
        label: 'Water Filtration Maintenance / Repair',
        workType: 'repair_service',
        serviceCategory: 'Water Quality',
        scopeQuestionId: 'filtration_service_scope',
        scopeQuestionLabel: 'What filtration maintenance or repair are we performing?',
        scopePriceKeys: [
            'water_quality_garage_mechanical_whole_home_filter_service',
            'water_quality_garage_mechanical_whole_home_filter_cartridge_replacement',
            'water_quality_garage_mechanical_water_softener_service',
            'water_quality_garage_mechanical_water_softener_bypass_valve_replacement',
            'water_quality_garage_mechanical_water_softener_resin_tank_service',
            'water_quality_garage_mechanical_uv_light_service',
            'water_quality_garage_mechanical_uv_bulb_replacement',
            'water_quality_garage_mechanical_whole_home_ro_prefilter_replacement',
            'water_quality_kitchen_reverse_osmosis_service',
            'water_quality_kitchen_reverse_osmosis_filter_change',
            'water_quality_kitchen_ro_leak_repair',
            'water_quality_kitchen_under_sink_filter_service',
        ],
        requiredPhotoLabels: ['Treatment equipment and model label'],
        questions: [
            selectQuestion('filtration_service_system', 'System type', true, ['whole-home filter', 'softener', 'reverse osmosis', 'under-sink filter', 'UV treatment', 'conditioner', 'unknown']),
            multiQuestion('filtration_symptoms', 'Service need or symptoms', true, ['scheduled maintenance', 'filter / cartridge due', 'leak', 'low flow', 'hard water', 'taste / odor', 'error / control issue']),
            selectQuestion('filtration_parts', 'Replacement media or parts', false, ['onsite / confirmed', 'special order', 'customer supplied', 'unknown']),
            selectQuestion('filtration_system_condition', 'Overall equipment condition', false, ['serviceable', 'replacement recommended', 'obsolete / not repairable', 'unknown']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'plumbing_reroute',
        label: 'Pipe Reroute / Slab Leak Bypass',
        workType: 'repair_service',
        serviceCategory: 'Water Service',
        scopeQuestionId: 'reroute_scope',
        scopeQuestionLabel: 'What pipe reroute are we performing?',
        scopePriceKeys: [
            'water_service_whole_home_hot_line_reroute',
            'water_service_whole_home_cold_line_reroute',
            'water_service_whole_home_slab_leak_reroute',
            'water_service_whole_home_partial_repipe_by_fixture',
        ],
        requiredPhotoLabels: ['Failed line area', 'Proposed reroute path and access'],
        requiredMeasurementLabels: ['Approximate reroute length'],
        questions: [
            selectQuestion('reroute_line_type', 'Line being rerouted', true, ['hot branch', 'cold branch', 'slab leak bypass', 'single fixture branch', 'multiple fixtures']),
            selectQuestion('reroute_access', 'Proposed access', true, ['attic', 'crawlspace', 'wall / ceiling', 'exterior', 'combination']),
            selectQuestion('reroute_patching', 'Access and patching', true, ['included', 'excluded', 'separate allowance', 'not yet determined']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'leak_search_isolation',
        label: 'Leak Search & Isolation',
        workType: 'repair_service',
        serviceCategory: 'Diagnostics / Inspections',
        scopeQuestionId: 'leak_search_scope',
        scopeQuestionLabel: 'What leak-search or isolation work are we performing?',
        scopePriceKeys: [
            'diagnostics_inspections_whole_home_leak_detection',
            'diagnostics_inspections_whole_home_slab_leak_detection',
            'diagnostics_inspections_whole_home_acoustic_leak_detection',
            'diagnostics_inspections_whole_home_leak_isolation_testing',
            'diagnostics_inspections_whole_home_moisture_thermal_leak_search',
            'water_service_whole_home_pressure_test_water_system',
        ],
        requiredPhotoLabels: ['Reported leak area and accessible piping'],
        questions: [
            selectQuestion('leak_system', 'System being tested', true, ['domestic hot water', 'domestic cold water', 'drain / sewer', 'gas', 'irrigation / exterior', 'unknown']),
            multiQuestion('leak_indicators', 'Observed indicators', true, ['meter movement', 'sound', 'moisture / staining', 'pressure loss', 'odor', 'utility alert', 'intermittent symptom']),
            multiQuestion('leak_methods', 'Diagnostic methods planned', true, ['acoustic / sonic listening', 'fixture / branch isolation', 'pressure test', 'moisture meter', 'thermal imaging', 'electronic gas detector / sniffer', 'camera inspection']),
        ],
    }),
    scopedEstimateTemplate({
        id: 'irrigation_service_repair',
        label: 'Irrigation / Pool Fill Repair',
        workType: 'repair_service',
        serviceCategory: 'Valves / Shutoffs',
        scopeQuestionId: 'irrigation_repair_scope',
        scopeQuestionLabel: 'What exterior valve or water connection are we repairing?',
        scopePriceKeys: [
            'water_service_exterior_irrigation_valve_repair',
            'water_service_exterior_pool_autofill_valve_repair',
            'water_service_exterior_irrigation_tie_in_shutoff_replacement',
            'water_service_exterior_pressure_vacuum_breaker_replacement',
            'water_service_exterior_backflow_device_test_coordination',
            'water_service_exterior_exterior_water_line_repair',
        ],
        requiredPhotoLabels: ['Exterior valve / fill assembly and leak area'],
        questions: [
            selectQuestion('irrigation_repair_component', 'Component type', true, ['isolation valve', 'zone valve', 'pool auto-fill / float valve', 'backflow / vacuum breaker', 'supply piping', 'unknown']),
            multiQuestion('irrigation_symptoms', 'Observed symptoms', true, ['will not shut off', 'will not open', 'leaking', 'low flow', 'pool overfilling', 'pool not filling', 'damaged valve box']),
            yesNoQuestion('irrigation_scope_confirmed', 'Plumbing scope is separate from landscaping and controls?', true),
        ],
        warnings: ['Landscaping, controller programming, and full irrigation design must be separately configured when outside plumbing scope.'],
    }),
];

function scopedEstimateTemplate(input: {
    id: EstimateOptionCategory;
    label: string;
    workType: EstimateWorkType;
    serviceCategory: string;
    scopeQuestionId: string;
    scopeQuestionLabel: string;
    scopePriceKeys: string[];
    requiredPhotoLabels?: string[];
    requiredMeasurementLabels?: string[];
    productCategoryFilters?: string[];
    questions?: EstimateQuestionDefinition[];
    warnings?: string[];
    customScope?: NonNullable<EstimateQuestionDefinition['customAnswer']>;
    scopeQuestionAfter?: number;
}): EstimateCategoryTemplate {
    const scopeNames = catalogNamesForPriceKeys(input.scopePriceKeys);
    const actionLabel = input.workType === 'replacement' ? 'Replacement' : 'Repair / Service';
    const scopeQuestion: EstimateQuestionDefinition = {
        ...multiQuestion(
            input.scopeQuestionId,
            input.scopeQuestionLabel,
            true,
            input.customScope ? [...scopeNames, input.customScope.optionLabel] : scopeNames
        ),
        customAnswer: input.customScope,
    };
    const questions = [...(input.questions || [])];
    const scopeQuestionIndex = Math.max(0, Math.min(input.scopeQuestionAfter || 0, questions.length));

    questions.splice(scopeQuestionIndex, 0, scopeQuestion);

    return {
        id: input.id,
        label: input.label,
        workType: input.workType,
        serviceCategory: input.serviceCategory,
        requiredPhotoLabels: input.requiredPhotoLabels || [],
        requiredMeasurementLabels: input.requiredMeasurementLabels || [],
        productCategoryFilters: input.productCategoryFilters || [],
        pricingCategoryFilters: [input.serviceCategory],
        scopePriceKeys: input.scopePriceKeys,
        scopeQuestionId: input.scopeQuestionId,
        requiredScopeCodes: [],
        recommendedOptionStructures: [
            `Focused ${actionLabel}`,
            `Complete ${actionLabel}`,
            `${actionLabel} with Related Protection`,
            `Premium ${actionLabel} Package`,
        ],
        warnings: input.warnings || [],
        blockingConditions: ['The exact service scope and required site conditions must be selected before homeowner presentation.'],
        questions,
    };
}

function catalogNamesForPriceKeys(priceKeys: string[]) {
    const catalogByKey = new Map(plumbingPriceBookCatalogItems.map((item) => [item.price_key, item.name]));

    return priceKeys.map((priceKey) => catalogByKey.get(priceKey) || formatPriceKeyLabel(priceKey));
}

function formatPriceKeyLabel(priceKey: string) {
    return priceKey
        .split('_')
        .slice(3)
        .join(' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getEstimateCategoryTemplate(category: EstimateOptionCategory) {
    return estimateCategoryTemplates.find((template) => template.id === category) || estimateCategoryTemplates[0];
}

export const estimateWorkTypeOptions: Array<{
    id: EstimateWorkType;
    label: string;
    description: string;
}> = [
    {
        id: 'repair_service',
        label: 'Repair / Service',
        description: 'Diagnose, maintain, repair, reset, reroute, or replace a failed component without treating the whole job as equipment replacement.',
    },
    {
        id: 'replacement',
        label: 'Replacement / Installation',
        description: 'Replace complete equipment, fixtures, piping, treatment systems, or install a new approved component.',
    },
];

export function getEstimateCategoriesForWorkType(workType: EstimateWorkType) {
    return estimateCategoryTemplates.filter((template) => template.workType === workType);
}

export function getEstimateWorkTypeForCategory(category: EstimateOptionCategory) {
    return getEstimateCategoryTemplate(category).workType;
}

export function isEstimateCategoryForWorkType(category: EstimateOptionCategory, workType: EstimateWorkType) {
    return getEstimateWorkTypeForCategory(category) === workType;
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

    if (
        searchable.includes('water filtration') ||
        searchable.includes('water filter') ||
        searchable.includes('water quality') ||
        searchable.includes('water softener') ||
        searchable.includes('softener') ||
        searchable.includes('reverse osmosis') ||
        searchable.includes('whole-home filter') ||
        searchable.includes('whole home filter')
    ) return 'water_filtration_replacement';
    if (searchable.includes('water main') || searchable.includes('water service line') || searchable.includes('service main')) return 'water_main_replacement';
    if (searchable.includes('riser')) return 'riser_replacement';
    if (searchable.includes('sewer') || searchable.includes('drain line') || searchable.includes('waste line')) return 'sewer_line_replacement';
    if (searchable.includes('valve') || searchable.includes('angle stop') || searchable.includes('shutoff') || searchable.includes('backflow') || searchable.includes('pressure regulator')) return 'valve_replacement';
    if (searchable.includes('repipe') || searchable.includes('whole home') || searchable.includes('whole-home')) return 'whole_home_repipe';
    if (searchable.includes('water heater') || searchable.includes('tankless')) return 'water_heater';
    if (searchable.includes('garbage disposal') || searchable.includes('disposal')) return 'garbage_disposal';
    if (searchable.includes('toilet') || searchable.includes('bidet')) return 'toilet_replacement';
    if (searchable.includes('faucet') || searchable.includes('sink')) return 'faucet_replacement';

    return 'faucet_replacement';
}

export function inferEstimateCategoryForDraftItem(
    items: EstimateDraftItemLike[],
    preferredItemSlug?: string | null,
    context?: EstimateDraftContextLike | null
): EstimateOptionCategory {
    const preferredIdentity = normalizeText(preferredItemSlug || '');
    const preferredItem = preferredIdentity
        ? items.find((item) =>
            normalizeText(item.item_slug) === preferredIdentity ||
            normalizeText(item.id) === preferredIdentity
        )
        : null;

    if (!preferredItem) return inferEstimateCategoryFromDraft(items, context);

    const itemIdentity = `${preferredItem.name} ${preferredItem.item_slug}`.toLowerCase();
    if (
        itemIdentity.includes('water filtration') ||
        itemIdentity.includes('water filter') ||
        itemIdentity.includes('water softener') ||
        itemIdentity.includes('reverse osmosis')
    ) return 'water_filtration_replacement';
    if (itemIdentity.includes('water main') || itemIdentity.includes('water service line') || itemIdentity.includes('service main')) return 'water_main_replacement';
    if (itemIdentity.includes('riser')) return 'riser_replacement';
    if (itemIdentity.includes('sewer') || itemIdentity.includes('drain line') || itemIdentity.includes('waste line')) return 'sewer_line_replacement';
    if (itemIdentity.includes('valve') || itemIdentity.includes('angle stop') || itemIdentity.includes('shutoff') || itemIdentity.includes('backflow') || itemIdentity.includes('pressure regulator')) return 'valve_replacement';
    if (itemIdentity.includes('repipe') || itemIdentity.includes('whole home') || itemIdentity.includes('whole-home')) {
        return 'whole_home_repipe';
    }
    if (itemIdentity.includes('water heater') || itemIdentity.includes('tankless')) return 'water_heater';
    if (itemIdentity.includes('garbage disposal') || itemIdentity.includes('disposal')) return 'garbage_disposal';
    if (itemIdentity.includes('toilet') || itemIdentity.includes('bidet')) return 'toilet_replacement';
    if (itemIdentity.includes('faucet') || itemIdentity.includes('sink')) return 'faucet_replacement';

    return inferEstimateCategoryFromDraft([preferredItem], null);
}

export function validateEstimateAnswers(template: EstimateCategoryTemplate, answers: EstimateAnswerSet): EstimateAnswerValidation {
    const missingRequiredQuestions = template.questions
        .filter((question) => question.required && !isAnswerComplete(answers[question.id]));
    const missingCustomAnswers = template.questions
        .filter((question) =>
            question.customAnswer &&
            isQuestionOptionSelected(answers[question.id], question.customAnswer.optionLabel) &&
            !isAnswerComplete(answers[question.customAnswer.answerId])
        )
        .map((question) => question.customAnswer!);
    const missingRequiredQuestionIds = [
        ...missingRequiredQuestions.map((question) => question.id),
        ...missingCustomAnswers.map((customAnswer) => customAnswer.answerId),
    ];
    const missingRequiredQuestionLabels = [
        ...missingRequiredQuestions.map((question) => question.label),
        ...missingCustomAnswers.map((customAnswer) => customAnswer.label),
    ];

    const missingRequiredPhotoLabels = template.requiredPhotoLabels.filter((label) => {
        const answer = answers[photoRequirementAnswerKey(label)];
        return !isPhotoRequirementComplete(answer) && !isRequirementSkipAnswer(answer);
    });
    const missingRequiredMeasurementLabels = template.requiredMeasurementLabels.filter((label) => {
        const answer = answers[measurementRequirementAnswerKey(label)];
        return !isMeasurementRequirementComplete(answer) && !isRequirementSkipAnswer(answer);
    });
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
        priceAdjustmentPercentage: choice.priceAdjustmentPercentage || 0,
        priceAdjustmentLabel: choice.priceAdjustmentLabel || null,
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
    const eligiblePriceBookEntries = selectEligiblePriceBookEntries(priceBookEntries, input.companyId, template, input.answers);
    const priceBookEntriesUnavailable = eligiblePriceBookEntries.length === 0;
    const pricingResults = priceBookEntriesUnavailable
        ? []
        : buildPricingResults(input.companyId, eligiblePriceBookEntries, template, input.category, input.answers);
    const pricingSetupRequired = priceBookEntriesUnavailable || pricingResults.length === 0;
    const choices = buildDeterministicChoices({
        category: input.category,
        template,
        pricingResults,
        products: approvedProducts,
        draftContext: input.draftContext,
    });
    const individualOptions = choices.filter((choice) => choice.kind === 'individual');
    const packages = choices.filter((choice) => choice.kind === 'package');
    const draftGate = buildDraftGate({
        answerValidation,
        template,
        answers: input.answers,
        choices,
        draftItems: input.draftItems,
        draftContext: input.draftContext,
        pricingSetupRequired,
    });
    const presentationGate = buildPresentationGate({
        answerValidation,
        pricingResults,
        choices,
        technicianApproved: input.technicianApproved,
        aiValidationFailed: input.aiValidationFailed || false,
        pricingSetupRequired,
        approvedProducts,
        minimumIndividualChoiceCount: 1,
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
        draftGate,
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

    if (individualCount < 1 || individualCount > 4) {
        errors.push('AI response must include 1 to 4 individual options.');
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

function buildPricingResults(
    companyId: string,
    entries: EstimatePriceBookEntry[],
    template: EstimateCategoryTemplate,
    category: EstimateOptionCategory,
    answers: EstimateAnswerSet
) {
    if (hasSelectedCustomScope(template, answers)) return [];

    if (category === 'faucet_replacement') {
        return buildFaucetPricingResults(companyId, entries, answers);
    }

    if (category === 'valve_replacement') {
        const tubSpoutEntries = entries.filter((entry) =>
            normalizeText(entry.code).includes('tub spout replacement') ||
            normalizeText(entry.name).includes('tub spout replacement')
        );
        const valveEntries = entries.filter((entry) => !tubSpoutEntries.includes(entry));

        return valveEntries.slice(0, 4).map((entry, index) =>
            calculateEstimateOptionPrice({
                id: `valve-pricing-${index + 1}`,
                companyId,
                priceBookEntries: entries,
                lineInputs: [entry, ...tubSpoutEntries].map((lineEntry, lineIndex) => ({
                    priceBookEntryId: lineEntry.id,
                    quantity: 1,
                    source: lineIndex === 0 ? 'base_installation' as const : 'modifier' as const,
                    required: true,
                    removable: false,
                })),
                priceBookVersion: createPriceBookVersion(entries),
            })
        );
    }

    if (category === 'water_heater') {
        return buildWaterHeaterPricingResults(companyId, entries, answers);
    }

    if (template.scopeQuestionId) {
        return buildConfirmedScopePricingResults(companyId, entries, template, answers);
    }

    return buildIndependentPricingResults(companyId, entries, template);
}

function buildIndependentPricingResults(
    companyId: string,
    entries: EstimatePriceBookEntry[],
    template: EstimateCategoryTemplate
) {
    return entries.slice(0, 4).map((entry, index) =>
        calculateEstimateOptionPrice({
            id: `pricing-${index + 1}`,
            companyId,
            priceBookEntries: entries,
            lineInputs: [{
                priceBookEntryId: entry.id,
                quantity: 1,
                source: 'base_installation',
                required: true,
                removable: false,
            }],
            priceBookVersion: createPriceBookVersion(entries),
            requiredScopeCodes: template.requiredScopeCodes,
        })
    );
}

function buildConfirmedScopePricingResults(
    companyId: string,
    entries: EstimatePriceBookEntry[],
    template: EstimateCategoryTemplate,
    answers: EstimateAnswerSet
) {
    const selectedScopeKeys = getSelectedScopePriceKeys(template, answers);
    const catalogByKey = new Map(plumbingPriceBookCatalogItems.map((item) => [item.price_key, normalizeText(item.name)]));
    const selectedEntries = selectedScopeKeys
        .map((priceKey) => entries.find((entry) =>
            normalizeText(entry.code) === normalizeText(priceKey) ||
            normalizeText(entry.name) === (catalogByKey.get(priceKey) || normalizeText(formatPriceKeyLabel(priceKey)))
        ))
        .filter((entry): entry is EstimatePriceBookEntry => Boolean(entry));

    if (selectedEntries.length === 0 || selectedEntries.length !== selectedScopeKeys.length) return [];

    return [calculateEstimateOptionPrice({
        id: 'pricing-confirmed-scope',
        companyId,
        priceBookEntries: entries,
        lineInputs: selectedEntries.map((entry, index) => ({
            priceBookEntryId: entry.id,
            quantity: 1,
            source: index === 0 ? 'base_installation' : 'modifier',
            required: true,
            removable: false,
        })),
        priceBookVersion: createPriceBookVersion(entries),
        requiredScopeCodes: template.requiredScopeCodes,
    })];
}

function buildWaterHeaterPricingResults(
    companyId: string,
    entries: EstimatePriceBookEntry[],
    answers: EstimateAnswerSet
) {
    const selectedEquipment = normalizeText(readAnswerText(answers.tank_or_tankless));

    if (!selectedEquipment) return [];

    const standardTankKey = 'water_service_garage_mechanical_standard_tank_water_heater_replacement';
    const tanklessKey = 'water_service_garage_mechanical_tankless_water_heater_replacement';
    const selectedBaseKey = selectedEquipment.includes('tankless') ? tanklessKey : standardTankKey;
    const selectedPriceKeys = new Set([selectedBaseKey]);
    const codeCorrections = Array.isArray(answers.code_corrections)
        ? answers.code_corrections.map(normalizeText)
        : [];
    const expansionTankAnswer = normalizeText(readAnswerText(answers.expansion_tank));
    const drainPanAnswer = normalizeText(readAnswerText(answers.drain_pan_route));
    const platformAnswer = normalizeText(readAnswerText(answers.platform));
    const gasValveAnswer = normalizeText(readAnswerText(answers.gas_valve_line));
    const fuelType = normalizeText(readAnswerText(answers.fuel_type));
    const usesGas = fuelType === 'gas' || fuelType === 'propane';

    if (
        expansionTankAnswer === 'replace' ||
        expansionTankAnswer === 'add' ||
        codeCorrections.includes('expansion tank')
    ) {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_expansion_tank_installation');
    }

    if (drainPanAnswer === 'add pan' || codeCorrections.includes('pan')) {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_pan_installation');
    }

    if (drainPanAnswer === 'add drain route') {
        selectedPriceKeys.add('drain_sewer_garage_mechanical_water_heater_drain_pan_line_installation');
    }

    if (platformAnswer === 'replace / build') {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_stand_installation');
    }

    if (codeCorrections.includes('straps')) {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_seismic_strap_installation');
    }

    if (codeCorrections.includes('t&p')) {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_tp_valve_replacement');
    }

    if (codeCorrections.includes('permit') || codeCorrections.includes('venting')) {
        selectedPriceKeys.add('water_service_garage_mechanical_water_heater_permit_code_correction');
    }

    if (usesGas && gasValveAnswer === 'replace recommended') {
        selectedPriceKeys.add('gas_service_garage_mechanical_gas_shutoff_replacement');
    }

    if (usesGas && codeCorrections.includes('gas connector')) {
        selectedPriceKeys.add('gas_service_garage_mechanical_gas_flex_connector_replacement');
    }

    if (usesGas && codeCorrections.includes('sediment trap')) {
        selectedPriceKeys.add('gas_service_garage_mechanical_gas_sediment_trap_installation');
    }

    const selectedEntries = [...selectedPriceKeys]
        .map((priceKey) => entries.find((entry) => normalizeText(entry.code) === normalizeText(priceKey)))
        .filter((entry): entry is EstimatePriceBookEntry => Boolean(entry));

    if (
        selectedEntries.length !== selectedPriceKeys.size ||
        normalizeText(selectedEntries[0]?.code || '') !== normalizeText(selectedBaseKey)
    ) return [];

    return [calculateEstimateOptionPrice({
        id: 'water-heater-confirmed-scope',
        companyId,
        priceBookEntries: entries,
        lineInputs: selectedEntries.map((entry, index) => ({
            priceBookEntryId: entry.id,
            quantity: 1,
            source: index === 0 ? 'base_installation' : 'modifier',
            required: true,
            removable: false,
        })),
        priceBookVersion: createPriceBookVersion(entries),
    })];
}

function buildFaucetPricingResults(
    companyId: string,
    entries: EstimatePriceBookEntry[],
    answers: EstimateAnswerSet
) {
    return selectCompatibleFaucetEntries(entries, answers).map((entry, index) =>
        calculateEstimateOptionPrice({
            id: `faucet-pricing-${index + 1}`,
            companyId,
            priceBookEntries: entries,
            lineInputs: [{
                priceBookEntryId: entry.id,
                quantity: 1,
                source: 'base_installation',
                required: true,
                removable: false,
            }],
            priceBookVersion: createPriceBookVersion(entries),
        })
    );
}

function selectCompatibleFaucetEntries(entries: EstimatePriceBookEntry[], answers: EstimateAnswerSet) {
    const fixtureSource = normalizeText(readAnswerText(answers.customer_supplied));
    const holeSpreadAnswer = normalizeText(readAnswerText(answers.hole_spread));
    const holeSpreadMeasurement = answers[measurementRequirementAnswerKey('Hole spread')];
    const holeSpreadValue = isMeasurementRequirementAnswer(holeSpreadMeasurement)
        ? holeSpreadMeasurement.value
        : null;
    const sourceNeedsCompanyApproved = fixtureSource === 'company approved product';
    const sourceAllowsExistingOrSupplied = fixtureSource === 'customer supplied' ||
        fixtureSource === 'company approved product' ||
        fixtureSource === 'needs product approval';
    const approvedProductFitKnown = sourceNeedsCompanyApproved &&
        holeSpreadValue !== null &&
        !['unknown', 'wall mount'].includes(holeSpreadAnswer);
    const compatibleKeys = new Set<string>();

    if (sourceAllowsExistingOrSupplied) compatibleKeys.add(normalizeText(FAUCET_REINSTALL_EXISTING_PRICE_KEY));
    if (approvedProductFitKnown) compatibleKeys.add(normalizeText(FAUCET_INSTALL_COMPANY_APPROVED_PRICE_KEY));

    return entries.filter((entry) => {
        const normalizedCode = normalizeText(entry.code);
        const isLegacyScopedEntry = normalizedCode === normalizeText(FAUCET_REINSTALL_EXISTING_PRICE_KEY) ||
            normalizedCode === normalizeText(FAUCET_INSTALL_COMPANY_APPROVED_PRICE_KEY);
        const sourceCompatible = isLegacyScopedEntry
            ? compatibleKeys.has(normalizedCode)
            : sourceNeedsCompanyApproved;

        return sourceCompatible && faucetEntrySupportsSelectedHoleSpread(entry, holeSpreadAnswer);
    });
}

function faucetEntrySupportsSelectedHoleSpread(entry: EstimatePriceBookEntry, holeSpreadAnswer: string) {
    if (!holeSpreadAnswer) return true;

    const supportedApplications = entry.applicableCategories.map(normalizeText);

    if (supportedApplications.length === 0) return true;
    if (supportedApplications.includes('faucet replacement')) return true;

    return supportedApplications.some((application) => application.includes(holeSpreadAnswer));
}

function buildDeterministicChoices(input: {
    category: EstimateOptionCategory;
    template: EstimateCategoryTemplate;
    pricingResults: EstimatePricingResult[];
    products: EstimateApprovedProduct[];
    draftContext: EstimateDraftContextLike | null;
}) {
    const validPricingResults = input.pricingResults.filter((result) => result.missingPricingInputs.length === 0);

    if (input.category === 'valve_replacement') {
        return buildValveDeterministicChoices(validPricingResults, input.draftContext);
    }

    const prebuiltChoices = input.category === 'faucet_replacement'
        ? buildFaucetDeterministicChoices(validPricingResults, input.products)
        : [];
    const prebuiltPricingIds = new Set(prebuiltChoices.map((choice) => choice.pricingResult.id));
    const individualResults = validPricingResults
        .filter((result) => !prebuiltPricingIds.has(result.id))
        .slice(0, Math.max(0, 4 - prebuiltChoices.length));
    const homeownerName = preferredHomeownerFirstName(input.draftContext);
    const choices: EstimateChoice[] = [
        ...prebuiltChoices,
        ...individualResults.map<EstimateChoice>((pricingResult, index) => {
        const lineNames = pricingResult.lineItems.map((line) => line.name);
        const structureName = lineNames.length === 1
            ? lineNames[0]
            : `${input.template.label} — Confirmed Scope`;
        const title = homeownerName
            ? `${homeownerName}'s ${structureName}`
            : structureName;

        return {
            id: `individual-${prebuiltChoices.length + index + 1}`,
            kind: 'individual',
            title,
            shortSummary: lineNames.slice(0, 2).join(' + ') || input.template.label,
            homeownerExplanation: buildHomeownerExplanation(input.template.label, lineNames),
            keyBenefits: buildKeyBenefits(input.category, index),
            whyItDiffers: lineNames.length === 1
                ? 'This is an independent approved price-book choice and is not combined with unrelated service lines.'
                : 'Includes only the base work and add-ons explicitly confirmed in the estimate checklist.',
            recommendedReason: validPricingResults.length === 1
                ? 'Matches the service scope confirmed in the estimate checklist.'
                : null,
            productIds: input.products.slice(index, index + 1).map((product) => product.id),
            scopeIds: pricingResult.lineItems.map((line) => line.priceBookEntryId),
            warrantyIds: pricingResult.priceBookSnapshot
                .map((snapshot) => snapshot.priceBookEntryId)
                .filter((id) => id.toLowerCase().includes('warranty')),
            inclusionIds: pricingResult.lineItems.map((line) => line.code),
            exclusionIds: [],
            pricingResult,
            recommended: validPricingResults.length === 1,
            displayOrder: prebuiltChoices.length + index + 1,
        };
        }),
    ];

    return choices.slice(0, 4);
}

function buildValveDeterministicChoices(
    pricingResults: EstimatePricingResult[],
    draftContext: EstimateDraftContextLike | null
) {
    const homeownerName = preferredHomeownerFirstName(draftContext);

    return pricingResults.slice(0, 4).map((pricingResult, index): EstimateChoice => {
        const primaryLine = pricingResult.lineItems[0];
        const lineNames = pricingResult.lineItems.map((line) => line.name);
        const scopeName = valveScopeChoiceName(primaryLine?.name || 'Valve Replacement');
        const title = homeownerName ? `${homeownerName}'s ${scopeName}` : scopeName;

        return {
            id: `individual-valve-${index + 1}`,
            kind: 'individual',
            title,
            shortSummary: lineNames.join(' + ') || scopeName,
            homeownerExplanation: `Replace the documented ${valveScopeDescription(primaryLine?.name || scopeName)}, reconnect the existing compatible piping, complete only the selected related items, and test operation.`,
            keyBenefits: ['Matches the documented valve', 'Only selected related work included', 'Operation tested after replacement'],
            whyItDiffers: 'This choice follows the selected valve type and shower or tub configuration without stacking unrelated fixtures.',
            recommendedReason: index === 0 ? 'Matches the documented service scope.' : null,
            productIds: [],
            scopeIds: pricingResult.lineItems.map((line) => line.priceBookEntryId),
            warrantyIds: [],
            inclusionIds: pricingResult.lineItems.map((line) => line.code),
            exclusionIds: ['unselected-valves', 'unrelated-fixtures'],
            pricingResult,
            recommended: index === 0,
            displayOrder: index + 1,
        };
    });
}

function valveScopeChoiceName(value: string) {
    const normalized = normalizeText(value);

    if (normalized.includes('tub shower valve')) return 'Tub and Shower Valve Replacement';
    if (normalized.includes('shower valve')) return 'Like-for-Like Shower Valve Replacement';
    if (normalized.includes('main water shutoff')) return 'Main Water Shutoff Replacement';
    if (normalized.includes('angle stop')) return 'Angle Stop Replacement';
    if (normalized.includes('pressure regulator') || normalized.includes('prv')) return 'Pressure Regulator Replacement';
    if (normalized.includes('backflow')) return 'Backflow Assembly Replacement';
    if (normalized.includes('hose bib')) return 'Hose Bibb Replacement';

    return value;
}

function valveScopeDescription(value: string) {
    return valveScopeChoiceName(value).replace(/\breplacement\b/i, '').trim().toLowerCase();
}

function buildFaucetDeterministicChoices(
    pricingResults: EstimatePricingResult[],
    products: EstimateApprovedProduct[]
) {
    const choices: EstimateChoice[] = [];

    pricingResults.forEach((pricingResult) => {
        const primaryLine = pricingResult.lineItems[0];
        const code = normalizeText(primaryLine?.code || '');

        if (code === normalizeText(FAUCET_REINSTALL_EXISTING_PRICE_KEY)) {
            choices.push({
                id: 'individual-faucet-reinstall-existing',
                kind: 'individual',
                title: 'Reinstall Existing Faucet',
                shortSummary: 'Remove, clean, reseat, secure, reconnect, and test the existing or homeowner-supplied faucet.',
                homeownerExplanation: 'This option keeps the existing or homeowner-supplied faucet and covers removing it as needed, cleaning the mounting area, reseating and securing it, reconnecting usable supply and drain components, minor reconnect materials, and testing operation. Fixture warranty is not included for existing or homeowner-supplied fixtures.',
                keyBenefits: ['Keeps existing fixture', 'Labor and minor reconnect materials included', 'Operation tested before completion'],
                whyItDiffers: 'Uses the existing or homeowner-supplied faucet instead of installing a company-approved replacement.',
                recommendedReason: null,
                productIds: [],
                scopeIds: pricingResult.lineItems.map((line) => line.priceBookEntryId),
                warrantyIds: [],
                inclusionIds: pricingResult.lineItems.map((line) => line.code),
                exclusionIds: ['fixture-warranty'],
                pricingResult,
                recommended: false,
                displayOrder: 1,
            });
        }

        if (code === normalizeText(FAUCET_INSTALL_COMPANY_APPROVED_PRICE_KEY)) {
            choices.push({
                id: 'individual-faucet-company-approved',
                kind: 'individual',
                title: 'Install Company-Approved Faucet',
                shortSummary: 'Remove the existing faucet, install an approved replacement with a $200 faucet allowance, reconnect applicable components, and test operation.',
                homeownerExplanation: 'This option removes the existing faucet and installs a company-approved replacement that matches the captured sink layout. It includes reconnecting applicable supply and drain components, testing operation, a configurable $200 faucet allowance, workmanship warranty, and manufacturer warranty where applicable. Approved faucet cost above the allowance must be added through deterministic pricing.',
                keyBenefits: ['Company-approved replacement', '$200 faucet allowance included', 'Workmanship plus applicable manufacturer warranty'],
                whyItDiffers: 'Includes a company-approved replacement fixture instead of reusing the existing or homeowner-supplied faucet.',
                recommendedReason: 'Best fit when the homeowner wants a reviewed replacement path with deterministic company pricing.',
                productIds: products.slice(0, 1).map((product) => product.id),
                scopeIds: pricingResult.lineItems.map((line) => line.priceBookEntryId),
                warrantyIds: [],
                inclusionIds: pricingResult.lineItems.map((line) => line.code),
                exclusionIds: ['manufacturer-claims-not-configured'],
                pricingResult,
                recommended: true,
                displayOrder: 2,
            });
        }
    });

    return choices.sort((first, second) => first.displayOrder - second.displayOrder);
}

function buildDraftGate(input: {
    answerValidation: EstimateAnswerValidation;
    template: EstimateCategoryTemplate;
    answers: EstimateAnswerSet;
    choices: EstimateChoice[];
    draftItems: EstimateDraftItemLike[];
    draftContext: EstimateDraftContextLike | null;
    pricingSetupRequired: boolean;
}): EstimateDraftGate {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const safeDraftChoices = input.choices.filter((choice) =>
        choice.pricingResult.totalAmount > 0 &&
        choice.pricingResult.missingPricingInputs.length === 0
    );
    const hasWorkDescription = Boolean(
        readText(input.draftContext?.issue_summary) ||
        input.draftItems.some((item) => readText(item.name))
    );
    const skippedForNow = collectSkippedRequirementLabels(input.template, input.answers);
    const missingBeforeFinalPresentation = collectMissingBeforeFinalPresentation(input.answerValidation);
    const assumptionsUsedInDraft = collectDraftAssumptions(input.template, input.answers, input.answerValidation);

    if (!hasWorkDescription) {
        blockers.push('Add a short problem or work description before drafting.');
    }

    if (input.pricingSetupRequired || safeDraftChoices.length === 0) {
        blockers.push('Add deterministic price-book data for at least one safe draft path.');
    }

    if (input.answerValidation.missingRequiredQuestionLabels.length > 0) {
        warnings.push(`Questions can be completed later: ${input.answerValidation.missingRequiredQuestionLabels.join(', ')}.`);
    }

    if (input.answerValidation.missingRequiredPhotoLabels.length > 0) {
        warnings.push(`Photos can be completed before presentation: ${input.answerValidation.missingRequiredPhotoLabels.join(', ')}.`);
    }

    if (input.answerValidation.missingRequiredMeasurementLabels.length > 0) {
        warnings.push(`Measurements can be completed before presentation: ${input.answerValidation.missingRequiredMeasurementLabels.join(', ')}.`);
    }

    if (skippedForNow.length > 0) {
        warnings.push(`Skipped for now: ${skippedForNow.join(', ')}.`);
    }

    return {
        canDraft: blockers.length === 0,
        blockers,
        warnings,
        missingBeforeFinalPresentation,
        skippedForNow,
        assumptionsUsedInDraft,
    };
}

function buildPresentationGate(input: {
    answerValidation: EstimateAnswerValidation;
    pricingResults: EstimatePricingResult[];
    choices: EstimateChoice[];
    technicianApproved: boolean;
    aiValidationFailed: boolean;
    pricingSetupRequired: boolean;
    approvedProducts: EstimateApprovedProduct[];
    minimumIndividualChoiceCount: number;
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
    const hasEnoughIndividualChoices = individualChoiceCount >= input.minimumIndividualChoiceCount;

    if (!hasEnoughIndividualChoices) {
        blockers.push(input.minimumIndividualChoiceCount === 1
            ? 'At least one approved priced option is required.'
            : 'At least two materially different individual options are required.');
    }
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

const replacementOnlyEstimateCategories = new Set<EstimateOptionCategory>([
    'valve_replacement',
    'riser_replacement',
    'water_main_replacement',
    'sewer_line_replacement',
]);

function selectEligiblePriceBookEntries(
    entries: EstimatePriceBookEntry[],
    companyId: string,
    template: EstimateCategoryTemplate,
    answers: EstimateAnswerSet
) {
    const allowedScopeKeys = getSelectedScopePriceKeys(template, answers);
    const allowedScopeNames = catalogNamesForPriceKeys(allowedScopeKeys).map(normalizeText);

    return sortPriceEntries(entries.filter((entry) =>
        entry.companyId === companyId &&
        entry.active &&
        entry.recommendedSellingPrice !== null &&
        (
            allowedScopeKeys.some((priceKey) => normalizeText(priceKey) === normalizeText(entry.code)) ||
            allowedScopeNames.some((scopeName) => scopeName === normalizeText(entry.name))
        )
    ));
}

function getSelectedScopePriceKeys(template: EstimateCategoryTemplate, answers: EstimateAnswerSet) {
    if (template.id === 'valve_replacement' && readAnswerText(answers.valve_type)) {
        return getSelectedValveScopePriceKeys(template.scopePriceKeys, answers);
    }

    if (!template.scopeQuestionId) return template.scopePriceKeys;

    const selectedScopes = answers[template.scopeQuestionId];
    const selectedNames = Array.isArray(selectedScopes)
        ? selectedScopes.map(normalizeText)
        : typeof selectedScopes === 'string'
            ? [normalizeText(selectedScopes)]
            : [];

    if (selectedNames.length === 0) return [];

    const catalogByKey = new Map(plumbingPriceBookCatalogItems.map((item) => [item.price_key, normalizeText(item.name)]));

    return template.scopePriceKeys.filter((priceKey) =>
        selectedNames.includes(catalogByKey.get(priceKey) || normalizeText(formatPriceKeyLabel(priceKey)))
    );
}

function getSelectedValveScopePriceKeys(scopePriceKeys: string[], answers: EstimateAnswerSet) {
    const valveType = normalizeText(readAnswerText(answers.valve_type));
    const fixtureSetup = normalizeText(readAnswerText(answers.shower_configuration));
    const tubSpoutScope = normalizeText(readAnswerText(answers.tub_spout_scope));

    if (valveType === 'shower valve') {
        const isTubConfiguration = fixtureSetup === 'tub and shower combination' || fixtureSetup === 'tub only';
        const selected = [isTubConfiguration
            ? 'water_service_bathroom_tub_shower_valve_replacement'
            : 'water_service_bathroom_shower_valve_replacement'];

        if (isTubConfiguration && tubSpoutScope === 'replace tub spout') {
            selected.push('water_service_bathroom_tub_spout_replacement');
        }

        return selected.filter((priceKey) => scopePriceKeys.includes(priceKey));
    }

    const matchingFragments: Record<string, string[]> = {
        'main water shutoff': ['main_water_shutoff'],
        'angle stop': ['angle_stop', 'sink_shutoff', 'toilet_shutoff'],
        'pressure regulator': ['pressure_regulator', 'prv_'],
        'backflow assembly': ['backflow_device'],
        'hose bibb valve': ['hose_bib'],
    };
    const fragments = matchingFragments[valveType] || [];

    return scopePriceKeys.filter((priceKey) => fragments.some((fragment) => priceKey.includes(fragment)));
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
    const baseBenefits: Partial<Record<EstimateOptionCategory, string[]>> = {
        toilet_replacement: ['Correct fit confirmed', 'Approved scope only', 'Leak and flush check included'],
        water_heater: ['Safety checklist reviewed', 'Approved hot water scope', 'Warranty path visible'],
        garbage_disposal: ['Power and drain fit checked', 'Approved model path', 'Leak and operation check included'],
        faucet_replacement: ['Sink fit confirmed', 'Shutoffs reviewed', 'Approved fixture path'],
        valve_replacement: ['Correct valve and service confirmed', 'Isolation and access reviewed', 'Restoration scope visible'],
        riser_replacement: ['Served areas documented', 'Routing and outage reviewed', 'Restoration scope visible'],
        water_main_replacement: ['Route and installation method reviewed', 'Utility coordination visible', 'Restoration responsibility documented'],
        sewer_line_replacement: ['Failure and routing documented', 'Access method reviewed', 'Cleanout and restoration scope visible'],
        water_filtration_replacement: ['Water goals documented', 'Equipment stages sized', 'Maintenance path visible'],
        whole_home_repipe: ['Fixture point count audited', 'Access factors visible', 'Scope totals remain editable'],
    };
    const benefits = baseBenefits[category] || [
        'Selected field scope documented',
        'Company price-book work only',
        'Required testing and site conditions visible',
    ];

    return benefits.slice(0, Math.min(3, 1 + index));
}

function preferredHomeownerFirstName(context: EstimateDraftContextLike | null) {
    const name = String(context?.customer_home_name || '').trim();

    if (!name || /^client homeos/i.test(name)) return '';

    return name.split(/\s+/)[0] || '';
}

function readAnswerText(value: EstimateAnswerValue | undefined) {
    return typeof value === 'string' ? value : '';
}

function isQuestionOptionSelected(value: EstimateAnswerValue | undefined, optionLabel: string) {
    if (Array.isArray(value)) return value.includes(optionLabel);

    return value === optionLabel;
}

function hasSelectedCustomScope(template: EstimateCategoryTemplate, answers: EstimateAnswerSet) {
    return template.questions.some((question) =>
        question.customAnswer &&
        isQuestionOptionSelected(answers[question.id], question.customAnswer.optionLabel)
    );
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

export function toggleEstimateMultiSelectAnswer(
    question: Pick<EstimateQuestionDefinition, 'id' | 'type'>,
    currentValue: EstimateAnswerValue | undefined,
    selectedValue: string
) {
    if (question.type !== 'multi_select') return [selectedValue];

    const currentValues = Array.isArray(currentValue) ? currentValue.filter((value) => typeof value === 'string') : [];
    const selectedIsNone = isNoneRequiredAnswer(selectedValue);

    if (selectedIsNone) {
        return currentValues.some(isNoneRequiredAnswer) ? [] : [selectedValue];
    }

    const withoutNone = currentValues.filter((value) => !isNoneRequiredAnswer(value));

    return withoutNone.includes(selectedValue)
        ? withoutNone.filter((entry) => entry !== selectedValue)
        : [...withoutNone, selectedValue];
}

export function createEstimateRequirementSkipAnswer(
    label: string,
    reason: EstimateRequirementSkipReason | null = null,
    skippedAt = new Date().toISOString()
): EstimateRequirementSkipAnswer {
    return {
        kind: 'requirement_skip',
        requirementId: estimateRequirementId(label),
        state: 'skipped',
        reason,
        skippedAt,
    };
}

export function photoRequirementAnswerKey(label: string) {
    return `photo:${label}`;
}

export function measurementRequirementAnswerKey(label: string) {
    return `measurement:${label}`;
}

export function getMeasurementRequirementPrompt(label: string) {
    const requirementId = estimateRequirementId(label);

    if (requirementId.includes('home-size')) return 'Approximate home size (square feet)';

    return label;
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

export function isRequirementSkipAnswer(value: EstimateAnswerValue | undefined): value is EstimateRequirementSkipAnswer {
    const record = readRecord(value);
    const reason = readNullableText(record?.reason);

    return record?.kind === 'requirement_skip' &&
        record.state === 'skipped' &&
        readText(record.requirementId).length > 0 &&
        (!reason || isEstimateRequirementSkipReason(reason)) &&
        readText(record.skippedAt).length > 0;
}

export function getEstimateRequirementState(
    value: EstimateAnswerValue | undefined,
    complete: boolean
): EstimateRequirementState {
    if (complete) return 'completed';
    if (isRequirementSkipAnswer(value)) return 'skipped';

    return 'missing';
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

function collectMissingBeforeFinalPresentation(validation: EstimateAnswerValidation) {
    return [
        ...validation.missingRequiredQuestionLabels.map((label) => `Question: ${label}`),
        ...validation.missingRequiredPhotoLabels.map((label) => `Photo: ${label}`),
        ...validation.missingRequiredMeasurementLabels.map((label) => `Measurement: ${label}`),
    ];
}

function collectSkippedRequirementLabels(template: EstimateCategoryTemplate, answers: EstimateAnswerSet) {
    return [
        ...template.requiredPhotoLabels
            .filter((label) => isRequirementSkipAnswer(answers[photoRequirementAnswerKey(label)]))
            .map((label) => `Photo: ${label}`),
        ...template.requiredMeasurementLabels
            .filter((label) => isRequirementSkipAnswer(answers[measurementRequirementAnswerKey(label)]))
            .map((label) => `Measurement: ${label}`),
    ];
}

function collectDraftAssumptions(
    template: EstimateCategoryTemplate,
    answers: EstimateAnswerSet,
    validation: EstimateAnswerValidation
) {
    const assumptions = [...template.warnings];

    if (validation.missingRequiredPhotoLabels.length > 0) {
        assumptions.push('Draft uses available site context until required photos are completed.');
    }

    if (validation.missingRequiredMeasurementLabels.length > 0) {
        assumptions.push('Draft uses company defaults until required measurements are captured.');
    }

    if (!isAnswerComplete(answers.desired_warranty) || readAnswerText(answers.desired_warranty) === 'Not discussed yet') {
        assumptions.push('Warranty copy uses company defaults until the homeowner chooses a warranty path.');
    }

    if (!isAnswerComplete(answers.homeowner_priorities)) {
        assumptions.push('Homeowner priorities are not selected yet, so option copy stays neutral.');
    }

    return uniqueText(assumptions).filter(Boolean);
}

function isNoneRequiredAnswer(value: string) {
    return normalizeText(value) === 'none required';
}

function isEstimateRequirementSkipReason(value: string): value is EstimateRequirementSkipReason {
    return [
        'inaccessible',
        'unsafe to capture',
        'label unreadable',
        'customer unavailable',
        'not applicable',
        'other',
    ].includes(normalizeText(value));
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
