import {
    calculateEstimateOptionPrice,
    mapCompanyPriceBookItemToEstimateEntry,
    type CompanyPriceBookItemLike,
    type EstimateAnswerSet,
    type EstimateChoice,
    type EstimateOptionCategory,
} from './estimateOptions';

export type EstimateRecommendationRelationship =
    | 'alternative'
    | 'add_on'
    | 'upgrade'
    | 'protection'
    | 'required_correction';

type EstimateRecommendationCondition = {
    answerId: string;
    values: string[];
};

export type EstimateRecommendationRule = {
    id: string;
    categories: EstimateOptionCategory[];
    title: string;
    reason: string;
    relationship: EstimateRecommendationRelationship;
    priceKeys: string[];
    basePriceKeysAny?: string[];
    supersedesPriceKeys?: string[];
    all?: EstimateRecommendationCondition[];
    any?: EstimateRecommendationCondition[];
    priority: number;
};

export type EligibleEstimateRecommendation = EstimateRecommendationRule & {
    availablePriceKeys: string[];
};

const SHOWER_CARTRIDGE_KEY = 'water_service_bathroom_shower_cartridge_replacement';
const SHOWER_VALVE_KEY = 'water_service_bathroom_shower_valve_replacement';
const WHOLE_HOME_FILTER_KEY = 'water_quality_garage_mechanical_whole_home_filter_installation';
const PRV_KEY = 'water_service_garage_mechanical_prv_pressure_regulator_replacement';

export const estimateRecommendationRulebook: EstimateRecommendationRule[] = [
    {
        id: 'water-heater-expansion-tank',
        categories: ['water_heater'],
        title: 'Add expansion-tank protection',
        reason: 'The documented expansion-tank finding calls for an approved installation or replacement.',
        relationship: 'required_correction',
        priceKeys: ['water_service_garage_mechanical_water_heater_expansion_tank_installation'],
        any: [
            condition('expansion_tank', ['add', 'replace']),
            condition('code_corrections', ['expansion tank']),
        ],
        priority: 10,
    },
    {
        id: 'water-heater-prv',
        categories: ['water_heater', 'water_heater_service'],
        title: 'Correct high water pressure',
        reason: 'High pressure or a failed regulator was documented during the water-heater evaluation.',
        relationship: 'protection',
        priceKeys: [PRV_KEY],
        any: [
            condition('prv_pressure', ['high pressure', 'prv replacement recommended']),
            condition('fixture_pressure_condition', ['high pressure', 'regulator failed']),
        ],
        priority: 20,
    },
    {
        id: 'water-heater-filtration',
        categories: ['water_heater', 'water_heater_service'],
        title: 'Add whole-home scale protection',
        reason: 'Scale, sediment, or confirmed hard-water conditions were documented at the equipment.',
        relationship: 'protection',
        priceKeys: [WHOLE_HOME_FILTER_KEY],
        any: [condition('water_quality_observation', ['scale / sediment', 'hard water confirmed'])],
        priority: 30,
    },
    {
        id: 'water-heater-tank-replacement',
        categories: ['water_heater_service'],
        title: 'Replace the tank water heater',
        reason: 'The unit was documented as unsafe, leaking beyond repair, or not economical to repair.',
        relationship: 'alternative',
        priceKeys: ['water_service_garage_mechanical_standard_tank_water_heater_replacement'],
        all: [
            condition('service_unit_type', ['tank']),
            condition('water_heater_repairability', ['replacement recommended', 'unsafe / not repairable']),
        ],
        supersedesPriceKeys: waterHeaterRepairKeys(),
        priority: 5,
    },
    {
        id: 'water-heater-tankless-replacement',
        categories: ['water_heater_service'],
        title: 'Replace the tankless water heater',
        reason: 'The unit was documented as unsafe, leaking beyond repair, or not economical to repair.',
        relationship: 'alternative',
        priceKeys: ['water_service_garage_mechanical_tankless_water_heater_replacement'],
        all: [
            condition('service_unit_type', ['tankless']),
            condition('water_heater_repairability', ['replacement recommended', 'unsafe / not repairable']),
        ],
        supersedesPriceKeys: waterHeaterRepairKeys(),
        priority: 5,
    },
    {
        id: 'shower-valve-replacement',
        categories: ['faucet_repair'],
        title: 'Replace the complete shower valve',
        reason: 'The valve body was documented as worn, rusted, pitted, or unsuitable for a cartridge-only repair.',
        relationship: 'alternative',
        priceKeys: [SHOWER_VALVE_KEY],
        basePriceKeysAny: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        supersedesPriceKeys: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        any: [condition('valve_body_condition', ['rough / rusted / pitted', 'replacement recommended'])],
        priority: 5,
    },
    {
        id: 'shower-valve-with-filtration',
        categories: ['faucet_repair'],
        title: 'Replace shower valve + whole-home filtration',
        reason: 'The damaged valve and documented mineral conditions support a complete valve replacement with scale protection.',
        relationship: 'upgrade',
        priceKeys: [SHOWER_VALVE_KEY, WHOLE_HOME_FILTER_KEY],
        basePriceKeysAny: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        supersedesPriceKeys: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        all: [
            condition('valve_body_condition', ['rough / rusted / pitted', 'replacement recommended']),
            condition('faucet_mineral_condition', ['visible mineral buildup', 'hard water confirmed']),
        ],
        priority: 15,
    },
    {
        id: 'shower-valve-with-prv',
        categories: ['faucet_repair'],
        title: 'Replace shower valve + pressure regulator',
        reason: 'The damaged valve and documented high-pressure condition support correcting both causes in one option.',
        relationship: 'upgrade',
        priceKeys: [SHOWER_VALVE_KEY, PRV_KEY],
        basePriceKeysAny: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        supersedesPriceKeys: [SHOWER_CARTRIDGE_KEY, 'water_service_bathroom_shower_valve_repair'],
        all: [
            condition('valve_body_condition', ['rough / rusted / pitted', 'replacement recommended']),
            condition('fixture_pressure_condition', ['high pressure', 'regulator failed']),
        ],
        priority: 20,
    },
    {
        id: 'faucet-replacement-after-failed-repair',
        categories: ['faucet_repair'],
        title: 'Replace the complete faucet',
        reason: 'Compatible repair parts were documented as obsolete or the fixture was documented for replacement.',
        relationship: 'alternative',
        priceKeys: ['water_service_bathroom_bathroom_faucet_replacement'],
        supersedesPriceKeys: [
            'water_service_bathroom_bathroom_faucet_repair',
            'water_service_kitchen_kitchen_faucet_repair',
            'water_service_kitchen_kitchen_faucet_cartridge_replacement',
        ],
        all: [
            condition('faucet_repair_area', ['bathroom sink']),
            condition('faucet_parts_available', ['obsolete / replacement recommended']),
        ],
        priority: 8,
    },
    {
        id: 'toilet-replacement-after-repair-finding',
        categories: ['toilet_repair'],
        title: 'Replace the complete toilet',
        reason: 'The fixture was documented as cracked, badly worn, or a better candidate for replacement than repair.',
        relationship: 'alternative',
        priceKeys: ['water_service_bathroom_toilet_replacement'],
        supersedesPriceKeys: toiletRepairKeys(),
        any: [condition('toilet_fixture_condition', ['cracked / damaged', 'replacement recommended'])],
        priority: 5,
    },
    {
        id: 'toilet-shutoff-correction',
        categories: ['toilet_replacement'],
        title: 'Replace the toilet shutoff valve',
        reason: 'The shutoff valve was documented as needing replacement.',
        relationship: 'required_correction',
        priceKeys: ['water_service_bathroom_toilet_shutoff_replacement'],
        any: [condition('angle_stop_condition', ['replace recommended', 'replace required'])],
        priority: 10,
    },
    {
        id: 'toilet-supply-line',
        categories: ['toilet_replacement'],
        title: 'Replace the toilet supply line',
        reason: 'Supply-line replacement was selected in the documented installation scope.',
        relationship: 'add_on',
        priceKeys: ['water_service_bathroom_toilet_supply_line_replacement'],
        any: [condition('supply_line_replacement', ['true'])],
        priority: 20,
    },
    {
        id: 'disposal-replacement-after-failed-repair',
        categories: ['garbage_disposal_repair'],
        title: 'Replace the garbage disposal',
        reason: 'The existing disposal was documented as unsafe or not serviceable for reuse.',
        relationship: 'alternative',
        priceKeys: ['drain_sewer_kitchen_garbage_disposal_replacement'],
        supersedesPriceKeys: [
            'drain_sewer_kitchen_garbage_disposal_diagnostic_jam_service',
            'drain_sewer_kitchen_garbage_disposal_reinstall_resecure',
            'drain_sewer_kitchen_garbage_disposal_flange_reseal',
            'drain_sewer_kitchen_garbage_disposal_cord_connection_service',
        ],
        any: [condition('disposal_unit_serviceable', ['false'])],
        priority: 5,
    },
    {
        id: 'disposal-drain-correction',
        categories: ['garbage_disposal'],
        title: 'Correct the under-sink drain piping',
        reason: 'The drain configuration was documented as needing correction during disposal replacement.',
        relationship: 'required_correction',
        priceKeys: ['drain_sewer_kitchen_kitchen_tubular_waste_rebuild'],
        any: [condition('drain_configuration', ['needs correction'])],
        priority: 10,
    },
    {
        id: 'sewer-camera',
        categories: ['sewer_service_repair'],
        title: 'Add a sewer camera inspection',
        reason: 'A camera inspection has not been completed or included for the documented sewer condition.',
        relationship: 'add_on',
        priceKeys: ['drain_sewer_whole_home_sewer_camera_inspection'],
        any: [condition('sewer_camera_completed', ['false'])],
        priority: 10,
    },
    {
        id: 'sewer-hydro-jetting',
        categories: ['sewer_service_repair'],
        title: 'Add main-line hydro jetting',
        reason: 'Roots, recurring buildup, or preventive cleaning was documented for an accessible main line.',
        relationship: 'upgrade',
        priceKeys: ['drain_sewer_exterior_main_line_hydro_jetting'],
        any: [condition('sewer_problem_type', ['roots', 'belly / standing water', 'preventive service'])],
        priority: 20,
    },
    {
        id: 'sewer-cleanout-install',
        categories: ['sewer_service_repair'],
        title: 'Install a service cleanout',
        reason: 'The documented access point does not provide a practical exterior cleanout for future service.',
        relationship: 'add_on',
        priceKeys: ['drain_sewer_whole_home_cleanout_install'],
        any: [condition('sewer_access_point', ['roof vent', 'fixture access', 'excavation needed'])],
        priority: 30,
    },
    {
        id: 'water-main-leak-isolation',
        categories: ['water_main_repair'],
        title: 'Locate and isolate the leak first',
        reason: 'The leak location was not confirmed, so diagnostic isolation should be its own approved option.',
        relationship: 'alternative',
        priceKeys: ['diagnostics_inspections_whole_home_leak_isolation_testing'],
        any: [condition('water_main_located', ['false'])],
        priority: 5,
    },
    {
        id: 'filtration-system-replacement',
        categories: ['water_filtration_service'],
        title: 'Replace the water-treatment system',
        reason: 'The treatment equipment was documented as obsolete or not economical to repair.',
        relationship: 'alternative',
        priceKeys: [WHOLE_HOME_FILTER_KEY],
        supersedesPriceKeys: filtrationServiceKeys(),
        any: [condition('filtration_system_condition', ['replacement recommended', 'obsolete / not repairable'])],
        priority: 5,
    },
    {
        id: 'leak-follow-up-spot-repair',
        categories: ['leak_search_isolation'],
        title: 'Add an approved water-line spot repair',
        reason: 'A domestic water leak was documented for isolation and a repair path may be presented separately.',
        relationship: 'add_on',
        priceKeys: ['water_service_whole_home_water_main_spot_repair'],
        any: [condition('leak_system', ['domestic hot water', 'domestic cold water'])],
        priority: 40,
    },
];

export function getEligibleEstimateRecommendations(input: {
    category: EstimateOptionCategory;
    answers: EstimateAnswerSet;
    currentPriceKeys: string[];
    priceBookItems: CompanyPriceBookItemLike[];
    max?: number;
}): EligibleEstimateRecommendation[] {
    const currentKeys = new Set(input.currentPriceKeys.map(normalize));
    const availableItems = input.priceBookItems.filter((item) =>
        item.active &&
        item.company_id &&
        Number(item.recommended_selling_price ?? item.base_price) > 0
    );
    const availableByKey = new Map(availableItems.map((item) => [normalize(item.price_key), item]));
    const max = Math.max(1, Math.min(4, input.max ?? 4));

    return estimateRecommendationRulebook
        .filter((rule) => rule.categories.includes(input.category))
        .filter((rule) => !rule.basePriceKeysAny || rule.basePriceKeysAny.some((key) => currentKeys.has(normalize(key))))
        .filter((rule) => matchesConditions(rule, input.answers))
        .filter((rule) => rule.priceKeys.every((key) => availableByKey.has(normalize(key))))
        .filter((rule) => rule.priceKeys.some((key) => !currentKeys.has(normalize(key))))
        .filter((rule) => isRuleCompatible(rule, currentKeys, availableByKey))
        .sort((first, second) => first.priority - second.priority)
        .slice(0, max)
        .map((rule) => ({
            ...rule,
            availablePriceKeys: rule.priceKeys.filter((key) => availableByKey.has(normalize(key))),
        }));
}

export function buildRecommendedEstimateChoice(input: {
    id: string;
    companyId: string;
    baseChoice: EstimateChoice;
    recommendation: EligibleEstimateRecommendation;
    priceBookItems: CompanyPriceBookItemLike[];
    displayOrder: number;
}): EstimateChoice | null {
    const entries = input.priceBookItems.map(mapCompanyPriceBookItemToEstimateEntry);
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const entriesByKey = new Map(entries.map((entry) => [normalize(entry.code), entry]));
    const superseded = new Set((input.recommendation.supersedesPriceKeys || []).map(normalize));
    const retainedEntryIds = input.baseChoice.pricingResult.lineItems
        .filter((line) => !superseded.has(normalize(line.code)))
        .map((line) => line.priceBookEntryId)
        .filter((id) => entriesById.has(id));
    const recommendationEntryIds = input.recommendation.priceKeys
        .map((key) => entriesByKey.get(normalize(key))?.id || '')
        .filter(Boolean);
    const entryIds = [...new Set([...retainedEntryIds, ...recommendationEntryIds])];

    if (recommendationEntryIds.length !== input.recommendation.priceKeys.length || entryIds.length === 0) {
        return null;
    }

    const pricingResult = calculateEstimateOptionPrice({
        id: `${input.id}-pricing`,
        companyId: input.companyId,
        priceBookEntries: entries,
        lineInputs: entryIds.map((priceBookEntryId, index) => ({
            priceBookEntryId,
            quantity: 1,
            source: index === 0 ? 'base_installation' : 'modifier',
            required: true,
            removable: false,
        })),
        priceBookVersion: input.baseChoice.pricingResult.priceBookVersion,
    });

    if (pricingResult.missingPricingInputs.length > 0 || pricingResult.totalAmount <= 0) return null;

    const isAlternative = input.recommendation.relationship === 'alternative';
    const title = isAlternative
        ? input.recommendation.title
        : `${input.baseChoice.title} + ${input.recommendation.title}`;

    return {
        ...input.baseChoice,
        id: input.id,
        kind: 'individual',
        title,
        shortSummary: pricingResult.lineItems.map((line) => line.name).join(' + '),
        homeownerExplanation: `${input.recommendation.reason} This option includes only the documented work listed below.`,
        keyBenefits: [relationshipLabel(input.recommendation.relationship), 'Deterministic company pricing'],
        whyItDiffers: input.recommendation.reason,
        recommendedReason: input.recommendation.reason,
        scopeIds: pricingResult.lineItems.map((line) => line.code),
        inclusionIds: pricingResult.lineItems.map((line) => line.code),
        exclusionIds: [...new Set([
            ...input.baseChoice.exclusionIds,
            ...(input.recommendation.supersedesPriceKeys || []),
        ])],
        pricingResult,
        recommended: true,
        displayOrder: input.displayOrder,
        priceAdjustmentPercentage: 0,
        priceAdjustmentLabel: null,
    };
}

function matchesConditions(rule: EstimateRecommendationRule, answers: EstimateAnswerSet) {
    const allMatches = (rule.all || []).every((condition) => matchesCondition(condition, answers));
    const anyConditions = rule.any || [];
    const anyMatches = anyConditions.length === 0 || anyConditions.some((condition) => matchesCondition(condition, answers));

    return allMatches && anyMatches;
}

function matchesCondition(conditionDefinition: EstimateRecommendationCondition, answers: EstimateAnswerSet) {
    const answer = answers[conditionDefinition.answerId];
    const actualValues = Array.isArray(answer)
        ? answer.map(normalize)
        : [normalize(answer)];
    const expectedValues = conditionDefinition.values.map(normalize);

    return expectedValues.some((expected) => actualValues.includes(expected));
}

function isRuleCompatible(
    rule: EstimateRecommendationRule,
    currentKeys: Set<string>,
    availableByKey: Map<string, CompanyPriceBookItemLike>
) {
    const supersededKeys = new Set((rule.supersedesPriceKeys || []).map(normalize));
    const retainedCurrentKeys = [...currentKeys].filter((key) => !supersededKeys.has(key));
    const nextKeys = new Set([
        ...retainedCurrentKeys,
        ...rule.priceKeys.map(normalize),
    ]);

    const addedItemsAreCompatible = rule.priceKeys.every((priceKey) => {
        const item = availableByKey.get(normalize(priceKey));
        const incompatibleKeys = (item?.incompatible_price_keys || []).map(normalize);

        return incompatibleKeys.every((key) => !nextKeys.has(key));
    });

    if (!addedItemsAreCompatible) return false;

    return retainedCurrentKeys.every((priceKey) => {
        const item = availableByKey.get(priceKey);
        const incompatibleKeys = (item?.incompatible_price_keys || []).map(normalize);

        return rule.priceKeys.every((addedKey) => !incompatibleKeys.includes(normalize(addedKey)));
    });
}

function condition(answerId: string, values: string[]): EstimateRecommendationCondition {
    return { answerId, values };
}

function normalize(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function relationshipLabel(relationship: EstimateRecommendationRelationship) {
    const labels: Record<EstimateRecommendationRelationship, string> = {
        alternative: 'Alternative solution',
        add_on: 'Related add-on',
        upgrade: 'Upgrade option',
        protection: 'Home protection',
        required_correction: 'Documented correction',
    };

    return labels[relationship];
}

function waterHeaterRepairKeys() {
    return [
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
    ];
}

function toiletRepairKeys() {
    return [
        'water_service_bathroom_toilet_repair',
        'water_service_bathroom_toilet_leak_diagnostic',
        'water_service_bathroom_toilet_running_repair',
        'water_service_bathroom_fill_valve_replacement',
        'water_service_bathroom_flush_valve_replacement',
        'water_service_bathroom_flapper_replacement',
        'water_service_bathroom_toilet_trip_lever_replacement',
        'water_service_bathroom_toilet_tank_rebuild',
        'water_service_bathroom_toilet_reset',
        'drain_sewer_bathroom_wax_ring_replacement',
        'drain_sewer_bathroom_toilet_flange_repair',
    ];
}

function filtrationServiceKeys() {
    return [
        'water_quality_garage_mechanical_whole_home_filter_service',
        'water_quality_garage_mechanical_whole_home_filter_cartridge_replacement',
        'water_quality_garage_mechanical_water_softener_service',
        'water_quality_kitchen_reverse_osmosis_service',
        'water_quality_kitchen_reverse_osmosis_filter_change',
        'water_quality_kitchen_under_sink_filter_service',
    ];
}
