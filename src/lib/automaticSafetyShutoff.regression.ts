import {
    buildEstimateOptionWorkspace,
    type CompanyPriceBookItemLike,
    type EstimateAnswerSet,
} from './estimateOptions';
import { plumbingPriceBookCatalogItems } from './plumbingPriceBookCatalog';
import { getTemporaryRiversidePlumbingPrice } from './temporaryRiversidePlumbingPriceList';

const SMART_WATER_KEY = 'water_service_garage_mechanical_smart_water_leak_shutoff_installation';
const SEISMIC_GAS_KEY = 'gas_service_exterior_seismic_gas_shutoff_valve_installation';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

const smartWaterCatalogItem = plumbingPriceBookCatalogItems.find((item) => item.price_key === SMART_WATER_KEY);
const seismicGasCatalogItem = plumbingPriceBookCatalogItems.find((item) => item.price_key === SEISMIC_GAS_KEY);

assert(smartWaterCatalogItem?.unit === 'each', 'Smart water automatic shutoff should be an each price-book item.');
assert(smartWaterCatalogItem.defaultDescription.includes('Flo by Moen'), 'Smart water shutoff should document the requested Flo by Moen compatible path.');
assert(seismicGasCatalogItem?.unit === 'each', 'Seismic gas shutoff should be an each price-book item.');
assert(seismicGasCatalogItem.defaultDescription.includes('Applicability varies by jurisdiction and utility'), 'Seismic gas wording must not claim the device is universally required.');
assert(getTemporaryRiversidePlumbingPrice(SMART_WATER_KEY)?.recommendedPrice === 1695, 'Smart water shutoff should have an editable starter recommendation.');
assert(getTemporaryRiversidePlumbingPrice(SEISMIC_GAS_KEY)?.recommendedPrice === 895, 'Seismic gas shutoff should have an editable starter recommendation.');

const smartWaterAnswers: EstimateAnswerSet = {
    valve_replacement_scope: ['Smart water leak detection and automatic shutoff installation'],
    valve_type: 'smart water automatic shutoff',
    shower_configuration: 'not applicable - different valve type',
    tub_spout_scope: 'not applicable',
    valve_service: 'domestic water',
    valve_material: 'copper / brass',
    valve_access: 'exposed',
    isolation_method: 'building main shutoff',
    connection_method: 'pressed',
    finish_restoration: 'not required',
    permit_or_testing: true,
};
const smartWaterWorkspace = workspace(smartWaterAnswers);
const smartWaterChoice = smartWaterWorkspace.choices[0];

assert(smartWaterChoice, 'A fully selected smart water shutoff should create an option.');
assert(smartWaterChoice.pricingResult.lineItems.length === 1, 'Smart water option must not pull another valve or gas line.');
assert(smartWaterChoice.pricingResult.lineItems[0]?.code === SMART_WATER_KEY, 'Smart water selection must use only its explicit price key.');
assert(smartWaterChoice.title.includes('Smart Water Leak Detection & Automatic Shutoff Installation'), 'Smart water option needs a clear homeowner title.');
assert(smartWaterChoice.homeownerExplanation.startsWith('Install'), 'Smart water option must use installation wording, not replacement wording.');
assert(smartWaterChoice.customerSelections?.some((selection) => selection === 'Valve type: Smart water automatic shutoff') === true, 'The selected safety-device type should remain visible on the homeowner option.');

const seismicGasWorkspace = workspace({
    valve_replacement_scope: ['Seismic gas shutoff valve installation'],
    valve_type: 'seismic gas shutoff',
    shower_configuration: 'not applicable - different valve type',
    tub_spout_scope: 'not applicable',
    valve_service: 'gas',
    valve_material: 'galvanized',
    valve_access: 'exposed',
    isolation_method: 'utility shutoff required',
    connection_method: 'threaded',
    finish_restoration: 'not required',
    permit_or_testing: true,
});
const seismicGasChoice = seismicGasWorkspace.choices[0];

assert(seismicGasChoice, 'A fully selected seismic gas shutoff should create an option.');
assert(seismicGasChoice.pricingResult.lineItems.length === 1, 'Seismic gas option must not pull another valve or water line.');
assert(seismicGasChoice.pricingResult.lineItems[0]?.code === SEISMIC_GAS_KEY, 'Seismic gas selection must use only its explicit price key.');
assert(seismicGasChoice.title.includes('Seismic Gas Shutoff Valve Installation'), 'Seismic gas option needs a clear homeowner title.');
assert(seismicGasChoice.homeownerExplanation.startsWith('Install'), 'Seismic gas option must use installation wording, not replacement wording.');

const missingExplicitPrice = buildEstimateOptionWorkspace({
    companyId: 'company-a',
    draftItems: [],
    draftContext: null,
    category: 'valve_replacement',
    answers: smartWaterAnswers,
    priceBookItems: [priceBookItem(SEISMIC_GAS_KEY, 'Seismic gas shutoff valve installation', 895)],
    technicianApproved: false,
});

assert(missingExplicitPrice.choices.length === 0, 'A safety shutoff must never borrow another valve price when its explicit company price is unavailable.');

function workspace(answers: EstimateAnswerSet) {
    return buildEstimateOptionWorkspace({
        companyId: 'company-a',
        draftItems: [],
        draftContext: null,
        category: 'valve_replacement',
        answers,
        priceBookItems: [
            priceBookItem(SMART_WATER_KEY, 'Smart water leak detection and automatic shutoff installation', 1695),
            priceBookItem(SEISMIC_GAS_KEY, 'Seismic gas shutoff valve installation', 895),
        ],
        technicianApproved: false,
    });
}

function priceBookItem(priceKey: string, name: string, price: number): CompanyPriceBookItemLike {
    const isGas = priceKey === SEISMIC_GAS_KEY;

    return {
        id: priceKey,
        company_id: 'company-a',
        price_key: priceKey,
        name,
        system: isGas ? 'Gas Service' : 'Water Service',
        category: isGas ? 'Gas' : 'Valves / Shutoffs',
        unit: 'each',
        base_price: price,
        labor_hours: isGas ? 4 : 5,
        material_cost: isGas ? 300 : 850,
        customer_description: `${name}.`,
        internal_notes: null,
        active: true,
        created_at: null,
        updated_at: null,
        recommended_selling_price: price,
    };
}

console.log('automaticSafetyShutoff regression checks passed');
