export type PlumbingSpecificationSuggestion = {
    key: string;
    value: string;
};

export type PlumbingCatalogSuggestions = {
    profileLabel: string;
    specifications: PlumbingSpecificationSuggestion[];
    compatibleApplications: string[];
    installationRequirements: string[];
};

type PlumbingSuggestionProfile = PlumbingCatalogSuggestions & {
    keywords: string[];
};

const COMMON_REQUIREMENTS = [
    'Verify product listing, model compatibility, and manufacturer instructions before installation',
    'Confirm applicable permit, inspection, and local code requirements before final scope approval',
    'Protect the work area and verify accessible water shutoff before starting work',
    'Leak-test accessible water and drain connections before completion',
    'Document concealed, damaged, or noncompliant conditions that change the approved scope',
];

const PROFILES: PlumbingSuggestionProfile[] = [
    {
        profileLabel: 'Tankless water heater',
        keywords: ['tankless', 'on demand water heater', 'on-demand water heater'],
        specifications: [
            spec('Fuel type', 'Natural gas'), spec('Fuel type', 'Propane'), spec('Fuel type', 'Electric'),
            spec('Combustion type', 'Condensing'), spec('Combustion type', 'Non-condensing'),
            spec('Installation location', 'Indoor'), spec('Installation location', 'Outdoor'),
            spec('Water connection size', '3/4 in'), spec('Gas connection size', '3/4 in'),
            spec('Recirculation', 'Built-in recirculation'), spec('Recirculation', 'Recirculation-ready'),
            spec('Venting category', 'Category IV'), spec('Venting category', 'Category III'),
        ],
        compatibleApplications: [
            'Whole-home domestic hot water', 'Like-kind tankless replacement', 'Tank-to-tankless conversion',
            'Indoor installation', 'Outdoor installation', 'Natural gas service', 'Propane service',
            'Dedicated recirculation return', 'Crossover recirculation application',
        ],
        installationRequirements: [
            'Confirm the exact model input rating and size the gas supply using developed length and available pressure',
            'Confirm combustion-air and venting requirements from the exact manufacturer manual',
            'Confirm vent termination clearances from windows, doors, air intakes, meters, and property features',
            'Use only manufacturer-listed vent materials, fittings, adapters, and termination components',
            'For a condensing model, provide an approved condensate drain path and neutralizer when required',
            'For a non-condensing indoor model, verify the manufacturer-listed Category III metal vent system',
            'Install accessible isolation/service valves and flushing ports when required by the approved scope',
            'Verify cold-water inlet filtration and water-quality treatment requirements',
            'Provide the manufacturer-required electrical supply, disconnect, grounding, and receptacle protection',
            'Verify mounting surface, service clearances, freeze protection, and outdoor weather exposure',
            'Commission the unit, verify combustion where required, test operation, and document final settings',
        ],
    },
    {
        profileLabel: 'Tank water heater',
        keywords: ['water heater', 'hot water tank', 'heat pump water heater'],
        specifications: [
            spec('Capacity', '40 gallon'), spec('Capacity', '50 gallon'), spec('Capacity', '75 gallon'),
            spec('Fuel type', 'Natural gas'), spec('Fuel type', 'Propane'), spec('Fuel type', 'Electric'), spec('Fuel type', 'Heat pump'),
            spec('Vent type', 'Atmospheric'), spec('Vent type', 'Direct vent'), spec('Vent type', 'Power vent'),
            spec('Water connection size', '3/4 in'), spec('Voltage', '240 V'),
        ],
        compatibleApplications: [
            'Like-kind tank water heater replacement', 'Gas water heater replacement', 'Electric water heater replacement',
            'Heat pump water heater installation', 'Garage / mechanical room', 'Closet installation', 'Mobile-home listed application',
        ],
        installationRequirements: [
            'Verify capacity, fuel, input rating, vent type, dimensions, and connection locations before ordering',
            'Confirm combustion air, vent connector sizing, draft, and termination requirements for fuel-fired equipment',
            'Verify thermal-expansion control requirements and match expansion-tank precharge to static water pressure',
            'Install an approved drain pan and drain path where leakage could cause damage',
            'Pipe the temperature-and-pressure relief valve discharge to an approved termination without reduction or obstruction',
            'Verify seismic restraint, elevation, bollard, closet, and garage protection requirements where applicable',
            'Verify gas shutoff, sediment trap, connector, leak testing, and available gas pressure where applicable',
            'Verify circuit size, disconnect, grounding, and overcurrent protection for electric equipment',
            'Commission temperature settings and verify safe burner, venting, relief, and heating operation',
        ],
    },
    {
        profileLabel: 'Shower or tub valve',
        keywords: ['shower valve', 'tub valve', 'mixing valve', 'shower trim', 'tub and shower'],
        specifications: [
            spec('Valve type', 'Pressure-balancing'), spec('Valve type', 'Thermostatic'),
            spec('Installation type', 'Retrofit / remodel'), spec('Installation type', 'New rough-in'),
            spec('Trim configuration', 'Shower only'), spec('Trim configuration', 'Tub and shower'),
            spec('Handle configuration', 'Single handle'), spec('Connection size', '1/2 in'),
            spec('Connection type', 'Copper sweat'), spec('Connection type', 'IPS / threaded'), spec('Connection type', 'PEX'),
        ],
        compatibleApplications: [
            'Shower-only installation', 'Tub-and-shower installation', 'Remodel / retrofit opening',
            'Like-kind shower valve replacement', 'Single-handle shower trim',
            'Back-to-back installation', 'Accessible new rough-in installation',
        ],
        installationRequirements: [
            'Identify the exact existing valve body and cartridge platform before selecting trim or retrofit parts',
            'Verify the finished-wall opening is fully covered by the selected remodel plate or trim',
            'Confirm valve-body depth and finished-wall range from the manufacturer instructions',
            'Provide approved access or an approved front-side remodel opening for valve replacement',
            'Secure and support the valve body to prevent movement during operation',
            'Flush supply piping before installing the cartridge and final trim',
            'Pressure-test concealed connections before closing the wall',
            'Seal trim penetrations and escutcheons according to manufacturer instructions',
            'Set the anti-scald limit stop and verify final delivered temperature',
        ],
    },
    {
        profileLabel: 'Faucet or sink fixture',
        keywords: ['faucet', 'lavatory', 'kitchen sink', 'bathroom sink', 'bar sink', 'pot filler'],
        specifications: [
            spec('Mounting type', 'Deck mount'), spec('Mounting type', 'Wall mount'),
            spec('Hole configuration', 'Single hole'), spec('Hole configuration', '3 hole'), spec('Hole configuration', '4 hole'),
            spec('Center spacing', '4 in centerset'), spec('Center spacing', '8 in widespread'),
            spec('Handle configuration', 'Single handle'), spec('Handle configuration', 'Two handle'),
            spec('Supply connection', '3/8 in compression'), spec('Drain size', '1-1/4 in'), spec('Drain size', '1-1/2 in'),
        ],
        compatibleApplications: [
            'Kitchen sink', 'Bathroom lavatory', 'Bar / prep sink', 'Utility sink', 'Single-hole sink deck',
            'Three-hole sink deck', 'Four-hole sink deck', 'Like-kind faucet replacement', 'Retrofit deck plate application',
        ],
        installationRequirements: [
            'Confirm sink-hole count, spacing, deck thickness, and available mounting clearance',
            'Verify hot and cold shutoff valves are accessible and serviceable',
            'Confirm supply-line size, length, connection type, and routing',
            'Verify drain, pop-up, disposal, dishwasher, and accessory compatibility as applicable',
            'Seal the fixture base and penetrations using the manufacturer-approved method',
            'Flush supply lines, clean the aerator, and verify flow and temperature after installation',
        ],
    },
    {
        profileLabel: 'Toilet',
        keywords: ['toilet', 'water closet', 'closet bowl'],
        specifications: [
            spec('Rough-in', '10 in'), spec('Rough-in', '12 in'), spec('Rough-in', '14 in'),
            spec('Bowl shape', 'Elongated'), spec('Bowl shape', 'Round front'),
            spec('Height', 'Comfort / chair height'), spec('Flush type', 'Gravity'), spec('Flush type', 'Pressure assist'),
            spec('Configuration', 'Two piece'), spec('Configuration', 'One piece'), spec('Outlet', 'Floor outlet'), spec('Outlet', 'Rear outlet'),
        ],
        compatibleApplications: [
            'Standard residential bathroom', 'Like-kind toilet replacement', 'Elongated-bowl clearance',
            'Round-front clearance', 'Comfort-height application', 'Pressure-assist replacement', 'Rear-outlet application',
        ],
        installationRequirements: [
            'Measure the finished-wall-to-flange rough-in and verify side and front clearances',
            'Inspect flange height, anchoring, condition, and surrounding floor before installation',
            'Verify shutoff valve condition, supply size, and fill-valve connection compatibility',
            'Use an approved bowl seal matched to the flange and floor condition',
            'Shim and secure the bowl without rocking or overstressing the china',
            'Verify fill level, flush performance, leaks, and final caulking requirements',
        ],
    },
    {
        profileLabel: 'Garbage disposal',
        keywords: ['garbage disposal', 'food waste disposer', 'disposer'],
        specifications: [
            spec('Motor', '1/3 HP'), spec('Motor', '1/2 HP'), spec('Motor', '3/4 HP'), spec('Motor', '1 HP'),
            spec('Feed type', 'Continuous feed'), spec('Feed type', 'Batch feed'), spec('Voltage', '120 V'),
            spec('Mounting system', '3-bolt mount'), spec('Dishwasher connection', 'Included'),
        ],
        compatibleApplications: [
            'Standard kitchen sink', 'Continuous-feed replacement', 'Batch-feed replacement',
            'Dishwasher connection', 'Septic-conscious application', 'Like-kind disposal replacement',
        ],
        installationRequirements: [
            'Confirm sink-flange opening, mounting system, cabinet clearance, and drain alignment',
            'Verify branch-circuit, switch, cord, grounding, and receptacle requirements',
            'Remove the dishwasher inlet knockout only when connecting a dishwasher drain',
            'Verify dishwasher high loop or air-gap requirements for the jurisdiction',
            'Support and align the trap arm without placing strain on the disposal outlet',
            'Leak-test the sink flange, dishwasher connection, and drain connections and verify operation',
        ],
    },
    {
        profileLabel: 'Pressure regulator, backflow, or shutoff valve',
        keywords: ['prv', 'pressure regulator', 'pressure reducing', 'backflow', 'shutoff', 'ball valve', 'gate valve', 'check valve'],
        specifications: [
            spec('Nominal size', '1/2 in'), spec('Nominal size', '3/4 in'), spec('Nominal size', '1 in'), spec('Nominal size', '1-1/4 in'),
            spec('Connection type', 'Threaded'), spec('Connection type', 'Copper sweat'), spec('Connection type', 'Press'), spec('Connection type', 'PEX'),
            spec('Valve body', 'Lead-free brass'), spec('Serviceability', 'Replaceable cartridge / strainer'),
        ],
        compatibleApplications: [
            'Main water service', 'Branch isolation', 'Pressure regulation', 'Irrigation backflow protection',
            'Potable water application', 'Like-kind valve replacement', 'Accessible above-ground installation',
        ],
        installationRequirements: [
            'Verify pipe size, material, direction of flow, pressure rating, and listed application',
            'Measure static and flowing pressure before final product selection',
            'Provide accessible isolation and service clearance',
            'Support adjacent piping so the valve body does not carry piping load',
            'Verify thermal-expansion control after changing or adding a check valve or pressure regulator',
            'Test, certify, tag, or report the assembly when required by the authority having jurisdiction',
        ],
    },
    {
        profileLabel: 'Expansion tank',
        keywords: ['expansion tank', 'thermal expansion'],
        specifications: [
            spec('System type', 'Potable water'), spec('Connection size', '3/4 in'),
            spec('Orientation', 'Manufacturer-approved orientation'), spec('Diaphragm', 'Butyl'),
            spec('Listing', 'NSF / potable water listed'),
        ],
        compatibleApplications: [
            'Closed domestic water system', 'Tank water heater', 'Tankless water heater when required',
            'Pressure-regulated water service', 'Backflow-protected water service',
        ],
        installationRequirements: [
            'Size the expansion tank using water-heater capacity, supply temperature, and system pressure',
            'Measure static water pressure and set tank precharge before connecting it to the system',
            'Install on the cold-water side at a manufacturer-approved location without an intervening check valve',
            'Support the tank and piping independently when required by tank size and orientation',
            'Verify system pressure after heating and confirm the relief valve does not discharge',
        ],
    },
    {
        profileLabel: 'Pump',
        keywords: ['sump pump', 'sewage pump', 'ejector pump', 'recirculation pump', 'circulator pump', 'condensate pump'],
        specifications: [
            spec('Pump type', 'Sump'), spec('Pump type', 'Sewage ejector'), spec('Pump type', 'Hot-water recirculation'),
            spec('Voltage', '120 V'), spec('Voltage', '240 V'), spec('Switch type', 'Integral float'), spec('Switch type', 'External float'),
            spec('Discharge size', '1-1/2 in'), spec('Discharge size', '2 in'),
        ],
        compatibleApplications: [
            'Groundwater sump basin', 'Sewage ejector basin', 'Domestic hot-water recirculation',
            'Like-kind pump replacement', 'Battery-backup application', 'Dedicated return recirculation',
        ],
        installationRequirements: [
            'Verify pump duty, design flow, total dynamic head, solids handling, and temperature rating',
            'Confirm basin size, lid, venting, inlet, discharge, and service access',
            'Install the manufacturer-required check valve, isolation, and union where applicable',
            'Verify dedicated electrical, grounding, receptacle, alarm, and GFCI requirements',
            'Route discharge to an approved location with freeze protection and no prohibited cross-connection',
            'Wet-test operation, controls, alarms, check valve, and discharge piping',
        ],
    },
    {
        profileLabel: 'Water treatment',
        keywords: ['softener', 'filter', 'filtration', 'reverse osmosis', 'ro system', 'conditioner', 'halo'],
        specifications: [
            spec('Treatment type', 'Water softener'), spec('Treatment type', 'Whole-home filtration'), spec('Treatment type', 'Reverse osmosis'),
            spec('Connection size', '3/4 in'), spec('Connection size', '1 in'), spec('Drain required', 'Yes'),
            spec('Electrical supply', '120 V'), spec('Bypass valve', 'Included'),
        ],
        compatibleApplications: [
            'Whole-home cold-water treatment', 'Point-of-use drinking water', 'Municipal water', 'Private well water',
            'Hard-water treatment', 'Chlorine reduction', 'Dedicated drinking-water faucet', 'Refrigerator connection',
        ],
        installationRequirements: [
            'Obtain or review water-quality test results before selecting treatment equipment',
            'Verify service flow, pressure, pipe size, fixture count, capacity, and regeneration demand',
            'Provide an accessible bypass and service clearance around replaceable media or filters',
            'Provide an approved air-gapped drain receptor for backwash, regeneration, or RO reject water',
            'Verify electrical supply, freeze protection, floor protection, and equipment anchoring',
            'Sanitize, flush, test, and document startup settings according to manufacturer instructions',
        ],
    },
    {
        profileLabel: 'Drain or sewer product',
        keywords: ['drain', 'sewer', 'cleanout', 'trap', 'floor drain', 'backwater valve'],
        specifications: [
            spec('Nominal size', '1-1/4 in'), spec('Nominal size', '1-1/2 in'), spec('Nominal size', '2 in'),
            spec('Nominal size', '3 in'), spec('Nominal size', '4 in'), spec('Material', 'PVC'), spec('Material', 'ABS'),
            spec('Material', 'Cast iron'), spec('Connection type', 'Solvent weld'), spec('Connection type', 'Shielded coupling'),
        ],
        compatibleApplications: [
            'Kitchen drain', 'Bathroom drain', 'Laundry drain', 'Building drain', 'Building sewer',
            'Cleanout access', 'Like-kind drain replacement', 'Backwater protection',
        ],
        installationRequirements: [
            'Verify pipe size, material, condition, direction of flow, and accessible connection points',
            'Confirm required slope, support, cleanouts, venting, and transition fittings',
            'Use listed transition couplings matched to both pipe materials and the installation location',
            'Camera-inspect or expose concealed piping when the condition or routing cannot be verified',
            'Perform an approved leak, flow, or water test before concealment where required',
        ],
    },
    {
        profileLabel: 'General plumbing product',
        keywords: [],
        specifications: [
            spec('Nominal size', '1/2 in'), spec('Nominal size', '3/4 in'), spec('Nominal size', '1 in'),
            spec('Connection type', 'Threaded'), spec('Connection type', 'Copper sweat'), spec('Connection type', 'Press'), spec('Connection type', 'PEX'),
            spec('Application', 'Potable water'), spec('Application', 'Drain / waste / vent'),
        ],
        compatibleApplications: [
            'Residential service and repair', 'Like-kind replacement', 'New installation', 'Retrofit installation',
            'Potable water system', 'Drain / waste / vent system', 'Accessible interior installation', 'Exterior installation when product is listed',
        ],
        installationRequirements: [],
    },
];

export function getPlumbingCatalogSuggestions(input: {
    category: string;
    productName?: string;
    brand?: string;
    model?: string;
}): PlumbingCatalogSuggestions {
    const searchText = [input.category, input.productName, input.brand, input.model].join(' ').toLowerCase();
    const profile = PROFILES.find((candidate) => candidate.keywords.some((keyword) => searchText.includes(keyword)))
        || PROFILES[PROFILES.length - 1];
    const moenShower = searchText.includes('moen') && profile.profileLabel === 'Shower or tub valve';
    const brandSpecific = moenShower
        ? [
            spec('Cartridge platform', 'Moen Posi-Temp'),
            spec('Cartridge platform', 'Moen M-CORE'),
            spec('Retrofit option', 'Moen remodel / cover plate'),
        ]
        : [];

    return {
        profileLabel: profile.profileLabel,
        specifications: uniqueSpecifications([...profile.specifications, ...brandSpecific]),
        compatibleApplications: uniqueStrings([
            ...profile.compatibleApplications,
            ...(moenShower ? ['Existing Moen valve body'] : []),
        ]),
        installationRequirements: uniqueStrings([...profile.installationRequirements, ...COMMON_REQUIREMENTS]),
    };
}

function spec(key: string, value: string): PlumbingSpecificationSuggestion {
    return { key, value };
}

function uniqueSpecifications(items: PlumbingSpecificationSuggestion[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = `${item.key.toLowerCase()}\u0000${item.value.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function uniqueStrings(items: string[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
