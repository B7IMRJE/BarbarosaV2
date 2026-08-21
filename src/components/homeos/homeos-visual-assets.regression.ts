import {
    resolveHomeOSAreaFallbackIcon,
    resolveHomeOSEquipmentFallbackIcon,
    resolveHomeOSEquipmentVisual,
    resolveHomeOSFallbackIcon,
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
    ['Kitchen Counter', '🗄️'],
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
