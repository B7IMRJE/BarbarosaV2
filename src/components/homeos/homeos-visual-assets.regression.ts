import {
    resolveHomeOSAreaFallbackIcon,
    resolveHomeOSCardSemanticVisual,
    resolveHomeOSEquipmentFallbackIcon,
    resolveHomeOSEquipmentVisual,
    resolveHomeOSFallbackIcon,
    resolveHomeOSSemanticVisual,
    resolveHomeOSVisualSource,
} from './homeos-visual-assets';
import { propertyAreaCatalog } from '../../lib/propertyAreas';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`HomeOS visual asset regression failed: ${message}`);
}

assert(
    resolveHomeOSEquipmentVisual(
        'https://home.test/water-heater.jpg',
        'https://catalog.test/water-heater.jpg'
    )?.uri === 'https://home.test/water-heater.jpg',
    'a homeowner equipment photo must take precedence over a generic catalog image.'
);
assert(
    resolveHomeOSEquipmentVisual('', 'https://catalog.test/water-heater.jpg')?.uri ===
        'https://catalog.test/water-heater.jpg',
    'a catalog image must remain available when an item has no homeowner photo.'
);
assert(
    !resolveHomeOSEquipmentVisual('', ''),
    'the shared fallback icon must be used when neither image is available.'
);

const resolvedMixedAsset = resolveHomeOSVisualSource({
    uri: 'https://home.test/installed-photo.jpg',
    source: { uri: 'https://catalog.test/generic-photo.jpg' },
}) as { uri?: string } | undefined;

assert(
    resolvedMixedAsset?.uri === 'https://home.test/installed-photo.jpg',
    'a homeowner URI must win when a card also has a bundled or catalog source.'
);

const expectedSemanticVisuals = [
    ['My Home', 'area', 'my-home'],
    ['Interior', 'area', 'interior'],
    ['Exterior', 'area', 'exterior'],
    ['Kitchen', 'area', 'kitchen'],
    ['Bathroom', 'area', 'bathroom'],
    ['Bathroom Vanity', 'equipment', 'bathroom-vanity'],
    ['Refrigerator', 'equipment', 'refrigerator'],
    ['Stove / Range', 'equipment', 'stove-range'],
    ['Front Yard', 'area', 'front-yard'],
    ['Backyard', 'area', 'backyard'],
    ['Patio', 'area', 'patio'],
    ['Roof', 'area', 'roof'],
] as const;

const resolvedSemanticVisuals = expectedSemanticVisuals.map(([label, context, expectedKey]) => {
    const visual = resolveHomeOSSemanticVisual(label, context);
    assert(visual?.key === expectedKey, `${label} must resolve through the central semantic illustration map.`);
    assert(Boolean(visual.asset.source), `${label} must resolve to bundled non-generic artwork.`);
    assert(visual.contentFit === 'contain', `${label} artwork must preserve the established cutout treatment.`);
    return visual;
});

assert(
    new Set(resolvedSemanticVisuals.map((visual) => visual.key)).size === resolvedSemanticVisuals.length,
    'Every named review concept must have a distinct semantic visual identity.'
);
assert(
    new Set(resolvedSemanticVisuals.map((visual) => visual.asset.source)).size === resolvedSemanticVisuals.length,
    'Every named review concept must have distinct bundled artwork.'
);

const expectedComponentVisualGroups: Readonly<Record<string, readonly string[]>> = {
    'angle-stop': [
        'Bathroom Sink Hot Angle Stop', 'Bathroom Sink Cold Angle Stop',
        'Kitchen Hot Angle Stop', 'Kitchen Cold Angle Stop',
        'Toilet Shutoff / Angle Stop', 'Dishwasher Shutoff Valve',
        'Refrigerator Shutoff Valve', 'Instant Hot Shutoff Valve',
        'RO Feed Shutoff Valve', 'Water Heater Shutoff Valve',
    ],
    'supply-line': [
        'Bathroom Sink Hot Supply Line', 'Bathroom Sink Cold Supply Line',
        'Kitchen Hot Supply Line', 'Kitchen Cold Supply Line',
        'Toilet Supply Line', 'Dishwasher Supply Line', 'Instant Hot Supply Line',
        'Washer Hot Supply Line', 'Washer Cold Supply Line',
    ],
    'p-trap': ['Bathroom Sink P-Trap', 'Kitchen Sink P-Trap'],
    'sink-pop-up-drain': ['Bathroom Sink Pop-Up / Drain Assembly'],
    'shower-valve': ['Shower Valve'],
    'shower-cartridge': ['Shower Cartridge'],
    'shower-trim': ['Shower Trim'],
    'tub-shower-trim': ['Tub & Shower Trim'],
    'tub-shower-diverter': ['Tub / Shower Diverter'],
    'tub-waste-overflow': ['Tub Waste and Overflow'],
    'toilet-fill-valve': ['Toilet Fill Valve'],
    'toilet-flapper': ['Toilet Flapper'],
    'toilet-tank-bolts': ['Toilet Tank Bolts'],
    'toilet-wax-ring': ['Toilet Wax Ring'],
    'toilet-seat': ['Toilet Seat'],
    'bidet-seat': ['Bidet Seat'],
    'refrigerator-water-line': ['Refrigerator Water Line'],
    'basket-strainer': ['Kitchen Basket Strainer'],
    'disposal-flange': ['Disposal Flange'],
    'dishwasher-drain-hose': ['Dishwasher Drain Hose'],
    'dishwasher-air-gap': ['Dishwasher Air Gap'],
    'refrigerator-filter': ['Refrigerator Water Filter'],
    'ro-sediment-filter': ['RO Sediment Filter'],
    'ro-carbon-prefilter': ['RO Carbon Pre-Filter'],
    'ro-membrane': ['RO Membrane'],
    'ro-post-carbon-filter': ['RO Post-Carbon Filter'],
    'ro-filter-canisters': ['RO Filter Canisters'],
    'ro-storage-tank': ['RO Storage Tank'],
    'water-heater-connections': [
        'Water Heater Cold Water Connection', 'Water Heater Hot Water Connection',
    ],
    'tpr-valve': ['TPR Valve'],
    'tpr-discharge-line': ['TPR Discharge Line'],
    'water-heater-drain-pan': ['Water Heater Drain Pan'],
    'water-heater-drain-valve': ['Water Heater Sediment / Drain Valve'],
    'water-heater-venting': ['Water Heater Venting'],
    'water-heater-gas-connection': ['Water Heater Gas Connection'],
    'water-heater-recirculation-line': ['Water Heater Recirculation Line'],
    'tankless-isolation-valves': ['Tankless Isolation Valve Set'],
    'tankless-condensate-drain': ['Tankless Condensate Drain'],
    'washer-valves': ['Washer Hot Valve', 'Washer Cold Valve'],
    'receptacle-outlet': ['Receptacle / Outlet'],
    'gfci-afci-protection': ['GFCI / AFCI Protection'],
    'switch-dimmer': ['Switch / Dimmer'],
    'dedicated-circuit': ['Dedicated Electrical Circuit'],
    'thermostatic-shower-valve': ['Thermostatic Shower Valve'],
    'toilet-drain': ['Toilet Drain'],
};

const expectedComponentLabels = Object.values(expectedComponentVisualGroups).flat();

assert(expectedComponentLabels.length === 65, 'the complete Component Card catalog must stay under visual coverage.');
assert(
    new Set(expectedComponentLabels).size === expectedComponentLabels.length,
    'the Component Card visual coverage list must not contain duplicate names.'
);

Object.entries(expectedComponentVisualGroups).forEach(([expectedKey, labels]) => {
    labels.forEach((label) => {
        const visual = resolveHomeOSSemanticVisual(label, 'equipment');
        assert(visual?.key === expectedKey, `${label} must resolve to its approved component cutout.`);
        assert(Boolean(visual.asset.source), `${label} must never fall through to a generic Component icon.`);
    });
});

const expectedFixtureVisualGroups: Readonly<Record<string, readonly string[]>> = {
    'bathroom-vanity': ['Bathroom Vanity'],
    'bathroom-sink': ['Bathroom Sink'],
    'bathroom-sink-faucet': ['Bathroom Sink Faucet'],
    'bidet': ['Bidet'],
    'body-sprays': ['Body Sprays'],
    'double-vanity': ['Double Vanity'],
    'exterior-light-fixture': ['Exterior Light Fixture'],
    'freestanding-soaking-tub': ['Freestanding / Soaking Tub'],
    'freestanding-tub-filler': ['Freestanding Tub Filler'],
    'garage-hose-bibb': ['Garage Hose Bibb'],
    'hand-shower': ['Hand Shower'],
    'interior-light-fixture': ['Interior Light Fixture'],
    'kitchen-faucet': ['Kitchen Faucet'],
    'kitchen-sink': ['Kitchen Sink'],
    'kitchen-sink-drain': ['Kitchen Sink Drain'],
    'ro-faucet': ['RO Faucet'],
    'rain-shower-head': ['Rain Shower Head'],
    'roman-deck-mount-tub': ['Roman / Deck-Mount Tub'],
    'roman-tub-filler': ['Roman Tub Filler'],
    'shower-tub-combination': ['Shower / Tub'],
    'shower-drain': ['Shower Drain'],
    'shower-enclosure-door': ['Shower Enclosure / Door'],
    'shower-head': ['Shower Head'],
    'walk-in-shower': ['Standalone / Walk-In Shower', 'Shower'],
    'toilet': ['Toilet'],
    'bathtub': ['Tub'],
    'tub-spout': ['Tub Spout'],
    'washer-drain-standpipe': ['Washer Drain / Standpipe'],
    'kitchen-counter': ['Kitchen Counter'],
};

const expectedFixtureLabels = Object.values(expectedFixtureVisualGroups).flat();

assert(expectedFixtureLabels.length === 30, 'the complete Fixture Card catalog must stay under visual coverage.');
assert(
    new Set(expectedFixtureLabels).size === expectedFixtureLabels.length,
    'the Fixture Card visual coverage list must not contain duplicate names.'
);

Object.entries(expectedFixtureVisualGroups).forEach(([expectedKey, labels]) => {
    labels.forEach((label) => {
        const visual = resolveHomeOSSemanticVisual(label, 'equipment');
        assert(visual?.key === expectedKey, `${label} must resolve to its approved realistic fixture cutout.`);
        assert(Boolean(visual.asset.source), `${label} must never fall through to a generic Fixture icon.`);
    });
});

assert(
    resolveHomeOSSemanticVisual('Dishwasher', 'equipment')?.key === 'dishwasher',
    'the Dishwasher container card must use its approved realistic appliance cutout.'
);

const expectedPlumbingEquipmentVisualGroups: Readonly<Record<string, readonly string[]>> = {
    'garbage-disposal': ['Garbage Disposal'],
    dishwasher: ['Dishwasher'],
    'instant-hot-water-dispenser': ['Instant Hot Water Dispenser'],
    'reverse-osmosis-system': ['Reverse Osmosis System'],
    'water-heater': ['Water Heater'],
    'washer-box-laundry-connections': ['Washer Box / Laundry Connections'],
    'whole-home-filter': ['Whole Home Filter'],
    'expansion-tank': ['Expansion Tank'],
    'water-heater-recirculation-pump': ['Water Heater Recirculation Pump'],
    'main-water-shutoff': ['Main Water Shutoff'],
    'smart-water-shutoff': ['Smart Water Shutoff'],
};

const expectedPlumbingEquipmentLabels = Object.values(expectedPlumbingEquipmentVisualGroups).flat();

assert(
    expectedPlumbingEquipmentLabels.length === 11,
    'the complete current plumbing Equipment Card catalog must stay under realistic visual coverage.'
);
assert(
    new Set(expectedPlumbingEquipmentLabels).size === expectedPlumbingEquipmentLabels.length,
    'the plumbing Equipment Card visual coverage list must not contain duplicate names.'
);

Object.entries(expectedPlumbingEquipmentVisualGroups).forEach(([expectedKey, labels]) => {
    labels.forEach((label) => {
        const visual = resolveHomeOSSemanticVisual(label, 'equipment');
        assert(visual?.key === expectedKey, `${label} must resolve to its approved realistic equipment cutout.`);
        assert(Boolean(visual.asset.source), `${label} must never fall through to a generic Equipment icon.`);
    });
});

assert(
    resolveHomeOSSemanticVisual('Whole Home Filter / Halo 5', 'equipment')?.key === 'whole-home-filter',
    'the established Halo 5 alias must share the Whole Home Filter equipment cutout.'
);
assert(
    resolveHomeOSSemanticVisual('Tank Water Heater', 'equipment')?.key === 'water-heater',
    'a tank-water-heater alias must share the canonical Water Heater equipment cutout.'
);
assert(
    resolveHomeOSCardSemanticVisual('Custom tank part', 'equipment', 'bathroom:toilet_fill_valve')?.key === 'toilet-fill-valve',
    'an installed card must keep the realistic artwork from its permanent Super Admin Deck identity even when its display name changes.'
);
assert(
    resolveHomeOSCardSemanticVisual('My utility equipment', 'equipment', 'garage:water_heater')?.key === 'water-heater',
    'a container instance must resolve artwork from its permanent Deck key before its editable name.'
);

assert(
    !resolveHomeOSSemanticVisual('Custom Reading Nook', 'area'),
    'A custom or unknown record must remain eligible for the conservative generic fallback.'
);

const kitchenAreaIcon = resolveHomeOSAreaFallbackIcon('Kitchen');
const kitchenSinkIcon = resolveHomeOSEquipmentFallbackIcon('Kitchen Sink', kitchenAreaIcon);

assert(resolveHomeOSAreaFallbackIcon('My Home', '🏠') === '🏠', 'a destination card must preserve its explicit Home fallback.');
assert(kitchenSinkIcon !== kitchenAreaIcon, 'an equipment term must win over a supplied room fallback.');
assert(kitchenAreaIcon === '🍳', 'the separate Kitchen area resolver must keep its room icon.');
assert(kitchenSinkIcon === '🚰', 'Kitchen Sink must use a sink icon instead of the Kitchen frying pan.');
assert(resolveHomeOSFallbackIcon('Kitchen Sink') === '🚰', 'the shared fallback resolver must prioritize Sink before Kitchen.');

const expectedAreaIcons: Readonly<Record<string, string>> = {
    Kitchen: '🍳',
    'Living Room': '🛋️',
    'Dining Room': '🍽️',
    Hallway: '🚪',
    Garage: '🚗',
    Laundry: '🧺',
    'Primary Bedroom': '🛏️',
    Bedroom: '🛌',
    'Primary Bathroom': '🛁',
    Bathroom: '🚿',
    Office: '💻',
    Attic: '🪜',
    Basement: '🧱',
    'Utility or Mechanical Room': '⚙️',
    Gym: '🏋️',
    Bar: '🍸',
    Theater: '🎬',
    'Man Cave': '🎮',
    'Wine Room': '🍷',
    'Storage Room': '📦',
    'Interior Walkway': '🚶',
    'Custom Area': '⌂',
    'Front Yard': '🌳',
    Backyard: '🏡',
    'Left Side Yard': '🌿',
    'Right Side Yard': '🌿',
    Patio: '🪑',
    Porch: '🏠',
    Balcony: '🌇',
    Driveway: '🛣️',
    'Pool Area': '🏊',
    'Spa Area': '🫧',
    'BBQ or Outdoor Kitchen': '🍖',
    'Detached Garage': '🚙',
    Shed: '🛖',
    Workshop: '🛠️',
    'Guest House or ADU': '🏘️',
    'Pool House': '🏡',
    Landscaping: '🌱',
    Irrigation: '💦',
    Roof: '🏠',
    'Exterior Mechanical Area': '🌀',
    'Exterior Shutoff Area': '🔧',
    'Custom Exterior Area': '⌂',
};

propertyAreaCatalog.forEach(({ name }) => {
    assert(
        resolveHomeOSAreaFallbackIcon(name) === expectedAreaIcons[name],
        `${name} must have its approved semantic HomeOS scene.`
    );
});
assert(
    resolveHomeOSAreaFallbackIcon('Primary Bedroom 2') === '🛏️',
    'numbered area records must retain their room scene.'
);
assert(
    resolveHomeOSAreaFallbackIcon('Unmapped Custom Space') === '⌂',
    'only a truly custom or unknown area may use the neutral home fallback.'
);

const expectedEquipmentIcons: readonly [label: string, icon: string][] = [
    ['Dishwasher', '🍽️'],
    ['Refrigerator', '🧊'],
    ['Stove', '🍳'],
    ['Kitchen Faucet', '🚰'],
    ['Kitchen Counter', '🪵'],
    ['Kitchen Island', '🪵'],
    ['Bathroom Vanity', '🪞'],
    ['Vanity Mirror', '🪞'],
    ['Double Vanity', '🪞'],
    ['Vanity Sink', '🚰'],
    ['Bathroom Sink', '🚰'],
    ['Medicine Cabinet', '🪞'],
    ['Vanity Lights', '💡'],
    ['Garbage Disposal', '⚙️'],
    ['Lighted Mirror', '🪞'],
    ['Bathroom Lights', '💡'],
    ['Instant Hot Water Dispenser', '♨️'],
    ['Expansion Tank', '🛢️'],
    ['Pressure Regulator Valve', '🎛️'],
    ['Water Meter', '📟'],
    ['Bathroom Exhaust Fan', '💨'],
    ['Thermostat', '🌡️'],
    ['Water Main', '〰️'],
    ['Refrigerator Water Line', '〰️'],
    ['Appliance', '🔌'],
    ['Water Heater', '🛢️'],
    ['Toilet', '🚽'],
    ['Standing Shower', '🚿'],
    ['Roman Tub', '🛁'],
    ['Washing Machine', '🧺'],
    ['Clothes Dryer', '🧺'],
    ['Reverse Osmosis System', '💧'],
    ['Furnace', '❄️'],
    ['Pool', '🏊'],
    ['Pool Pump', '⚙️'],
    ['Smoke Alarm', '🛡️'],
    ['Kitchen Basket Strainer', '🌀'],
    ['Doorbell / Low-Voltage System', '🔔'],
    ['Whole-Home Surge Protector', '⚡'],
    ['Electric Heater', '⚡'],
    ['Body Sprays', '🚿'],
    ['Fixture', '🧰'],
    ['Equipment', '🧰'],
    ['Component', '🧰'],
    ['Air Handler', '❄️'],
    ['Main Electrical Panel', '⚡'],
    ['Irrigation Controller', '🎛️'],
    ['Sump Pump', '⚙️'],
    ['Security Alarm', '🛡️'],
    ['Backflow Preventer', '💧'],
    ['Camera Inspection', '📹'],
    ['Fire Sprinkler Riser', '🚿'],
    ['Sprinkler Head', '💦'],
    ['Rain Sensor', '💦'],
    ['Valve Box', '🗃️'],
    ['Water Closet', '🚽'],
    ['Bed Frame', '🛏️'],
    ['Office Desk', '💻'],
    ['Mechanical Closet', '⚙️'],
    ['Bedroom Closet', '📦'],
    ['Storage Shelving', '📦'],
    ['Office File Cabinet', '🗄️'],
    ['Laundry Sink', '🚰'],
    ['Outdoor Sink', '🚰'],
    ['Shower Enclosure / Door', '🚿'],
    ['Bathroom GFCI Outlet', '⚡'],
    ['Range / Oven Outlet', '⚡'],
    ['Built-in Grill', '🍖'],
    ['Dryer Gas Connection', '〰️'],
    ['Pool Gate / Safety Barrier', '🛡️'],
];

expectedEquipmentIcons.forEach(([label, icon]) => {
    assert(
        resolveHomeOSEquipmentFallbackIcon(label) === icon,
        `${label} must receive its matching shared fallback icon.`
    );
});

assert(
    resolveHomeOSEquipmentFallbackIcon('Refrigerator Water Filter') === '💧',
    'a Filter component must take precedence over its Refrigerator parent term.'
);
assert(
    resolveHomeOSEquipmentFallbackIcon('Dishwasher Shutoff Valve') === '🔧',
    'a Valve component must take precedence over its Dishwasher parent term.'
);
assert(
    resolveHomeOSEquipmentFallbackIcon('Kitchen Sink P-Trap') === '🌀',
    'a P-Trap component must take precedence over Sink and Kitchen terms.'
);
assert(
    resolveHomeOSEquipmentFallbackIcon('Bathroom GFCI Outlet') === '⚡',
    'an electrical item must not inherit the Bathroom area icon.'
);
assert(
    resolveHomeOSEquipmentFallbackIcon('Unmatched Kitchen Component', kitchenAreaIcon) === '🧰',
    'an unmatched equipment or component label must use the neutral equipment fallback, never a room icon.'
);
