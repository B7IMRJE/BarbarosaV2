import {
    plumbingPriceBookCatalogItems,
    type PlumbingPriceBookCatalogItem,
} from './plumbingPriceBookCatalog';

export type TemporaryPlumbingPrice = {
    priceKey: string;
    name: string;
    system: string;
    area: string;
    category: string;
    unit: 'each' | 'hour' | 'linear foot' | 'package' | 'inspection' | 'other';
    marketLow: number;
    recommendedPrice: number;
    marketHigh: number;
    materialCost: number;
    laborHours: number;
    customerDescription: string;
    pricingBasis: 'direct benchmark' | 'catalog planning model';
};

const riverside2026Source =
    'Riverside 2026 planning recommendation; management review required. References: https://www.bls.gov/news.release/ocwage.htm | https://www.dir.ca.gov/oprl/residential/riverside.pdf | https://www.homedepot.com/services/h/plumbing | https://www.homedepot.com/services/c/cost-install-water-heater/9058c024e | https://riversideca.gov/finance/PDF/Fees-and-Charges-as-of-July-1%2C-2026.pdf';

const riversideBenchmarks: TemporaryPlumbingPrice[] = [
    price('diagnostic-service-call', 'Plumbing diagnostic / service call', 'Water Service', 'Whole Home', 'Diagnostics / Inspections', 'inspection', 89, 129, 175, 5, 1, 'On-site plumbing diagnosis and written repair options.'),
    price('emergency-after-hours-add-on', 'Emergency / after-hours add-on', 'Water Service', 'Whole Home', 'Emergency / After Hours', 'each', 75, 149, 225, 0, 0.5, 'Additional charge for approved nights weekends or emergency response.'),
    price('water-leak-diagnostic', 'Water leak diagnostic', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 150, 295, 500, 15, 2, 'Diagnose an active or suspected potable-water leak.'),
    price('slab-leak-diagnostic', 'Slab leak diagnostic', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 350, 595, 900, 40, 3, 'Electronic and field evaluation of a suspected under-slab leak.'),
    price('water-pressure-test', 'Water pressure test', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 95, 165, 275, 10, 1, 'Test static and operating residential water pressure.'),
    price('whole-home-repipe-estimate', 'Whole-home repipe estimate', 'Water Service', 'Whole Home', 'Water Service', 'inspection', 135, 195, 295, 5, 1.5, 'Site review and written whole-home repipe proposal.'),
    price('partial-repipe-per-fixture', 'Partial repipe per fixture', 'Water Service', 'Whole Home', 'Water Service', 'each', 650, 1050, 1650, 160, 5, 'Replace accessible hot and cold branch piping serving one fixture.'),
    price('whole-home-repipe-small', 'Whole-home repipe - small home', 'Water Service', 'Whole Home', 'Water Service', 'package', 6500, 8950, 12500, 2100, 40, 'Temporary planning allowance for a small single-story home. Final scope required.'),
    price('whole-home-repipe-medium', 'Whole-home repipe - medium home', 'Water Service', 'Whole Home', 'Water Service', 'package', 9000, 12950, 18000, 3200, 60, 'Temporary planning allowance for a medium home. Final scope required.'),
    price('whole-home-repipe-large', 'Whole-home repipe - large home', 'Water Service', 'Whole Home', 'Water Service', 'package', 13000, 18950, 28000, 4800, 90, 'Temporary planning allowance for a large or two-story home. Final scope required.'),
    price('faucet-reinstall-existing', 'Reinstall existing or customer-supplied faucet', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'each', 275, 375, 525, 35, 2, 'Remove as needed then clean reseat reconnect and test an existing or customer-supplied faucet.'),
    price('faucet-install-company-approved', 'Install company-approved faucet', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'each', 525, 725, 950, 235, 2.5, 'Remove existing faucet and install an approved replacement including a temporary $200 fixture allowance.'),
    price('water_service_kitchen_kitchen_faucet_repair', 'Kitchen faucet repair', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'each', 175, 295, 450, 45, 1.5, 'Repair an accessible leaking or malfunctioning kitchen faucet.'),
    price('water_service_kitchen_kitchen_faucet_replacement', 'Kitchen faucet replacement', 'Water Service', 'Kitchen', 'Faucets / Sinks', 'each', 425, 625, 900, 210, 2.5, 'Replace a standard kitchen faucet with approved reconnect materials.'),
    price('water_service_bathroom_bathroom_faucet_repair', 'Bathroom faucet repair', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'each', 150, 265, 400, 40, 1.25, 'Repair an accessible leaking or malfunctioning bathroom faucet.'),
    price('water_service_bathroom_bathroom_faucet_replacement', 'Bathroom faucet replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'each', 350, 525, 800, 175, 2, 'Replace a standard bathroom faucet with approved reconnect materials.'),
    price('water_service_bathroom_widespread_faucet_replacement', 'Widespread faucet replacement', 'Water Service', 'Bathroom', 'Faucets / Sinks', 'each', 475, 695, 1050, 225, 3, 'Replace a widespread bathroom faucet in an existing compatible sink.'),
    price('angle-stop-replacement', 'Angle stop / fixture shutoff replacement', 'Water Service', 'Other', 'Valves / Shutoffs', 'each', 175, 275, 425, 35, 1.25, 'Replace one accessible fixture shutoff valve.'),
    price('supply-line-replacement', 'Fixture supply line replacement', 'Water Service', 'Other', 'Faucets / Sinks', 'each', 110, 185, 300, 25, 0.75, 'Replace one accessible braided fixture supply connector.'),
    price('water_service_bathroom_toilet_repair', 'Toilet repair', 'Water Service', 'Bathroom', 'Toilets', 'each', 150, 245, 375, 45, 1.25, 'Repair a common running leaking or loose toilet condition.'),
    price('water_service_bathroom_fill_valve_replacement', 'Toilet fill valve replacement', 'Water Service', 'Bathroom', 'Toilets', 'each', 160, 235, 325, 40, 1, 'Replace and adjust a residential toilet fill valve.'),
    price('water_service_bathroom_toilet_tank_rebuild', 'Toilet tank rebuild', 'Water Service', 'Bathroom', 'Toilets', 'each', 275, 425, 625, 95, 2, 'Replace common toilet tank operating components and test.'),
    price('water_service_bathroom_toilet_reset', 'Toilet reset with wax ring', 'Water Service', 'Bathroom', 'Toilets', 'each', 250, 395, 575, 55, 2, 'Remove and reset a toilet with new wax seal and standard hardware.'),
    price('water_service_bathroom_toilet_replacement', 'Standard toilet replacement', 'Water Service', 'Bathroom', 'Toilets', 'each', 450, 695, 950, 260, 2.5, 'Remove and replace a standard residential toilet including basic reconnect materials.'),
    price('water_service_bathroom_toilet_installation_customer_supplied', 'Customer-supplied toilet installation', 'Water Service', 'Bathroom', 'Toilets', 'each', 325, 495, 725, 60, 2.5, 'Install a compatible customer-supplied toilet and dispose of standard packaging.'),
    price('drain_sewer_bathroom_toilet_stoppage', 'Toilet stoppage', 'Drain / Sewer', 'Bathroom', 'Toilets', 'each', 150, 225, 350, 15, 1.25, 'Clear a standard toilet stoppage without removing the fixture.'),
    price('drain_sewer_kitchen_kitchen_sink_stoppage', 'Kitchen sink stoppage', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'each', 175, 295, 450, 20, 1.75, 'Clear an accessible kitchen sink branch stoppage.'),
    price('drain_sewer_bathroom_bathroom_sink_stoppage', 'Bathroom sink stoppage', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'each', 150, 245, 375, 15, 1.25, 'Clear an accessible bathroom sink stoppage.'),
    price('drain-sewer-main-line-cleaning', 'Main sewer line cleaning', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'each', 300, 525, 850, 45, 3, 'Mechanically clean an accessible residential main sewer line.'),
    price('drain_sewer_exterior_sewer_camera_inspection', 'Sewer camera inspection', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'inspection', 175, 325, 500, 25, 2, 'Camera inspect accessible residential sewer piping and document findings.'),
    price('drain_sewer_kitchen_kitchen_p_trap_replacement', 'Kitchen P-trap replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'each', 175, 285, 425, 45, 1.5, 'Replace an accessible kitchen sink P-trap.'),
    price('drain_sewer_bathroom_bathroom_p_trap_replacement', 'Bathroom P-trap replacement', 'Drain / Sewer', 'Bathroom', 'Drains / Sewer', 'each', 150, 245, 375, 35, 1.25, 'Replace an accessible bathroom sink P-trap.'),
    price('drain_sewer_kitchen_garbage_disposal_replacement', 'Garbage disposal replacement', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'each', 275, 425, 650, 145, 2, 'Replace a standard residential garbage disposal and reconnect drainage.'),
    price('drain_sewer_kitchen_garbage_disposal_removal', 'Garbage disposal removal', 'Drain / Sewer', 'Kitchen', 'Drains / Sewer', 'each', 225, 350, 525, 70, 2, 'Remove a disposal and convert the sink to standard drainage.'),
    price('water-heater-diagnostic', 'Water heater diagnostic', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'inspection', 125, 195, 300, 10, 1.25, 'Diagnose tank or tankless water-heater performance and code concerns.'),
    price('water-heater-flush', 'Tank water heater flush', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 175, 275, 425, 25, 1.5, 'Flush a standard residential tank water heater where serviceable.'),
    price('water-heater-repair-standard', 'Standard water heater repair', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 250, 425, 650, 120, 2, 'Common tank water-heater repair excluding tank replacement.'),
    price('water-heater-40-gallon-gas', '40-gallon gas water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 1600, 2250, 3200, 950, 6, 'Replace a standard 40-gallon natural-gas water heater in an existing compliant location.'),
    price('water-heater-50-gallon-gas', '50-gallon gas water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 1750, 2450, 3500, 1100, 6.5, 'Replace a standard 50-gallon natural-gas water heater in an existing compliant location.'),
    price('water-heater-40-gallon-electric', '40-gallon electric water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 1450, 2050, 2900, 825, 5.5, 'Replace a standard 40-gallon electric water heater in an existing compliant location.'),
    price('water-heater-50-gallon-electric', '50-gallon electric water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 1600, 2250, 3150, 950, 6, 'Replace a standard 50-gallon electric water heater in an existing compliant location.'),
    price('water-heater-tankless-replacement', 'Tankless water heater replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 3200, 4750, 7000, 2100, 10, 'Replace an existing tankless water heater using compatible utilities and venting.'),
    price('water-heater-tank-to-tankless-conversion', 'Tank-to-tankless water heater conversion', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'package', 4500, 6500, 9500, 2800, 16, 'Convert a standard tank location to tankless subject to gas electrical vent and permit review.'),
    price('water-heater-expansion-tank', 'Water heater expansion tank installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 250, 395, 600, 110, 1.75, 'Install and support a potable-water expansion tank.'),
    price('water-heater-tp-valve', 'Water heater T&P valve replacement', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 225, 345, 525, 75, 1.5, 'Replace a temperature and pressure relief valve.'),
    price('water-heater-drain-pan', 'Water heater drain pan installation', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 225, 375, 650, 100, 2.5, 'Install a drain pan where the heater can be safely lifted or during replacement.'),
    price('water-heater-seismic-straps', 'Water heater seismic straps', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 150, 245, 375, 60, 1, 'Install approved upper and lower seismic restraint straps.'),
    price('water-heater-code-package', 'Water heater standard code-correction package', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'package', 350, 595, 950, 180, 3, 'Temporary allowance for common connector vent pan strap or bonding corrections.'),
    price('water-heater-permit-allowance', 'Water heater permit allowance', 'Water Service', 'Garage / Mechanical', 'Water Heaters', 'each', 78, 125, 250, 78, 0.5, 'Temporary Riverside permit and processing allowance. Final fee varies by jurisdiction.'),
    price('main-water-shutoff-replacement', 'Main water shutoff replacement', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'each', 450, 750, 1200, 160, 4, 'Replace an accessible main water shutoff valve.'),
    price('pressure-regulator-replacement', 'Pressure regulator replacement', 'Water Service', 'Garage / Mechanical', 'Valves / Shutoffs', 'each', 475, 795, 1250, 225, 4, 'Replace and adjust an accessible residential pressure regulator.'),
    price('hose-bib-replacement', 'Hose bib replacement', 'Water Service', 'Exterior', 'Fixtures', 'each', 175, 295, 475, 50, 1.5, 'Replace an accessible exterior hose bib.'),
    price('washing-machine-valves', 'Washing machine valve replacement', 'Water Service', 'Laundry', 'Valves / Shutoffs', 'each', 250, 425, 700, 90, 2.5, 'Replace accessible washing-machine supply valves.'),
    price('laundry-box-replacement', 'Laundry box replacement', 'Water Service', 'Laundry', 'Laundry / Dishwasher', 'each', 650, 995, 1600, 225, 6, 'Replace a recessed laundry supply and drain box with accessible piping.'),
    price('dishwasher-water-connection', 'Dishwasher water and drain connection', 'Water Service', 'Kitchen', 'Laundry / Dishwasher', 'each', 225, 375, 600, 65, 2, 'Connect an installed dishwasher to existing compatible water and drain points.'),
    price('ice-maker-line-installation', 'Ice maker line installation', 'Water Service', 'Kitchen', 'Laundry / Dishwasher', 'each', 275, 475, 850, 95, 3, 'Install an accessible refrigerator ice-maker supply line.'),
    price('gas-leak-diagnostic', 'Gas leak diagnostic', 'Gas Service', 'Whole Home', 'Gas', 'inspection', 225, 395, 650, 25, 2.5, 'Test accessible gas piping and isolate a suspected leak source.'),
    price('gas-pressure-test', 'Gas pressure test', 'Gas Service', 'Whole Home', 'Gas', 'inspection', 300, 525, 850, 35, 3.5, 'Pressure-test accessible residential gas piping and document results.'),
    price('gas-shutoff-replacement', 'Gas shutoff replacement', 'Gas Service', 'Other', 'Gas', 'each', 225, 375, 600, 80, 2, 'Replace an accessible appliance gas shutoff valve.'),
    price('gas-appliance-connection', 'Gas appliance connection', 'Gas Service', 'Other', 'Gas', 'each', 175, 295, 475, 65, 1.5, 'Connect one gas appliance to an existing approved shutoff.'),
    price('gas-line-repair-linear-foot', 'Accessible gas line repair', 'Gas Service', 'Other', 'Gas', 'linear foot', 45, 85, 150, 25, 0.5, 'Repair accessible gas piping by measured linear foot. Minimum service charge applies.'),
    price('water-softener-installation', 'Water softener installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'each', 1800, 2950, 4800, 1400, 8, 'Install a standard residential water softener at a compatible loop and drain.'),
    price('whole-home-filter-installation', 'Whole-home water filter installation', 'Water Quality', 'Garage / Mechanical', 'Water Quality', 'each', 1200, 2150, 3600, 950, 7, 'Install a standard whole-home filtration system at accessible piping.'),
    price('reverse-osmosis-installation', 'Under-sink reverse-osmosis installation', 'Water Quality', 'Kitchen', 'Water Quality', 'each', 550, 895, 1500, 400, 4, 'Install a standard under-sink reverse-osmosis system and drinking faucet.'),
    price('sewer-repair-linear-foot', 'Exterior sewer repair', 'Drain / Sewer', 'Exterior', 'Drains / Sewer', 'linear foot', 175, 325, 600, 110, 1.5, 'Repair accessible exterior sewer piping by measured linear foot. Excavation and restoration vary.'),
    price('water-line-repair-accessible', 'Accessible water-line repair', 'Water Service', 'Other', 'Water Service', 'each', 300, 525, 900, 100, 3, 'Repair one accessible domestic-water piping leak.'),
    price('wall-access-add-on', 'Wall or ceiling access add-on', 'Water Service', 'Other', 'Add-ons', 'each', 175, 325, 600, 45, 2.5, 'Create controlled access for plumbing work. Finish restoration is excluded unless listed.'),
    price('drywall-patch-add-on', 'Basic drywall patch add-on', 'Water Service', 'Other', 'Add-ons', 'each', 225, 395, 700, 70, 3, 'Basic patch only after plumbing access. Texture and paint matching may be separate.'),
    price('additional-plumber-hour', 'Additional plumber labor', 'Water Service', 'Other', 'Labor', 'hour', 150, 225, 300, 0, 1, 'Approved additional plumbing labor beyond listed flat-rate scope.'),
    price('additional-helper-hour', 'Additional helper labor', 'Water Service', 'Other', 'Labor', 'hour', 95, 145, 200, 0, 1, 'Approved additional helper labor beyond listed flat-rate scope.'),
];

export function buildTemporaryRiversidePlumbingPriceListTsv() {
    const header = [
        'price_key',
        'service_name',
        'system',
        'area',
        'category',
        'unit',
        'market_low',
        'recommended_price',
        'market_high',
        'material_cost',
        'labor_hours',
        'customer_description',
        'internal_notes',
        'source_notes',
    ];
    const rows = temporaryRiversidePlumbingPrices.map((entry) => [
        entry.priceKey,
        entry.name,
        entry.system,
        entry.area,
        entry.category,
        entry.unit,
        entry.marketLow,
        entry.recommendedPrice,
        entry.marketHigh,
        entry.materialCost,
        entry.laborHours,
        entry.customerDescription,
        `PLANNING RECOMMENDATION - ${entry.pricingBasis}; management review required before customer use.`,
        `${riverside2026Source} Basis: ${entry.pricingBasis}.`,
    ]);

    return [header, ...rows]
        .map((row) => row.map(sanitizeTsvCell).join('\t'))
        .join('\n');
}

function price(
    priceKey: string,
    name: string,
    system: string,
    area: string,
    category: string,
    unit: TemporaryPlumbingPrice['unit'],
    marketLow: number,
    recommendedPrice: number,
    marketHigh: number,
    materialCost: number,
    laborHours: number,
    customerDescription: string
): TemporaryPlumbingPrice {
    return {
        priceKey,
        name,
        system,
        area,
        category,
        unit,
        marketLow,
        recommendedPrice,
        marketHigh,
        materialCost,
        laborHours,
        customerDescription,
        pricingBasis: 'direct benchmark',
    };
}

function buildCatalogPlanningPrice(catalogItem: PlumbingPriceBookCatalogItem): TemporaryPlumbingPrice {
    const directBenchmark = findDirectBenchmark(catalogItem);

    if (directBenchmark) {
        return {
            ...directBenchmark,
            priceKey: catalogItem.price_key,
            name: catalogItem.name,
            system: catalogItem.system,
            area: catalogItem.area,
            category: catalogItem.category,
            unit: catalogItem.unit,
            customerDescription: catalogItem.defaultDescription,
            pricingBasis: 'direct benchmark',
        };
    }

    const planning = calculatePlanningRecommendation(catalogItem);

    return {
        priceKey: catalogItem.price_key,
        name: catalogItem.name,
        system: catalogItem.system,
        area: catalogItem.area,
        category: catalogItem.category,
        unit: catalogItem.unit,
        marketLow: planning.marketLow,
        recommendedPrice: planning.recommendedPrice,
        marketHigh: planning.marketHigh,
        materialCost: planning.materialCost,
        laborHours: planning.laborHours,
        customerDescription: catalogItem.defaultDescription,
        pricingBasis: 'catalog planning model',
    };
}

function findDirectBenchmark(catalogItem: PlumbingPriceBookCatalogItem) {
    const exactKey = riversideBenchmarks.find((entry) => entry.priceKey === catalogItem.price_key);

    if (exactKey) return exactKey;

    const catalogNames = [catalogItem.name, ...(catalogItem.aliases || [])].map(normalizePricingText);

    return riversideBenchmarks.find((entry) =>
        catalogNames.includes(normalizePricingText(entry.name)) &&
        normalizePricingText(entry.category) === normalizePricingText(catalogItem.category)
    ) || null;
}

type PlanningRecommendation = Pick<
    TemporaryPlumbingPrice,
    'marketLow' | 'recommendedPrice' | 'marketHigh' | 'materialCost' | 'laborHours'
>;

const planningPriceOverrides: Record<string, { price: number; material: number; hours: number }> = {
    water_service_whole_home_repipe_estimate: { price: 195, material: 5, hours: 1.5 },
    water_service_whole_home_main_water_service_replacement_estimate: { price: 129, material: 5, hours: 1.5 },
    water_service_whole_home_main_water_service_replacement_linear_foot: { price: 295, material: 95, hours: 1.25 },
    water_service_whole_home_main_water_service_replacement_package: { price: 8950, material: 2600, hours: 36 },
    water_service_whole_home_domestic_water_riser_replacement_linear_foot: { price: 375, material: 90, hours: 1.75 },
    water_service_whole_home_slab_leak_reroute: { price: 3250, material: 650, hours: 16 },
    'faucet-reinstall-existing': { price: 375, material: 35, hours: 2 },
    'faucet-install-company-approved': { price: 725, material: 235, hours: 2.5 },
    water_service_bathroom_shower_cartridge_replacement: { price: 425, material: 115, hours: 2 },
    water_service_bathroom_shower_valve_repair: { price: 595, material: 145, hours: 3 },
    water_service_bathroom_shower_valve_replacement: { price: 1195, material: 325, hours: 5.5 },
    water_service_bathroom_tub_shower_valve_replacement: { price: 1195, material: 325, hours: 5.5 },
    water_service_bathroom_tub_spout_replacement: { price: 200, material: 55, hours: 0.75 },
    drain_sewer_whole_home_sewer_line_replacement_linear_foot: { price: 395, material: 125, hours: 1.5 },
    drain_sewer_exterior_main_line_hydro_jetting: { price: 795, material: 35, hours: 4 },
    drain_sewer_exterior_trenchless_sewer_lining_linear_foot: { price: 275, material: 115, hours: 1 },
    drain_sewer_exterior_sewer_spot_repair: { price: 2750, material: 625, hours: 14 },
};

function calculatePlanningRecommendation(catalogItem: PlumbingPriceBookCatalogItem): PlanningRecommendation {
    const override = planningPriceOverrides[catalogItem.price_key];

    if (override) return planningRange(override.price, override.material, override.hours);

    const text = normalizePricingText(`${catalogItem.name} ${catalogItem.category} ${catalogItem.system}`);

    if (catalogItem.unit === 'linear foot') {
        if (text.includes('gas')) return planningRange(85, 25, 0.5);
        if (text.includes('sewer') || text.includes('drain')) return planningRange(325, 110, 1.5);
        return planningRange(225, 75, 1);
    }

    if (text.includes('tankless water heater replacement')) return planningRange(4750, 2100, 10);
    if (text.includes('tank water heater replacement')) return planningRange(2450, 1100, 6.5);
    if (text.includes('water heater')) {
        if (text.includes('flush')) return planningRange(275, 25, 1.5);
        if (text.includes('diagnostic') || text.includes('inspection')) return planningRange(195, 10, 1.25);
        if (text.includes('expansion tank')) return planningRange(395, 110, 1.75);
        if (text.includes('t p valve') || text.includes('drain valve')) return planningRange(345, 75, 1.5);
        if (text.includes('supply line') || text.includes('connector')) return planningRange(325, 85, 1.5);
        if (text.includes('pan') || text.includes('stand') || text.includes('seismic strap')) return planningRange(375, 100, 2);
        if (text.includes('code') || text.includes('permit')) return planningRange(595, 180, 3);
        return planningRange(425, 120, 2);
    }

    if (text.includes('whole home repipe') || text.includes('whole-home repipe')) return planningRange(12950, 3200, 60);
    if (text.includes('partial repipe')) return planningRange(1050, 160, 5);
    if (text.includes('slab leak')) return planningRange(595, 40, 3);
    if (text.includes('main water shutoff') || text.includes('whole home water shutoff')) return planningRange(750, 160, 4);
    if (text.includes('pressure regulator') || text.includes('prv')) return planningRange(795, 225, 4);
    if (text.includes('shower valve')) return planningRange(text.includes('replacement') ? 1195 : 595, text.includes('replacement') ? 325 : 145, text.includes('replacement') ? 5.5 : 3);
    if (text.includes('faucet')) return planningRange(text.includes('repair') ? 295 : 595, text.includes('repair') ? 45 : 195, text.includes('repair') ? 1.5 : 2.5);
    if (text.includes('toilet')) {
        if (text.includes('replacement') || text.includes('installation')) return planningRange(695, 260, 2.5);
        if (text.includes('reset') || text.includes('wax ring')) return planningRange(395, 55, 2);
        if (text.includes('tank rebuild')) return planningRange(425, 95, 2);
        if (text.includes('fill valve') || text.includes('flush valve')) return planningRange(245, 45, 1);
        if (text.includes('flapper') || text.includes('handle')) return planningRange(195, 30, 0.75);
        if (text.includes('stoppage')) return planningRange(225, 15, 1.25);
        return planningRange(245, 45, 1.25);
    }

    if (text.includes('laundry box')) return planningRange(995, 225, 6);
    if (text.includes('angle stop') || text.includes('shutoff') || text.includes('valve replacement')) return planningRange(295, 55, 1.5);
    if (text.includes('supply line') || text.includes('flex connector') || text.includes('hose replacement')) return planningRange(195, 35, 1);
    if (text.includes('garbage disposal')) return planningRange(text.includes('removal') ? 350 : 425, text.includes('removal') ? 70 : 145, 2);
    if (text.includes('p trap') || text.includes('basket') || text.includes('tubular drain')) return planningRange(285, 45, 1.5);
    if (text.includes('hydro jet')) return planningRange(795, 35, 4);
    if (text.includes('camera') || text.includes('video inspection')) return planningRange(325, 25, 2);
    if (text.includes('main line cleanout') || text.includes('main sewer stoppage')) return planningRange(525, 45, 3);
    if (text.includes('stoppage') || text.includes('drain cleaning') || text.includes('floor drain')) return planningRange(295, 20, 1.75);
    if (text.includes('sewer') && text.includes('repair')) return planningRange(2750, 625, 14);
    if (text.includes('gas')) {
        if (text.includes('leak diagnostic') || text.includes('pressure test')) return planningRange(425, 30, 2.5);
        if (text.includes('connection') || text.includes('connector')) return planningRange(325, 75, 1.75);
        if (text.includes('shutoff')) return planningRange(375, 80, 2);
        return planningRange(395, 80, 2);
    }

    if (text.includes('water softener installation')) return planningRange(2950, 1400, 8);
    if (text.includes('whole home filter installation')) return planningRange(2150, 950, 7);
    if (text.includes('reverse osmosis installation')) return planningRange(895, 400, 4);
    if (catalogItem.category === 'Water Quality') return planningRange(text.includes('installation') ? 995 : 325, text.includes('installation') ? 400 : 95, text.includes('installation') ? 4 : 1.5);
    if (catalogItem.category === 'Emergency / After Hours') return planningRange(text.includes('response') ? 395 : 149, 10, text.includes('response') ? 2 : 0.5);
    if (catalogItem.category === 'Diagnostics / Inspections') return planningRange(text.includes('home sale') ? 395 : 195, 10, text.includes('home sale') ? 2.5 : 1.25);
    if (catalogItem.category === 'Drains / Sewer') return planningRange(text.includes('replacement') ? 495 : 325, text.includes('replacement') ? 125 : 45, text.includes('replacement') ? 3 : 2);
    if (catalogItem.category === 'Faucets / Sinks') return planningRange(text.includes('replacement') || text.includes('installation') ? 525 : 295, text.includes('replacement') || text.includes('installation') ? 175 : 45, text.includes('replacement') || text.includes('installation') ? 2 : 1.5);
    if (catalogItem.category === 'Valves / Shutoffs') return planningRange(325, 65, 1.75);
    if (catalogItem.category === 'Laundry / Dishwasher') return planningRange(425, 95, 2.5);
    if (catalogItem.category === 'Fixtures') return planningRange(395, 110, 2);
    if (catalogItem.category === 'Water Service') return planningRange(text.includes('repair') ? 525 : 295, text.includes('repair') ? 100 : 35, text.includes('repair') ? 3 : 1.5);
    if (catalogItem.unit === 'inspection') return planningRange(195, 10, 1.25);
    if (catalogItem.unit === 'other') return planningRange(195, 25, 1);

    return planningRange(295, 55, 1.5);
}

function planningRange(price: number, material: number, hours: number): PlanningRecommendation {
    const recommendedPrice = roundToFive(price);

    return {
        marketLow: recommendedPrice === 0 ? 0 : roundToFive(recommendedPrice * 0.7),
        recommendedPrice,
        marketHigh: recommendedPrice === 0 ? 199 : roundToFive(recommendedPrice * 1.5),
        materialCost: roundToFive(material),
        laborHours: Math.round(Math.max(0, hours) * 4) / 4,
    };
}

function roundToFive(value: number) {
    return Math.max(0, Math.round(value / 5) * 5);
}

function normalizePricingText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const temporaryRiversidePlumbingPrices: TemporaryPlumbingPrice[] =
    plumbingPriceBookCatalogItems.map(buildCatalogPlanningPrice);

const temporaryRiversidePlumbingPriceByKey = new Map(
    temporaryRiversidePlumbingPrices.map((entry) => [entry.priceKey, entry])
);

export function getTemporaryRiversidePlumbingPrice(priceKey: string) {
    return temporaryRiversidePlumbingPriceByKey.get(priceKey) || null;
}

function sanitizeTsvCell(value: string | number) {
    return String(value).replace(/[\t\r\n]+/g, ' ').trim();
}
