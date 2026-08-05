export const STANDARD_TANK_WATER_HEATER_PRICE_KEY =
    'water_service_garage_mechanical_standard_tank_water_heater_replacement';

const JOB_COST_FORMULA_VERSION = 'water-heater-v1';
const jobCostFormulaPattern = /\[job cost formula:\s*([^\]]+)\]/i;

export type JobCostFormulaInput = {
    materialCost: number;
    jobDurationHours: number;
    crewSize: number;
    technicianHourlyWage: number;
    laborBurdenPercent: number;
    tripCount: number;
    vehicleCostPerTrip: number;
    permitCost: number;
    disposalCost: number;
    consumablesCost: number;
    overheadAllocation: number;
    warrantyReservePercent: number;
    contingencyPercent: number;
    targetGrossMarginPercent: number;
    minimumSellingPrice: number;
};

export type JobCostFormulaResult = {
    materialCost: number;
    paidLaborHours: number;
    directLaborCost: number;
    laborBurdenCost: number;
    loadedLaborCost: number;
    vehicleCost: number;
    permitCost: number;
    disposalCost: number;
    consumablesCost: number;
    overheadAllocation: number;
    warrantyReserve: number;
    contingencyReserve: number;
    trueJobCost: number;
    formulaSellingPrice: number;
    suggestedSellingPrice: number;
    minimumPriceApplied: boolean;
    projectedGrossProfit: number;
    projectedGrossMarginPercent: number;
    valid: boolean;
    error: string;
};

export const standardTankWaterHeaterJobCostDefaults: JobCostFormulaInput = {
    materialCost: 1150,
    jobDurationHours: 4,
    crewSize: 1,
    technicianHourlyWage: 50,
    laborBurdenPercent: 35,
    tripCount: 1,
    vehicleCostPerTrip: 99,
    permitCost: 0,
    disposalCost: 100,
    consumablesCost: 75,
    overheadAllocation: 250,
    warrantyReservePercent: 5,
    contingencyPercent: 5,
    targetGrossMarginPercent: 35,
    minimumSellingPrice: 2800,
};

export const standardTankWaterHeaterCustomerExplanation = [
    'Includes pre-installation diagnosis and written scope review; coordination, delivery, and normal material handling; protection of nearby surfaces using appropriate PPE and dust controls; removal of the existing standard tank water heater; installation with approved standard reconnect materials; startup, leak, temperature, venting or combustion, and safety checks as applicable; normal haul-away and disposal; final cleanup; homeowner operating and maintenance instructions; and the company’s lifetime workmanship warranty, subject to the written warranty terms.',
    'The quoted price also supports the trained technician, insured service vehicle, professional tools, office coordination, and follow-up required to complete the work professionally.',
    'Permit fees, concealed damage, major code corrections, platform, venting, electrical upgrades, and unusual access are included only when specifically listed in the option.',
].join(' ');

export function isStandardTankWaterHeaterFormulaCard(priceKey?: string | null) {
    return String(priceKey || '').trim() === STANDARD_TANK_WATER_HEATER_PRICE_KEY;
}

export function calculateJobCostFormula(input: JobCostFormulaInput): JobCostFormulaResult {
    const normalized = normalizeJobCostFormula(input);

    if (normalized.jobDurationHours <= 0) return invalidResult('Job duration must be greater than zero.');
    if (normalized.crewSize <= 0) return invalidResult('Crew size must be at least one technician.');
    if (normalized.technicianHourlyWage < 0) return invalidResult('Technician wage cannot be negative.');
    if (normalized.targetGrossMarginPercent < 0 || normalized.targetGrossMarginPercent >= 100) {
        return invalidResult('Target gross margin must be between 0% and 99.99%.');
    }

    const paidLaborHours = normalized.jobDurationHours * normalized.crewSize;
    const directLaborCost = paidLaborHours * normalized.technicianHourlyWage;
    const laborBurdenCost = directLaborCost * (normalized.laborBurdenPercent / 100);
    const loadedLaborCost = directLaborCost + laborBurdenCost;
    const vehicleCost = normalized.tripCount * normalized.vehicleCostPerTrip;
    const subtotalBeforeReserves =
        normalized.materialCost +
        loadedLaborCost +
        vehicleCost +
        normalized.permitCost +
        normalized.disposalCost +
        normalized.consumablesCost +
        normalized.overheadAllocation;
    const warrantyReserve = subtotalBeforeReserves * (normalized.warrantyReservePercent / 100);
    const contingencyReserve = subtotalBeforeReserves * (normalized.contingencyPercent / 100);
    const trueJobCost = subtotalBeforeReserves + warrantyReserve + contingencyReserve;

    if (trueJobCost <= 0) return invalidResult('Add job costs before calculating a selling price.');

    const formulaSellingPrice = trueJobCost / (1 - normalized.targetGrossMarginPercent / 100);
    const suggestedSellingPrice = roundUpToFive(Math.max(formulaSellingPrice, normalized.minimumSellingPrice));
    const projectedGrossProfit = suggestedSellingPrice - trueJobCost;
    const projectedGrossMarginPercent = suggestedSellingPrice <= 0
        ? 0
        : (projectedGrossProfit / suggestedSellingPrice) * 100;

    return {
        materialCost: roundCurrency(normalized.materialCost),
        paidLaborHours: roundNumber(paidLaborHours),
        directLaborCost: roundCurrency(directLaborCost),
        laborBurdenCost: roundCurrency(laborBurdenCost),
        loadedLaborCost: roundCurrency(loadedLaborCost),
        vehicleCost: roundCurrency(vehicleCost),
        permitCost: roundCurrency(normalized.permitCost),
        disposalCost: roundCurrency(normalized.disposalCost),
        consumablesCost: roundCurrency(normalized.consumablesCost),
        overheadAllocation: roundCurrency(normalized.overheadAllocation),
        warrantyReserve: roundCurrency(warrantyReserve),
        contingencyReserve: roundCurrency(contingencyReserve),
        trueJobCost: roundCurrency(trueJobCost),
        formulaSellingPrice: roundCurrency(formulaSellingPrice),
        suggestedSellingPrice,
        minimumPriceApplied: normalized.minimumSellingPrice > formulaSellingPrice,
        projectedGrossProfit: roundCurrency(projectedGrossProfit),
        projectedGrossMarginPercent: roundNumber(projectedGrossMarginPercent),
        valid: true,
        error: '',
    };
}

export function serializeJobCostFormula(input: JobCostFormulaInput) {
    const normalized = normalizeJobCostFormula(input);
    const values: [string, number][] = [
        ['material', normalized.materialCost],
        ['duration', normalized.jobDurationHours],
        ['crew', normalized.crewSize],
        ['wage', normalized.technicianHourlyWage],
        ['burden', normalized.laborBurdenPercent],
        ['trips', normalized.tripCount],
        ['vehicle', normalized.vehicleCostPerTrip],
        ['permit', normalized.permitCost],
        ['disposal', normalized.disposalCost],
        ['consumables', normalized.consumablesCost],
        ['overhead', normalized.overheadAllocation],
        ['warranty', normalized.warrantyReservePercent],
        ['contingency', normalized.contingencyPercent],
        ['margin', normalized.targetGrossMarginPercent],
        ['floor', normalized.minimumSellingPrice],
    ];

    return `[Job Cost Formula: ${JOB_COST_FORMULA_VERSION}|${values
        .map(([key, value]) => `${key}=${formatMetadataNumber(value)}`)
        .join('|')}]`;
}

export function readJobCostFormulaFromNotes(notes?: string | null): JobCostFormulaInput | null {
    const match = jobCostFormulaPattern.exec(String(notes || ''));
    const payload = match?.[1]?.trim();

    if (!payload) return null;

    const [version, ...entries] = payload.split('|');

    if (version !== JOB_COST_FORMULA_VERSION) return null;

    const values = new Map(entries.map((entry) => {
        const separatorIndex = entry.indexOf('=');
        return separatorIndex < 0
            ? ['', '']
            : [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
    }));
    const defaults = standardTankWaterHeaterJobCostDefaults;

    return normalizeJobCostFormula({
        materialCost: readMetadataNumber(values, 'material', defaults.materialCost),
        jobDurationHours: readMetadataNumber(values, 'duration', defaults.jobDurationHours),
        crewSize: readMetadataNumber(values, 'crew', defaults.crewSize),
        technicianHourlyWage: readMetadataNumber(values, 'wage', defaults.technicianHourlyWage),
        laborBurdenPercent: readMetadataNumber(values, 'burden', defaults.laborBurdenPercent),
        tripCount: readMetadataNumber(values, 'trips', defaults.tripCount),
        vehicleCostPerTrip: readMetadataNumber(values, 'vehicle', defaults.vehicleCostPerTrip),
        permitCost: readMetadataNumber(values, 'permit', defaults.permitCost),
        disposalCost: readMetadataNumber(values, 'disposal', defaults.disposalCost),
        consumablesCost: readMetadataNumber(values, 'consumables', defaults.consumablesCost),
        overheadAllocation: readMetadataNumber(values, 'overhead', defaults.overheadAllocation),
        warrantyReservePercent: readMetadataNumber(values, 'warranty', defaults.warrantyReservePercent),
        contingencyPercent: readMetadataNumber(values, 'contingency', defaults.contingencyPercent),
        targetGrossMarginPercent: readMetadataNumber(values, 'margin', defaults.targetGrossMarginPercent),
        minimumSellingPrice: readMetadataNumber(values, 'floor', defaults.minimumSellingPrice),
    });
}

export function removeJobCostFormulaFromNotes(notes?: string | null) {
    return String(notes || '').replace(jobCostFormulaPattern, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizeJobCostFormula(input: JobCostFormulaInput): JobCostFormulaInput {
    return {
        materialCost: nonnegative(input.materialCost),
        jobDurationHours: finite(input.jobDurationHours),
        crewSize: finite(input.crewSize),
        technicianHourlyWage: finite(input.technicianHourlyWage),
        laborBurdenPercent: nonnegative(input.laborBurdenPercent),
        tripCount: nonnegative(input.tripCount),
        vehicleCostPerTrip: nonnegative(input.vehicleCostPerTrip),
        permitCost: nonnegative(input.permitCost),
        disposalCost: nonnegative(input.disposalCost),
        consumablesCost: nonnegative(input.consumablesCost),
        overheadAllocation: nonnegative(input.overheadAllocation),
        warrantyReservePercent: nonnegative(input.warrantyReservePercent),
        contingencyPercent: nonnegative(input.contingencyPercent),
        targetGrossMarginPercent: finite(input.targetGrossMarginPercent),
        minimumSellingPrice: nonnegative(input.minimumSellingPrice),
    };
}

function invalidResult(error: string): JobCostFormulaResult {
    return {
        materialCost: 0,
        paidLaborHours: 0,
        directLaborCost: 0,
        laborBurdenCost: 0,
        loadedLaborCost: 0,
        vehicleCost: 0,
        permitCost: 0,
        disposalCost: 0,
        consumablesCost: 0,
        overheadAllocation: 0,
        warrantyReserve: 0,
        contingencyReserve: 0,
        trueJobCost: 0,
        formulaSellingPrice: 0,
        suggestedSellingPrice: 0,
        minimumPriceApplied: false,
        projectedGrossProfit: 0,
        projectedGrossMarginPercent: 0,
        valid: false,
        error,
    };
}

function readMetadataNumber(values: Map<string, string>, key: string, fallback: number) {
    const value = Number(values.get(key));
    return Number.isFinite(value) ? value : fallback;
}

function finite(value: number) {
    return Number.isFinite(value) ? value : 0;
}

function nonnegative(value: number) {
    return Math.max(0, finite(value));
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundNumber(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpToFive(value: number) {
    return Math.ceil(Math.max(0, value) / 5) * 5;
}

function formatMetadataNumber(value: number) {
    return String(roundNumber(value));
}
