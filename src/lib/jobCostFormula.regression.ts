import {
    calculateJobCostFormula,
    isStandardTankWaterHeaterFormulaCard,
    readJobCostFormulaFromNotes,
    removeJobCostFormulaFromNotes,
    serializeJobCostFormula,
    standardTankWaterHeaterCustomerExplanation,
    standardTankWaterHeaterJobCostDefaults,
    STANDARD_TANK_WATER_HEATER_PRICE_KEY,
} from './jobCostFormula';

runJobCostFormulaRegressions();

export function runJobCostFormulaRegressions() {
    waterHeaterDefaultsRespectCompanyPriceFloor();
    laborUsesJobDurationAndCrewSize();
    manualMaterialChangesFlowIntoTrueCost();
    targetMarginProducesSellingPrice();
    metadataRoundTripsWithoutPollutingNotes();
    customerExplanationCoversProfessionalCompletionWithoutInternalNumbers();
    formulaAppliesOnlyToExplicitWaterHeaterCard();
}

function waterHeaterDefaultsRespectCompanyPriceFloor() {
    const result = calculateJobCostFormula({
        ...standardTankWaterHeaterJobCostDefaults,
        targetGrossMarginPercent: 0,
    });

    assert(result.valid, 'The standard water-heater formula should be valid.');
    assert(result.suggestedSellingPrice === 2800, 'The water-heater selling price must not fall below the $2,800 company floor.');
    assert(result.minimumPriceApplied, 'The result should explain when the minimum selling price was applied.');
}

function laborUsesJobDurationAndCrewSize() {
    const result = calculateJobCostFormula({
        ...standardTankWaterHeaterJobCostDefaults,
        jobDurationHours: 4,
        crewSize: 2,
        technicianHourlyWage: 50,
        laborBurdenPercent: 25,
    });

    assert(result.paidLaborHours === 8, 'Four elapsed hours with two technicians must produce eight paid labor hours.');
    assert(result.directLaborCost === 400, 'Eight paid hours at $50 must produce $400 direct technician wages.');
    assert(result.loadedLaborCost === 500, 'Labor burden must be added on top of direct technician wages.');
}

function manualMaterialChangesFlowIntoTrueCost() {
    const lower = calculateJobCostFormula({ ...standardTankWaterHeaterJobCostDefaults, materialCost: 1100 });
    const higher = calculateJobCostFormula({ ...standardTankWaterHeaterJobCostDefaults, materialCost: 1200 });

    assert(higher.trueJobCost > lower.trueJobCost, 'Increasing the water-heater/material cost must increase true job cost.');
    assert(higher.suggestedSellingPrice >= lower.suggestedSellingPrice, 'Increasing material cost must not lower the suggested price.');
}

function targetMarginProducesSellingPrice() {
    const result = calculateJobCostFormula({
        ...standardTankWaterHeaterJobCostDefaults,
        minimumSellingPrice: 0,
        targetGrossMarginPercent: 35,
    });

    assert(result.valid, 'A 35% target margin should calculate successfully.');
    assert(result.suggestedSellingPrice >= result.formulaSellingPrice, 'The rounded recommendation must cover the formula selling price.');
    assert(result.projectedGrossMarginPercent >= 35, 'Rounding up must preserve the requested gross margin.');
}

function metadataRoundTripsWithoutPollutingNotes() {
    const serialized = serializeJobCostFormula({
        ...standardTankWaterHeaterJobCostDefaults,
        jobDurationHours: 5.5,
        tripCount: 2,
    });
    const notes = `${serialized} Existing internal note.`;
    const restored = readJobCostFormulaFromNotes(notes);

    assert(restored?.jobDurationHours === 5.5, 'Saved job duration must round-trip through price-book notes.');
    assert(restored?.tripCount === 2, 'Saved trip count must round-trip through price-book notes.');
    assert(removeJobCostFormulaFromNotes(notes) === 'Existing internal note.', 'Formula metadata must stay out of visible internal notes.');
}

function customerExplanationCoversProfessionalCompletionWithoutInternalNumbers() {
    const explanation = standardTankWaterHeaterCustomerExplanation.toLowerCase();

    ['diagnosis', 'ppe', 'disposal', 'cleanup', 'instructions', 'lifetime workmanship warranty'].forEach((term) => {
        assert(explanation.includes(term), `Customer explanation must include ${term}.`);
    });
    ['hourly wage', 'gross margin', 'profit percentage'].forEach((term) => {
        assert(!explanation.includes(term), `Customer explanation must not expose internal ${term}.`);
    });
}

function formulaAppliesOnlyToExplicitWaterHeaterCard() {
    assert(isStandardTankWaterHeaterFormulaCard(STANDARD_TANK_WATER_HEATER_PRICE_KEY), 'The explicit standard tank water-heater card must use the formula.');
    assert(!isStandardTankWaterHeaterFormulaCard('water-heater-repair-standard'), 'A repair card must not inherit the replacement formula.');
    assert(!isStandardTankWaterHeaterFormulaCard('water_service_garage_mechanical_tankless_water_heater_replacement'), 'Tankless replacement needs its own future formula.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
