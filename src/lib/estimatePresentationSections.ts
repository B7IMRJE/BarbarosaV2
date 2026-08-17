import type {
    EstimateAnswerSet,
    EstimateApprovedProduct,
    EstimateOptionCategory,
    EstimatePricingResult,
} from './estimateOptions';

export type EstimatePresentationSectionId =
    | 'product'
    | 'protection'
    | 'process'
    | 'included_components'
    | 'conditions_exclusions'
    | 'verification'
    | 'documentation';

export type EstimatePresentationItemStatus =
    | 'verified'
    | 'included'
    | 'conditional'
    | 'not_included'
    | 'documented';

export type EstimatePresentationSectionItem = {
    id: string;
    title: string;
    detail: string | null;
    status: EstimatePresentationItemStatus;
};

export type EstimatePresentationSection = {
    id: EstimatePresentationSectionId;
    title: string;
    description: string | null;
    items: EstimatePresentationSectionItem[];
};

type BuildEstimatePresentationSectionsInput = {
    category: EstimateOptionCategory;
    answers: EstimateAnswerSet;
    pricingResult: EstimatePricingResult;
    product?: EstimateApprovedProduct | null;
};

const sectionDefinitions: Record<EstimatePresentationSectionId, { title: string; description: string | null }> = {
    product: {
        title: 'Selected Product',
        description: 'Only product facts selected or verified for this estimate are shown.',
    },
    protection: {
        title: 'Home Protection',
        description: 'How the work path and installation area will be prepared and protected.',
    },
    process: {
        title: 'Installation Process',
        description: 'The planned sequence for the selected base installation.',
    },
    included_components: {
        title: 'Included Components',
        description: 'Selected company Price Book lines and explicitly confirmed installation components.',
    },
    conditions_exclusions: {
        title: 'Conditions & Exclusions',
        description: 'Unknown or additional work remains separate until it is selected, priced, and authorized.',
    },
    verification: {
        title: 'Verification',
        description: 'Checks performed before the installation is presented as complete.',
    },
    documentation: {
        title: 'Documentation',
        description: 'Job evidence retained with the estimate and completion record.',
    },
};

export function buildDetailedEstimatePresentationSections(
    input: BuildEstimatePresentationSectionsInput
): EstimatePresentationSection[] {
    if (input.category === 'toilet_replacement') return buildToiletSections(input);
    if (input.category === 'water_heater') return buildWaterHeaterSections(input);

    return [];
}

function buildToiletSections(input: BuildEstimatePresentationSectionsInput) {
    const includedCodes = normalizedLineCodes(input.pricingResult);
    const productFacts = buildProductFacts(input.product, [
        'bowl shape',
        'height',
        'rough in',
        'flush',
        'efficiency',
        'gpf',
        'color',
        'construction',
    ]);
    const flangeCondition = answerText(input.answers.flange_condition);
    const angleStopCondition = answerText(input.answers.angle_stop_condition);
    const floorCondition = answerText(input.answers.floor_condition);
    const protectionPlan = answerText(input.answers.work_area_protection);
    const perimeterSealPlan = answerText(input.answers.perimeter_seal_practice);
    const haulAway = answerBoolean(input.answers.haul_away);
    const supplyLineRequested = answerBoolean(input.answers.supply_line_replacement);
    const documentationPlan = answerText(input.answers.completion_documentation);
    const productItems = uniqueItems([
        productIdentityItem(input.product),
        verifiedAnswerItem('toilet-rough-in', 'Rough-in', input.answers.rough_in),
        verifiedAnswerItem('toilet-bowl-shape', 'Bowl shape', input.answers.bowl_shape),
        verifiedAnswerItem('toilet-height', 'Height', input.answers.height),
        verifiedAnswerItem('toilet-construction', 'Construction', input.answers.construction),
        verifiedAnswerItem('toilet-flush', 'Flush type', input.answers.flush_type),
        verifiedAnswerItem('toilet-efficiency', 'Verified flush / efficiency rating', input.answers.verified_flush_efficiency),
        verifiedAnswerItem('toilet-color', 'Color', input.answers.color),
        ...productFacts,
    ]);
    const processItems: EstimatePresentationSectionItem[] = [
        includedItem('toilet-isolate', 'Isolate the fixture water supply safely'),
        includedItem('toilet-remove', haulAway === false ? 'Disconnect and remove the existing toilet from the work area' : 'Disconnect, remove, and prepare the existing toilet for haul-away'),
        includedItem('toilet-clean', 'Remove accessible old caulk and residue, then clean and inspect the installation area'),
        includedItem('toilet-flange-inspection', 'Inspect the exposed flange and floor condition before setting the new toilet'),
        includedItem('toilet-install', 'Install the selected toilet with the confirmed seal and fastening hardware'),
        includedItem('toilet-seal', perimeterSealPlan ? `Apply the selected perimeter-seal practice: ${displayAnswer(perimeterSealPlan)}` : 'Confirm the company perimeter-seal practice before installation'),
        includedItem('toilet-cleanup', 'Clean the work area after installation'),
    ];
    const includedItems = input.pricingResult.lineItems.map((line) => includedItem(`line-${line.id}`, line.name));

    if (answerText(input.answers.installation_hardware)) {
        includedItems.push(includedItem(
            'toilet-installation-hardware',
            displayAnswer(answerText(input.answers.installation_hardware))
        ));
    }
    if (haulAway === true) includedItems.push(includedItem('toilet-haul-away', 'Existing toilet haul-away and disposal'));

    const conditions: EstimatePresentationSectionItem[] = [];
    const pricedFlangeWork = hasLine(includedCodes, ['toilet flange repair', 'toilet flange replacement']);
    const pricedShutoffWork = hasLine(includedCodes, ['toilet shutoff replacement', 'toilet supply valve replacement', 'bathroom angle stop replacement']);
    const pricedSupplyWork = hasLine(includedCodes, ['toilet supply line replacement']);

    if (matchesAny(flangeCondition, ['damaged', 'repair needed', 'replacement needed']) && !pricedFlangeWork) {
        conditions.push(conditionalItem('toilet-flange-condition', 'Flange repair or replacement', 'Not included unless separately selected, priced, and authorized after the flange is exposed.'));
    } else if (matchesAny(flangeCondition, ['unknown', 'until removal'])) {
        conditions.push(conditionalItem('toilet-flange-unknown', 'Flange condition is not yet confirmed', 'Any repair requires a separate price and homeowner authorization.'));
    }
    if (matchesAny(angleStopCondition, ['replace recommended', 'replace required']) && !pricedShutoffWork) {
        conditions.push(conditionalItem('toilet-shutoff-condition', 'Shutoff replacement', 'Not included unless a matching Price Book line is selected and authorized.'));
    }
    if (supplyLineRequested === true && !pricedSupplyWork) {
        conditions.push(conditionalItem('toilet-supply-condition', 'Supply-line replacement', 'Requested in the inspection checklist but not included until a matching priced line is selected.'));
    }
    if (matchesAny(floorCondition, ['damaged', 'soft', 'water damage', 'needs repair'])) {
        conditions.push(conditionalItem('toilet-floor-condition', 'Floor or subfloor repair', 'Separate remediation is required unless it is specifically selected, priced, and authorized.'));
    }
    addGeneralConditions(conditions, input.answers, 'unusual_installation_conditions');

    return assembleSections({
        product: productItems,
        protection: protectionPlan
            ? [includedItem('toilet-protection', displayAnswer(protectionPlan))]
            : [conditionalItem('toilet-protection-confirm', 'Confirm work-path and fixture-area protection', 'The presentation will not assume a protection method that was not selected.')],
        process: processItems,
        included_components: includedItems,
        conditions_exclusions: conditions,
        verification: [
            includedItem('toilet-level', 'Confirm the toilet is stable and level'),
            includedItem('toilet-leak-test', 'Test the supply, connections, base, and flush operation for leaks'),
            includedItem('toilet-operating-test', 'Verify fill, flush, shutoff, and fixture operation'),
            documentedItem('toilet-precedence', 'Manufacturer instructions and applicable local requirements control the final installation'),
        ],
        documentation: [
            documentedItem('toilet-existing-photos', 'Existing fixture, base/floor, and shutoff photos retained with the estimate'),
            documentedItem('toilet-completion-record', documentationPlan ? displayAnswer(documentationPlan) : 'Before, during, and after photos plus completion documentation'),
        ],
    });
}

function buildWaterHeaterSections(input: BuildEstimatePresentationSectionsInput) {
    const includedCodes = normalizedLineCodes(input.pricingResult);
    const configuration = answerText(input.answers.water_heater_configuration) || answerText(input.answers.tank_or_tankless);
    const fuelType = answerText(input.answers.fuel_type);
    const location = answerText(input.answers.location);
    const protectionPlan = answerText(input.answers.work_area_protection);
    const haulAway = answerBoolean(input.answers.haul_away);
    const documentationPlan = answerText(input.answers.completion_documentation);
    const productItems = uniqueItems([
        productIdentityItem(input.product),
        verifiedAnswerItem('water-heater-configuration', 'Configuration', configuration),
        verifiedAnswerItem('water-heater-fuel', 'Fuel / energy source', fuelType),
        verifiedAnswerItem('water-heater-capacity', 'Capacity or demand', input.answers.tank_or_tankless),
        verifiedAnswerItem('water-heater-location', 'Location', location),
        verifiedAnswerItem('water-heater-efficiency', 'Verified efficiency rating', input.answers.verified_efficiency_rating),
        ...buildProductFacts(input.product, [
            'capacity',
            'gallon',
            'fuel',
            'energy',
            'efficiency',
            'uef',
            'btu',
            'voltage',
            'flow rate',
            'gpm',
            'dimensions',
        ]),
    ]);
    const processItems: EstimatePresentationSectionItem[] = [
        includedItem('water-heater-isolate', 'Isolate water and applicable gas or electrical utilities safely'),
        includedItem('water-heater-drain', 'Drain the existing unit using a controlled work-area plan'),
        includedItem('water-heater-disconnect', 'Disconnect and unstrap the existing unit as applicable'),
        includedItem('water-heater-remove', haulAway === false ? 'Remove the existing unit from the installation area' : 'Remove and prepare the existing unit for haul-away'),
        includedItem('water-heater-area', 'Clean and inspect the installation area and existing connections'),
        includedItem('water-heater-connections', 'Inspect water, gas, electrical, venting, combustion-air, drain, and safety connections that apply to this installation'),
        includedItem('water-heater-install', 'Install the selected unit and only the components listed as included'),
        includedItem('water-heater-startup', 'Refill or purge as applicable, then complete manufacturer startup procedures'),
        includedItem('water-heater-cleanup', 'Clean the work area after installation'),
    ];
    const includedItems = input.pricingResult.lineItems.map((line) => includedItem(`line-${line.id}`, line.name));

    if (haulAway === true) includedItems.push(includedItem('water-heater-haul-away', 'Existing water-heater haul-away and disposal'));

    const conditions: EstimatePresentationSectionItem[] = [];

    addUnpricedCondition(conditions, {
        id: 'water-heater-shutoff',
        title: 'Failed or replacement water shutoff',
        answer: answerText(input.answers.water_shutoff_connections),
        triggeringTerms: ['replace', 'failed', 'repair', 'unknown'],
        includedCodes,
        pricedTerms: ['shutoff replacement'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-gas',
        title: 'Gas line, shutoff, connector, or sizing upgrade',
        answer: answerText(input.answers.gas_valve_line),
        triggeringTerms: ['replace', 'sizing review', 'needs review', 'unknown'],
        includedCodes,
        pricedTerms: ['gas shutoff replacement', 'gas flex connector replacement', 'gas connection'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-electrical',
        title: 'Electrical outlet, circuit, disconnect, or service upgrade',
        answer: answerText(input.answers.electrical_needs),
        triggeringTerms: ['new', 'review', 'upgrade', 'unknown'],
        includedCodes,
        pricedTerms: ['electrical', 'circuit', 'disconnect'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-venting',
        title: 'Venting or combustion-air correction',
        answer: `${answerText(input.answers.venting)} ${answerText(input.answers.combustion_air)}`,
        triggeringTerms: ['unknown', 'review', 'limited', 'blocked', 'correction'],
        includedCodes,
        pricedTerms: ['permit code correction', 'vent'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-drain-pan',
        title: 'Drain pan or drain route work',
        answer: answerText(input.answers.drain_pan_route),
        triggeringTerms: ['add', 'correct', 'unknown', 'not possible'],
        includedCodes,
        pricedTerms: ['pan installation', 'drain pan line installation'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-expansion',
        title: 'Expansion control or pressure correction',
        answer: `${answerText(input.answers.expansion_tank)} ${answerText(input.answers.prv_pressure)}`,
        triggeringTerms: ['add', 'replace', 'high pressure', 'recommended', 'unknown'],
        includedCodes,
        pricedTerms: ['expansion tank installation', 'pressure regulator', 'prv'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-seismic',
        title: 'Seismic anchoring, straps, blocking, stand, or platform work',
        answer: `${answerText(input.answers.straps)} ${answerText(input.answers.back_block)} ${answerText(input.answers.platform)}`,
        triggeringTerms: ['install', 'replace', 'build', 'review', 'unknown'],
        includedCodes,
        pricedTerms: ['seismic strap installation', 'back block installation', 'stand installation'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-tp',
        title: 'T&P relief valve or discharge correction',
        answer: answerText(input.answers.tp_discharge),
        triggeringTerms: ['correct', 'unknown', 'repair', 'replace'],
        includedCodes,
        pricedTerms: ['tp valve replacement', 't p valve replacement', 'permit code correction'],
    });
    addUnpricedCondition(conditions, {
        id: 'water-heater-recirculation',
        title: 'Recirculation modification',
        answer: answerText(input.answers.recirculation),
        triggeringTerms: ['add', 'repair', 'replace'],
        includedCodes,
        pricedTerms: ['recirculation'],
    });

    const permitPlan = answerText(input.answers.permit_inspection_scope);
    const pricedPermitScope = hasLine(includedCodes, ['permit', 'inspection', 'code correction']);
    if (
        permitPlan &&
        (
            matchesAny(permitPlan, ['separate', 'not included', 'unknown', 'confirm']) ||
            (matchesAny(permitPlan, ['included']) && !pricedPermitScope)
        )
    ) {
        conditions.push(conditionalItem(
            'water-heater-permit',
            'Permit fees and inspection coordination',
            `${displayAnswer(permitPlan)}. This is not included until a matching Price Book line is selected, priced, and authorized.`
        ));
    }
    const remediation = answerArray(input.answers.conditional_remediation);
    for (const condition of remediation) {
        if (normalize(condition) === 'none observed') continue;
        conditions.push(conditionalItem(`water-heater-remediation-${slug(condition)}`, displayAnswer(condition), 'Separate assessment, price, and authorization are required before remediation.'));
    }
    addGeneralConditions(conditions, input.answers, 'unusual_installation_conditions');

    return assembleSections({
        product: productItems,
        protection: protectionPlan
            ? [includedItem('water-heater-protection', displayAnswer(protectionPlan))]
            : [conditionalItem('water-heater-protection-confirm', 'Confirm work-path and installation-area protection', 'The presentation will not assume a protection method that was not selected.')],
        process: processItems,
        included_components: includedItems,
        conditions_exclusions: conditions,
        verification: [
            includedItem('water-heater-leak-test', 'Test water and applicable fuel connections for leaks'),
            includedItem('water-heater-operation', 'Verify startup, operation, temperature setting, and applicable safety controls'),
            includedItem('water-heater-discharge', 'Confirm applicable relief, drain, vent, electrical, and combustion safeguards after startup'),
            documentedItem('water-heater-precedence', 'Licensed-service requirements, manufacturer instructions, permits, and applicable local code control the final installation'),
        ],
        documentation: [
            documentedItem('water-heater-existing-photos', 'Existing unit, label, installation area, venting, and connection photos retained with the estimate'),
            documentedItem('water-heater-completion-record', documentationPlan ? displayAnswer(documentationPlan) : 'Before, during, and after photos plus completion documentation'),
        ],
    });
}

function assembleSections(itemsBySection: Record<EstimatePresentationSectionId, EstimatePresentationSectionItem[]>) {
    return (Object.keys(sectionDefinitions) as EstimatePresentationSectionId[]).map((id) => ({
        id,
        title: sectionDefinitions[id].title,
        description: sectionDefinitions[id].description,
        items: uniqueItems(itemsBySection[id]),
    })).filter((section) => section.items.length > 0);
}

function buildProductFacts(product: EstimateApprovedProduct | null | undefined, allowedKeys: string[]) {
    if (!product) return [];

    return Object.entries(product.specifications).flatMap(([key, value]) => {
        const normalizedKey = normalize(key);
        const internalKeyTerms = ['cost', 'margin', 'markup', 'price', 'labor', 'supplier', 'management', 'internal note'];

        if (internalKeyTerms.some((term) => normalizedKey.includes(term))) return [];
        if (!allowedKeys.some((allowed) => normalizedKey.includes(normalize(allowed)))) return [];
        if (!String(value || '').trim()) return [];

        return [verifiedAnswerItem(`product-spec-${slug(key)}`, displayAnswer(key), value)];
    });
}

function productIdentityItem(product: EstimateApprovedProduct | null | undefined) {
    if (!product) return null;

    const label = [product.brand, product.model].map((value) => String(value || '').trim()).filter(Boolean).join(' ');

    return label ? verifiedItem(`product-${product.id}`, label, 'Approved company catalog product selected for this option.') : null;
}

function verifiedAnswerItem(id: string, title: string, value: unknown) {
    const answer = answerText(value);

    if (!answer || matchesAny(answer, ['unknown', 'not inspected', 'not discussed'])) return null;

    return verifiedItem(id, title, displayAnswer(answer));
}

function includedItem(id: string, title: string, detail: string | null = null): EstimatePresentationSectionItem {
    return { id, title, detail, status: 'included' };
}

function verifiedItem(id: string, title: string, detail: string | null = null): EstimatePresentationSectionItem {
    return { id, title, detail, status: 'verified' };
}

function conditionalItem(id: string, title: string, detail: string | null = null): EstimatePresentationSectionItem {
    return { id, title, detail, status: 'conditional' };
}

function documentedItem(id: string, title: string, detail: string | null = null): EstimatePresentationSectionItem {
    return { id, title, detail, status: 'documented' };
}

function normalizedLineCodes(pricingResult: EstimatePricingResult) {
    return pricingResult.lineItems.map((line) => normalize(`${line.code} ${line.name}`));
}

function hasLine(lines: string[], terms: string[]) {
    return lines.some((line) => terms.some((term) => line.includes(normalize(term))));
}

function addUnpricedCondition(conditions: EstimatePresentationSectionItem[], input: {
    id: string;
    title: string;
    answer: string;
    triggeringTerms: string[];
    includedCodes: string[];
    pricedTerms: string[];
}) {
    if (!matchesAny(input.answer, input.triggeringTerms)) return;
    if (hasLine(input.includedCodes, input.pricedTerms)) return;

    conditions.push(conditionalItem(
        input.id,
        input.title,
        `${displayAnswer(input.answer)}. Not included unless a matching Price Book line is selected, priced, and authorized.`
    ));
}

function addGeneralConditions(
    conditions: EstimatePresentationSectionItem[],
    answers: EstimateAnswerSet,
    answerId: string
) {
    const note = answerText(answers[answerId]);

    if (!note) return;

    conditions.push(conditionalItem(`${answerId}-note`, 'Documented site condition', note));
}

function answerText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function answerArray(value: unknown) {
    return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function answerBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return null;

    const normalized = normalize(value);

    if (normalized === 'yes') return true;
    if (normalized === 'no') return false;

    return null;
}

function matchesAny(value: string, terms: string[]) {
    const normalized = normalize(value);

    return terms.some((term) => normalized.includes(normalize(term)));
}

function displayAnswer(value: string) {
    const trimmed = String(value || '').trim();

    if (!trimmed) return '';

    return trimmed
        .replace(/\bT&p\b/gi, 'T&P')
        .replace(/\bPrv\b/gi, 'PRV')
        .replace(/\bAda\b/gi, 'ADA')
        .replace(/\bGpf\b/gi, 'GPF')
        .replace(/\bUef\b/gi, 'UEF')
        .replace(/^./, (character) => character.toUpperCase());
}

function normalize(value: string) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ');
}

function slug(value: string) {
    return normalize(value).replace(/\s+/g, '-').slice(0, 80) || 'item';
}

function uniqueItems(items: (EstimatePresentationSectionItem | null)[]) {
    const seen = new Set<string>();

    return items.filter((item): item is EstimatePresentationSectionItem => {
        if (!item || !item.title.trim()) return false;
        const key = `${item.status}:${normalize(item.title)}:${normalize(item.detail || '')}`;

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
