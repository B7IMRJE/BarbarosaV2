import {
    buildEstimateOptionWorkspace,
    getEstimateCategoriesForWorkType,
    getExteriorPipeAllowedMaterials,
    getExteriorPipeAllowedSizes,
    type CompanyPriceBookItemLike,
    type EstimateAnswerSet,
} from './estimateOptions';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const replacementCards = getEstimateCategoriesForWorkType('replacement');

assert(replacementCards.some((card) => card.id === 'exterior_pipe_replacement'), 'The consolidated Exterior Pipe Replacement card should be available.');
assert(!replacementCards.some((card) => card.id === 'water_main_replacement'), 'The legacy water-main card should be hidden from new quote selection.');
assert(!replacementCards.some((card) => card.id === 'sewer_line_replacement'), 'The legacy sewer card should be hidden from new quote selection.');
assert(!replacementCards.some((card) => card.id === 'gas_line_replacement'), 'The legacy gas-line card should be hidden from new quote selection.');

assert(getExteriorPipeAllowedMaterials('Water service').includes('PEX for potable water'), 'Water service should offer potable-water PEX.');
assert(!getExteriorPipeAllowedMaterials('Gas').includes('PEX for potable water'), 'Gas must never offer potable-water PEX.');
assert(getExteriorPipeAllowedMaterials('Gas').includes('Underground polyethylene gas pipe'), 'Gas should offer explicitly rated underground polyethylene gas pipe.');
assert(getExteriorPipeAllowedMaterials('Sewer / building drain').includes('ABS'), 'Sewer should offer approved drainage materials.');
assert(getExteriorPipeAllowedSizes('Sewer / building drain').includes('4 in'), 'Sewer should offer common drain sizes.');

const gasWorkspace = workspace({
    exterior_pipe_utility: 'Gas',
    exterior_pipe_material: 'Black iron / steel',
    exterior_pipe_size: '1 in',
    exterior_pipe_linear_feet: '12',
    exterior_pipe_crew_hours: '8',
    exterior_pipe_access: 'Soft soil / landscape trench',
    exterior_pipe_surface: 'Landscape',
    exterior_pipe_restoration: 'Company includes restoration',
    exterior_pipe_permit: 'yes',
});
const gasChoice = gasWorkspace.choices[0];

assert(gasChoice, 'A fully selected and priced gas replacement should create one option.');
assert(gasChoice.pricingResult.lineItems.length === 1, 'The utility choice must not pull unrelated water or sewer lines.');
assert(gasChoice.pricingResult.lineItems[0]?.code === 'gas_service_garage_mechanical_gas_line_replacement_linear_foot', 'Gas must use only the gas per-foot price.');
assert(gasChoice.pricingResult.lineItems[0]?.quantity === 12, 'Measured linear feet should become the price-book quantity.');
assert(gasChoice.pricingResult.totalAmount === 1020, 'The option total should be per-foot price multiplied by measured feet.');
assert(gasChoice.customerSelections?.some((selection) => selection.includes('$85.00 per linear foot × 12')) === true, 'The homeowner details should explain the per-foot calculation.');
assert(gasChoice.customerSelections?.some((selection) => selection.includes('8 hours')) === true, 'The technician crew-time estimate should remain visible in option details.');

const invalidGasMaterial = workspace({
    exterior_pipe_utility: 'Gas',
    exterior_pipe_material: 'PEX for potable water',
    exterior_pipe_size: '1 in',
    exterior_pipe_linear_feet: '12',
    exterior_pipe_crew_hours: '8',
    exterior_pipe_access: 'Open / exposed',
    exterior_pipe_surface: 'No finished surface',
    exterior_pipe_restoration: 'Not required',
    exterior_pipe_permit: 'yes',
});

assert(invalidGasMaterial.choices.length === 0, 'A material from the wrong utility must never create a priced option.');

function workspace(answers: EstimateAnswerSet) {
    return buildEstimateOptionWorkspace({
        companyId: 'company-a',
        draftItems: [],
        draftContext: null,
        category: 'exterior_pipe_replacement',
        answers,
        priceBookItems: [
            priceBookItem('water_service_whole_home_main_water_service_replacement_linear_foot', 'Main water service replacement by linear foot', 295),
            priceBookItem('drain_sewer_whole_home_sewer_line_replacement_linear_foot', 'Sewer line replacement by linear foot', 395),
            priceBookItem('gas_service_garage_mechanical_gas_line_replacement_linear_foot', 'Gas line replacement by linear foot', 85),
        ],
        technicianApproved: false,
    });
}

function priceBookItem(priceKey: string, name: string, price: number): CompanyPriceBookItemLike {
    return {
        id: priceKey,
        company_id: 'company-a',
        price_key: priceKey,
        name,
        system: priceKey.startsWith('gas_') ? 'Gas Service' : priceKey.startsWith('drain_') ? 'Drain / Sewer' : 'Water Service',
        category: priceKey.startsWith('gas_') ? 'Gas' : priceKey.startsWith('drain_') ? 'Drains / Sewer' : 'Water Service',
        unit: 'linear foot',
        base_price: price,
        labor_hours: 1,
        material_cost: 25,
        customer_description: `${name}.`,
        internal_notes: null,
        active: true,
        created_at: null,
        updated_at: null,
        recommended_selling_price: price,
    };
}

console.log('exteriorPipeEstimate regression checks passed');
