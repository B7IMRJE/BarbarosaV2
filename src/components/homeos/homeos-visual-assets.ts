import type { ImageSourcePropType } from 'react-native';
import { getAreaIcon } from '../../lib/systemDefaults';

export type HomeOSVisualAsset = {
    source?: ImageSourcePropType;
    uri?: string | null;
};

export type HomeOSSemanticVisual = {
    key: string;
    asset: HomeOSVisualAsset;
    contentFit: 'contain';
};

type HomeOSEquipmentIconRule = {
    icon: string;
    terms: readonly string[];
};

type HomeOSAreaIconRule = {
    icon: string;
    terms: readonly string[];
};

type HomeOSSemanticVisualRule = {
    key: string;
    terms: readonly string[];
    asset: HomeOSVisualAsset;
};

const HOME_OS_AREA_VISUAL_RULES: readonly HomeOSSemanticVisualRule[] = [
    semanticVisual('my-home', ['my home', 'whole home'], bundledAsset('my-home', () => require('../../../assets/homeos/destinations/home.png'))),
    semanticVisual('interior', ['interior'], bundledAsset('interior', () => require('../../../assets/homeos/illustrations/interior.png'))),
    semanticVisual('exterior', ['exterior'], bundledAsset('exterior', () => require('../../../assets/homeos/destinations/exterior.png'))),
    semanticVisual('kitchen', ['kitchen'], bundledAsset('kitchen', () => require('../../../assets/homeos/illustrations/kitchen.png'))),
    semanticVisual('bathroom', ['primary bathroom', 'master bathroom', 'primary bath', 'bathroom', 'bath'], bundledAsset('bathroom', () => require('../../../assets/homeos/illustrations/bathroom.png'))),
    semanticVisual('front-yard', ['front yard'], bundledAsset('front-yard', () => require('../../../assets/homeos/illustrations/front-yard.png'))),
    semanticVisual('backyard', ['backyard', 'back yard'], bundledAsset('backyard', () => require('../../../assets/homeos/illustrations/backyard.png'))),
    semanticVisual('patio', ['patio', 'deck'], bundledAsset('patio', () => require('../../../assets/homeos/illustrations/patio.png'))),
    semanticVisual('roof', ['roof'], bundledAsset('roof', () => require('../../../assets/homeos/illustrations/roof.png'))),
];

const HOME_OS_FIXTURE_VISUAL_RULES: readonly HomeOSSemanticVisualRule[] = [
    semanticVisual('bathroom-sink-faucet', ['bathroom sink faucet', 'bathroom faucet', 'lavatory faucet'], bundledAsset('bathroom-sink-faucet', () => require('../../../assets/homeos/fixtures/bathroom-sink-faucet.png'))),
    semanticVisual('bathroom-sink', ['bathroom sink', 'vanity sink', 'lavatory sink'], bundledAsset('bathroom-sink', () => require('../../../assets/homeos/fixtures/bathroom-sink.png'))),
    semanticVisual('toilet', ['toilet', 'water closet'], bundledAsset('toilet', () => require('../../../assets/homeos/fixtures/toilet.png'))),
    semanticVisual('rain-shower-head', ['rain shower head', 'rain shower'], bundledAsset('rain-shower-head', () => require('../../../assets/homeos/fixtures/rain-shower-head.png'))),
    semanticVisual('hand-shower', ['hand shower', 'handheld shower head', 'handheld shower'], bundledAsset('hand-shower', () => require('../../../assets/homeos/fixtures/hand-shower.png'))),
    semanticVisual('body-sprays', ['body sprays', 'shower body sprays', 'body jets'], bundledAsset('body-sprays', () => require('../../../assets/homeos/fixtures/body-sprays.png'))),
    semanticVisual('shower-head', ['shower head', 'showerhead'], bundledAsset('shower-head', () => require('../../../assets/homeos/fixtures/shower-head.png'))),
    semanticVisual('shower-enclosure-door', ['shower enclosure door', 'shower enclosure', 'shower door'], bundledAsset('shower-enclosure-door', () => require('../../../assets/homeos/fixtures/shower-enclosure-door.png'))),
    semanticVisual('shower-drain', ['shower drain', 'shower tub drain'], bundledAsset('shower-drain', () => require('../../../assets/homeos/fixtures/shower-drain.png'))),
    semanticVisual('tub-spout', ['tub spout'], bundledAsset('tub-spout', () => require('../../../assets/homeos/fixtures/tub-spout.png'))),
    semanticVisual('shower-tub-combination', ['shower tub', 'tub shower combination', 'shower tub combination'], bundledAsset('shower-tub-combination', () => require('../../../assets/homeos/fixtures/shower-tub-combination.png'))),
    semanticVisual('roman-deck-mount-tub', ['roman deck mount tub', 'deck mount tub', 'roman tub'], bundledAsset('roman-deck-mount-tub', () => require('../../../assets/homeos/fixtures/roman-deck-mount-tub.png'))),
    semanticVisual('freestanding-soaking-tub', ['freestanding soaking tub', 'freestanding tub', 'soaking tub'], bundledAsset('freestanding-soaking-tub', () => require('../../../assets/homeos/fixtures/freestanding-soaking-tub.png'))),
    semanticVisual('walk-in-shower', ['standalone walk in shower', 'walk in shower', 'standalone shower', 'standing shower', 'shower'], bundledAsset('walk-in-shower', () => require('../../../assets/homeos/fixtures/walk-in-shower.png'))),
    semanticVisual('bathtub', ['standard bathtub', 'bathtub', 'tub'], bundledAsset('bathtub', () => require('../../../assets/homeos/fixtures/bathtub.png'))),
    semanticVisual('kitchen-sink-drain', ['kitchen sink drain', 'kitchen drain', 'sink drain'], bundledAsset('kitchen-sink-drain', () => require('../../../assets/homeos/fixtures/kitchen-sink-drain.png'))),
    semanticVisual('kitchen-sink', ['kitchen sink'], bundledAsset('kitchen-sink', () => require('../../../assets/homeos/fixtures/kitchen-sink.png'))),
    semanticVisual('kitchen-faucet', ['kitchen faucet'], bundledAsset('kitchen-faucet', () => require('../../../assets/homeos/fixtures/kitchen-faucet.png'))),
    semanticVisual('ro-faucet', ['ro faucet', 'reverse osmosis faucet'], bundledAsset('ro-faucet', () => require('../../../assets/homeos/fixtures/ro-faucet.png'))),
    semanticVisual('garage-hose-bibb', ['garage hose bibb', 'garage hose bib', 'hose bibb', 'hose bib'], bundledAsset('garage-hose-bibb', () => require('../../../assets/homeos/fixtures/garage-hose-bibb.png'))),
    semanticVisual('washer-drain-standpipe', ['washer drain standpipe', 'washer drain', 'laundry standpipe'], bundledAsset('washer-drain-standpipe', () => require('../../../assets/homeos/fixtures/washer-drain-standpipe.png'))),
    semanticVisual('double-vanity', ['double vanity', 'dual vanity', 'two sink vanity'], bundledAsset('double-vanity', () => require('../../../assets/homeos/fixtures/double-vanity.png'))),
    semanticVisual('bidet', ['bidet fixture', 'bidet'], bundledAsset('bidet', () => require('../../../assets/homeos/fixtures/bidet.png'))),
    semanticVisual('roman-tub-filler', ['roman tub filler', 'deck mount tub filler'], bundledAsset('roman-tub-filler', () => require('../../../assets/homeos/fixtures/roman-tub-filler.png'))),
    semanticVisual('freestanding-tub-filler', ['freestanding tub filler', 'floor mount tub filler'], bundledAsset('freestanding-tub-filler', () => require('../../../assets/homeos/fixtures/freestanding-tub-filler.png'))),
    semanticVisual('interior-light-fixture', ['interior light fixture', 'interior lighting'], bundledAsset('interior-light-fixture', () => require('../../../assets/homeos/fixtures/interior-light-fixture.png'))),
    semanticVisual('exterior-light-fixture', ['exterior light fixture', 'exterior lighting'], bundledAsset('exterior-light-fixture', () => require('../../../assets/homeos/fixtures/exterior-light-fixture.png'))),
    semanticVisual('kitchen-counter', ['kitchen counter', 'kitchen countertop', 'countertop'], bundledAsset('kitchen-counter', () => require('../../../assets/homeos/fixtures/kitchen-counter.png'))),
    semanticVisual('dishwasher', ['dishwasher'], bundledAsset('dishwasher', () => require('../../../assets/homeos/fixtures/dishwasher.png'))),
];

const HOME_OS_PLUMBING_EQUIPMENT_VISUAL_RULES: readonly HomeOSSemanticVisualRule[] = [
    semanticVisual('garbage-disposal', ['garbage disposal', 'food waste disposer'], bundledAsset('garbage-disposal', () => require('../../../assets/homeos/equipment/garbage-disposal.png'))),
    semanticVisual('instant-hot-water-dispenser', ['instant hot water dispenser', 'hot water dispenser'], bundledAsset('instant-hot-water-dispenser', () => require('../../../assets/homeos/equipment/instant-hot-water-dispenser.png'))),
    semanticVisual('reverse-osmosis-system', ['reverse osmosis system', 'ro system'], bundledAsset('reverse-osmosis-system', () => require('../../../assets/homeos/equipment/reverse-osmosis-system.png'))),
    semanticVisual('washer-box-laundry-connections', ['washer box laundry connections', 'washer box', 'laundry connections', 'washing machine box'], bundledAsset('washer-box-laundry-connections', () => require('../../../assets/homeos/equipment/washer-box-laundry-connections.png'))),
    semanticVisual('whole-home-filter', ['whole home filter halo 5', 'whole home filter', 'whole house filter', 'halo 5'], bundledAsset('whole-home-filter', () => require('../../../assets/homeos/equipment/whole-home-filter.png'))),
    semanticVisual('expansion-tank', ['expansion tank'], bundledAsset('expansion-tank', () => require('../../../assets/homeos/equipment/expansion-tank.png'))),
    semanticVisual('water-heater-recirculation-pump', ['water heater recirculation pump', 'recirculation pump'], bundledAsset('water-heater-recirculation-pump', () => require('../../../assets/homeos/equipment/water-heater-recirculation-pump.png'))),
    semanticVisual('water-heater', ['storage water heater', 'tank water heater', 'water heater'], bundledAsset('water-heater', () => require('../../../assets/homeos/equipment/water-heater.png'))),
    semanticVisual('main-water-shutoff', ['whole home water shutoff', 'main water shutoff valve', 'main water shutoff', 'main water valve', 'front yard main water valve'], bundledAsset('main-water-shutoff', () => require('../../../assets/homeos/equipment/main-water-shutoff.png'))),
    semanticVisual('smart-water-shutoff', ['smart water monitor and shutoff', 'automatic smart water shutoff', 'whole home smart water shutoff', 'smart water shutoff'], bundledAsset('smart-water-shutoff', () => require('../../../assets/homeos/equipment/smart-water-shutoff.png'))),
];

const HOME_OS_EQUIPMENT_VISUAL_RULES: readonly HomeOSSemanticVisualRule[] = [
    ...HOME_OS_FIXTURE_VISUAL_RULES,
    ...HOME_OS_PLUMBING_EQUIPMENT_VISUAL_RULES,
    semanticVisual('angle-stop', [
        'bathroom sink hot angle stop', 'bathroom sink cold angle stop',
        'kitchen hot angle stop', 'kitchen cold angle stop',
        'toilet shutoff angle stop', 'dishwasher shutoff valve',
        'refrigerator shutoff valve', 'instant hot shutoff valve',
        'ro feed shutoff valve', 'water heater shutoff valve',
    ], bundledAsset('angle-stop', () => require('../../../assets/homeos/components/angle-stop.png'))),
    semanticVisual('supply-line', [
        'bathroom sink hot supply line', 'bathroom sink cold supply line',
        'kitchen hot supply line', 'kitchen cold supply line',
        'toilet supply line', 'dishwasher supply line', 'instant hot supply line',
        'washer hot supply line', 'washer cold supply line',
    ], bundledAsset('supply-line', () => require('../../../assets/homeos/components/supply-line.png'))),
    semanticVisual('p-trap', ['bathroom sink p trap', 'kitchen sink p trap'], bundledAsset('p-trap', () => require('../../../assets/homeos/components/p-trap.png'))),
    semanticVisual('sink-pop-up-drain', ['bathroom sink pop up drain assembly'], bundledAsset('sink-pop-up-drain', () => require('../../../assets/homeos/components/sink-pop-up-drain.png'))),
    semanticVisual('shower-valve', ['shower valve'], bundledAsset('shower-valve', () => require('../../../assets/homeos/components/shower-valve.png'))),
    semanticVisual('shower-cartridge', ['shower cartridge'], bundledAsset('shower-cartridge', () => require('../../../assets/homeos/components/shower-cartridge.png'))),
    semanticVisual('shower-trim', ['shower trim'], bundledAsset('shower-trim', () => require('../../../assets/homeos/components/shower-trim.png'))),
    semanticVisual('tub-shower-trim', ['tub shower trim'], bundledAsset('tub-shower-trim', () => require('../../../assets/homeos/components/tub-shower-trim.png'))),
    semanticVisual('tub-shower-diverter', ['tub shower diverter'], bundledAsset('tub-shower-diverter', () => require('../../../assets/homeos/components/tub-shower-diverter.png'))),
    semanticVisual('tub-waste-overflow', ['tub waste and overflow'], bundledAsset('tub-waste-overflow', () => require('../../../assets/homeos/components/tub-waste-overflow.png'))),
    semanticVisual('toilet-fill-valve', ['toilet fill valve'], bundledAsset('toilet-fill-valve', () => require('../../../assets/homeos/components/toilet-fill-valve.png'))),
    semanticVisual('toilet-flapper', ['toilet flapper'], bundledAsset('toilet-flapper', () => require('../../../assets/homeos/components/toilet-flapper.png'))),
    semanticVisual('toilet-tank-bolts', ['toilet tank bolts'], bundledAsset('toilet-tank-bolts', () => require('../../../assets/homeos/components/toilet-tank-bolts.png'))),
    semanticVisual('toilet-wax-ring', ['toilet wax ring'], bundledAsset('toilet-wax-ring', () => require('../../../assets/homeos/components/toilet-wax-ring.png'))),
    semanticVisual('toilet-seat', ['toilet seat'], bundledAsset('toilet-seat', () => require('../../../assets/homeos/components/toilet-seat.png'))),
    semanticVisual('bidet-seat', ['bidet seat'], bundledAsset('bidet-seat', () => require('../../../assets/homeos/components/bidet-seat.png'))),
    semanticVisual('refrigerator-water-line', ['refrigerator water line'], bundledAsset('refrigerator-water-line', () => require('../../../assets/homeos/components/refrigerator-water-line.png'))),
    semanticVisual('basket-strainer', ['kitchen basket strainer'], bundledAsset('basket-strainer', () => require('../../../assets/homeos/components/basket-strainer.png'))),
    semanticVisual('disposal-flange', ['disposal flange'], bundledAsset('disposal-flange', () => require('../../../assets/homeos/components/disposal-flange.png'))),
    semanticVisual('dishwasher-drain-hose', ['dishwasher drain hose'], bundledAsset('dishwasher-drain-hose', () => require('../../../assets/homeos/components/dishwasher-drain-hose.png'))),
    semanticVisual('dishwasher-air-gap', ['dishwasher air gap'], bundledAsset('dishwasher-air-gap', () => require('../../../assets/homeos/components/dishwasher-air-gap.png'))),
    semanticVisual('refrigerator-filter', ['refrigerator water filter'], bundledAsset('refrigerator-filter', () => require('../../../assets/homeos/components/refrigerator-filter.png'))),
    semanticVisual('ro-sediment-filter', ['ro sediment filter'], bundledAsset('ro-sediment-filter', () => require('../../../assets/homeos/components/ro-sediment-filter.png'))),
    semanticVisual('ro-carbon-prefilter', ['ro carbon pre filter'], bundledAsset('ro-carbon-prefilter', () => require('../../../assets/homeos/components/ro-carbon-prefilter.png'))),
    semanticVisual('ro-membrane', ['ro membrane'], bundledAsset('ro-membrane', () => require('../../../assets/homeos/components/ro-membrane.png'))),
    semanticVisual('ro-post-carbon-filter', ['ro post carbon filter'], bundledAsset('ro-post-carbon-filter', () => require('../../../assets/homeos/components/ro-post-carbon-filter.png'))),
    semanticVisual('ro-filter-canisters', ['ro filter canisters'], bundledAsset('ro-filter-canisters', () => require('../../../assets/homeos/components/ro-filter-canisters.png'))),
    semanticVisual('ro-storage-tank', ['ro storage tank'], bundledAsset('ro-storage-tank', () => require('../../../assets/homeos/components/ro-storage-tank.png'))),
    semanticVisual('water-heater-connections', [
        'water heater cold water connection', 'water heater hot water connection',
    ], bundledAsset('water-heater-connections', () => require('../../../assets/homeos/components/water-heater-connections.png'))),
    semanticVisual('tpr-valve', ['tpr valve'], bundledAsset('tpr-valve', () => require('../../../assets/homeos/components/tpr-valve.png'))),
    semanticVisual('tpr-discharge-line', ['tpr discharge line'], bundledAsset('tpr-discharge-line', () => require('../../../assets/homeos/components/tpr-discharge-line.png'))),
    semanticVisual('water-heater-drain-pan', ['water heater drain pan'], bundledAsset('water-heater-drain-pan', () => require('../../../assets/homeos/components/water-heater-drain-pan.png'))),
    semanticVisual('water-heater-drain-valve', ['water heater sediment drain valve'], bundledAsset('water-heater-drain-valve', () => require('../../../assets/homeos/components/water-heater-drain-valve.png'))),
    semanticVisual('water-heater-venting', ['water heater venting'], bundledAsset('water-heater-venting', () => require('../../../assets/homeos/components/water-heater-venting.png'))),
    semanticVisual('water-heater-gas-connection', ['water heater gas connection'], bundledAsset('water-heater-gas-connection', () => require('../../../assets/homeos/components/water-heater-gas-connection.png'))),
    semanticVisual('water-heater-recirculation-line', ['water heater recirculation line'], bundledAsset('water-heater-recirculation-line', () => require('../../../assets/homeos/components/water-heater-recirculation-line.png'))),
    semanticVisual('tankless-isolation-valves', ['tankless isolation valve set'], bundledAsset('tankless-isolation-valves', () => require('../../../assets/homeos/components/tankless-isolation-valves.png'))),
    semanticVisual('tankless-condensate-drain', ['tankless condensate drain'], bundledAsset('tankless-condensate-drain', () => require('../../../assets/homeos/components/tankless-condensate-drain.png'))),
    semanticVisual('washer-valves', ['washer hot valve', 'washer cold valve'], bundledAsset('washer-valves', () => require('../../../assets/homeos/components/washer-valves.png'))),
    semanticVisual('receptacle-outlet', ['receptacle outlet'], bundledAsset('receptacle-outlet', () => require('../../../assets/homeos/components/receptacle-outlet.png'))),
    semanticVisual('gfci-afci-protection', ['gfci afci protection'], bundledAsset('gfci-afci-protection', () => require('../../../assets/homeos/components/gfci-afci-protection.png'))),
    semanticVisual('switch-dimmer', ['switch dimmer'], bundledAsset('switch-dimmer', () => require('../../../assets/homeos/components/switch-dimmer.png'))),
    semanticVisual('dedicated-circuit', ['dedicated electrical circuit'], bundledAsset('dedicated-circuit', () => require('../../../assets/homeos/components/dedicated-circuit.png'))),
    semanticVisual('thermostatic-shower-valve', ['thermostatic shower valve'], bundledAsset('thermostatic-shower-valve', () => require('../../../assets/homeos/components/thermostatic-shower-valve.png'))),
    semanticVisual('toilet-drain', ['toilet drain'], bundledAsset('toilet-drain', () => require('../../../assets/homeos/components/toilet-drain.png'))),
    semanticVisual('bathroom-vanity', ['bathroom vanity', 'double vanity', 'dual vanity', 'two sink vanity', 'vanity'], bundledAsset('bathroom-vanity', () => require('../../../assets/homeos/illustrations/bathroom-vanity.png'))),
    semanticVisual('refrigerator', ['refrigerator', 'fridge', 'freezer'], bundledAsset('refrigerator', () => require('../../../assets/homeos/illustrations/refrigerator.png'))),
    semanticVisual('stove-range', ['stove', 'range', 'oven', 'cooktop'], bundledAsset('stove-range', () => require('../../../assets/homeos/illustrations/stove-range.png'))),
];

/**
 * HomeOS room and zone scenes. Keep this list close to the area catalog: it is
 * deliberately the one semantic source for active-area and Add Area cards.
 * Custom names intentionally fall through to the neutral home glyph.
 */
const HOME_OS_AREA_ICON_RULES: readonly HomeOSAreaIconRule[] = [
    { icon: '🏠', terms: ['whole home'] },
    { icon: '🍳', terms: ['kitchen'] },
    { icon: '🛋️', terms: ['living room', 'living'] },
    { icon: '🍽️', terms: ['dining room', 'dining'] },
    { icon: '🚪', terms: ['hallway', 'hall', 'foyer'] },
    { icon: '🚗', terms: ['attached garage', 'garage'] },
    { icon: '🧺', terms: ['laundry room', 'laundry'] },
    { icon: '🛏️', terms: ['primary bedroom', 'master bedroom', 'primary suite'] },
    { icon: '🛌', terms: ['bedroom', 'bedrooms'] },
    { icon: '🛁', terms: ['primary bathroom', 'master bathroom', 'primary bath'] },
    { icon: '🚿', terms: ['bathroom', 'bathrooms', 'bath'] },
    { icon: '💻', terms: ['office', 'study'] },
    { icon: '🪜', terms: ['attic'] },
    { icon: '🧱', terms: ['basement', 'crawlspace', 'crawl space'] },
    { icon: '🔥', terms: ['fireplace'] },
    { icon: '⚙️', terms: ['utility or mechanical room', 'utility mechanical room', 'utility room', 'mechanical room', 'mechanical'] },
    { icon: '🏋️', terms: ['gym', 'fitness room'] },
    { icon: '🍸', terms: ['bar'] },
    { icon: '🎬', terms: ['theater', 'media room'] },
    { icon: '🎮', terms: ['man cave', 'game room'] },
    { icon: '🍷', terms: ['wine room', 'wine cellar'] },
    { icon: '📦', terms: ['storage room', 'storage', 'closet'] },
    { icon: '🚶', terms: ['interior walkway', 'walkway', 'walk way'] },
    { icon: '🌳', terms: ['front yard'] },
    { icon: '🏡', terms: ['backyard', 'back yard'] },
    { icon: '🏡', terms: ['exterior'] },
    { icon: '🌿', terms: ['left side yard', 'right side yard', 'side yard'] },
    { icon: '🪑', terms: ['patio', 'deck'] },
    { icon: '🏠', terms: ['porch'] },
    { icon: '🌇', terms: ['balcony'] },
    { icon: '🛣️', terms: ['driveway'] },
    { icon: '🏊', terms: ['pool area', 'pool'] },
    { icon: '🫧', terms: ['spa area', 'spa', 'jacuzzi'] },
    { icon: '🍖', terms: ['bbq or outdoor kitchen', 'outdoor kitchen', 'bbq grill area', 'bbq', 'grill'] },
    { icon: '🚙', terms: ['detached garage'] },
    { icon: '🛖', terms: ['shed'] },
    { icon: '🛠️', terms: ['workshop'] },
    { icon: '🏘️', terms: ['guest house or adu', 'guest house', 'adu'] },
    { icon: '🏡', terms: ['pool house'] },
    { icon: '🌱', terms: ['landscaping', 'landscape'] },
    { icon: '💦', terms: ['irrigation'] },
    { icon: '🏠', terms: ['roof'] },
    { icon: '🌀', terms: ['exterior mechanical area', 'condenser area', 'equipment pad'] },
    { icon: '🔧', terms: ['exterior shutoff area', 'shutoff area', 'shut off area'] },
    { icon: '🛢️', terms: ['water heater area'] },
    { icon: '🌀', terms: ['exterior cleanout', 'sewer line'] },
    { icon: '🌱', terms: ['planter beds'] },
    { icon: '🎛️', terms: ['controller area'] },
    { icon: '🔧', terms: ['valve box area'] },
    { icon: '🚿', terms: ['outdoor shower'] },
    { icon: '⛲', terms: ['water features'] },
];

const HOME_OS_EQUIPMENT_ICON_RULES: readonly HomeOSEquipmentIconRule[] = [
    { icon: '🪜', terms: ['attic ladder'] },
    { icon: '📹', terms: ['camera inspection'] },
    { icon: '🚿', terms: ['fire sprinkler riser', 'sprinkler riser'] },
    { icon: '💦', terms: ['sprinkler head', 'drip emitter', 'rain sensor'] },
    { icon: '🗃️', terms: ['valve box'] },
    { icon: '💧', terms: ['backflow preventer', 'backflow device'] },
    { icon: '💡', terms: ['vanity light', 'vanity lights'] },
    { icon: '🪞', terms: ['vanity mirror', 'mirror cabinet'] },
    { icon: '🚰', terms: ['vanity sink', 'lavatory sink', 'bathroom sink'] },
    { icon: '🪞', terms: ['bathroom vanity', 'double vanity', 'dual vanity', 'two sink vanity', 'medicine cabinet', 'bathroom cabinet', 'vanity'] },
    { icon: '🪞', terms: ['lighted mirror', 'mirror'] },
    { icon: '💡', terms: ['light fixture', 'exterior lighting', 'lighting', 'lights', 'light'] },
    { icon: '🔔', terms: ['doorbell'] },
    { icon: '🔋', terms: ['battery backup', 'battery'] },
    { icon: '⚡', terms: ['whole home surge protector', 'surge protector', 'main electrical panel', 'electrical panel', 'subpanel', 'breaker', 'gfci', 'gfi', 'outlet', 'receptacle', 'electrical', 'electric heater', 'switch', 'panel', 'charger', 'generator inlet', 'ev charger'] },
    { icon: '🛡️', terms: ['smoke alarm system', 'co alarm system', 'smoke detector', 'co detector', 'carbon monoxide detector', 'fire extinguisher', 'security alarm', 'alarm keypad', 'alarm', 'safety'] },
    { icon: '🌀', terms: ['p trap', 'drain', 'cleanout', 'sewer', 'standpipe', 'waste', 'basket strainer', 'strainer'] },
    { icon: '🎛️', terms: ['pressure vacuum breaker', 'pressure regulator', 'prv', 'regulator', 'controller', 'automation controller'] },
    { icon: '🔧', terms: ['backwater valve', 'irrigation valve', 'gas shutoff', 'water shutoff', 'main water shutoff', 'shutoff', 'shut off', 'angle stop', 'valve', 'stop'] },
    { icon: '💧', terms: ['reverse osmosis', 'whole house filter', 'water filter', 'pool filter', 'filter', 'softener', 'water treatment', 'salt cell'] },
    { icon: '🚰', terms: ['faucet', 'tap', 'spigot', 'hose bib', 'tub filler'] },
    { icon: '🪵', terms: ['kitchen island', 'kitchen counter', 'countertop'] },
    { icon: '〰️', terms: ['generator gas line', 'gas line', 'water main', 'ice maker line', 'line', 'hose', 'tubing', 'pipe', 'piping'] },
    { icon: '〰️', terms: ['gas connection', 'gas supply'] },
    { icon: '⚙️', terms: ['garbage disposal flange', 'garbage disposal', 'food waste disposer', 'disposal', 'disposer', 'flange'] },
    { icon: '♨️', terms: ['instant hot water dispenser', 'insta hot', 'instant hot', 'hot water dispenser', 'dispenser'] },
    { icon: '🛢️', terms: ['tankless water heater', 'gas water heater', 'water heater', 'expansion tank', 'pressure tank', 'tank'] },
    { icon: '📟', terms: ['water meter', 'gas meter', 'meter'] },
    { icon: '💨', terms: ['exhaust fan', 'exhaust', 'fan'] },
    { icon: '🌡️', terms: ['thermostat'] },
    { icon: '🔥', terms: ['pool heater', 'heater', 'boiler'] },
    { icon: '🍽️', terms: ['dishwasher'] },
    { icon: '🧊', terms: ['refrigerator', 'fridge', 'freezer', 'ice maker'] },
    { icon: '💨', terms: ['range hood', 'hood vent'] },
    { icon: '🍳', terms: ['stove', 'range', 'oven', 'cooktop'] },
    { icon: '🍖', terms: ['built in grill', 'grill', 'barbecue', 'bbq'] },
    { icon: '🚰', terms: ['sink', 'basin'] },
    { icon: '🗄️', terms: ['file cabinet', 'filing cabinet'] },
    { icon: '🪞', terms: ['cabinet'] },
    { icon: '🚽', terms: ['toilet', 'bidet'] },
    { icon: '🚽', terms: ['water closet'] },
    { icon: '🚿', terms: ['shower', 'body spray', 'body sprays'] },
    { icon: '🛁', terms: ['tub', 'bathtub'] },
    { icon: '🧺', terms: ['washer', 'washing machine', 'dryer', 'laundry machine'] },
    { icon: '🚪', terms: ['garage door opener', 'garage door'] },
    { icon: '📻', terms: ['microwave'] },
    { icon: '🛏️', terms: ['bed frame', 'mattress', 'nightstand'] },
    { icon: '💻', terms: ['office desk', 'desk', 'workstation', 'computer', 'monitor'] },
    { icon: '⚙️', terms: ['mechanical closet'] },
    { icon: '📦', terms: ['storage closet', 'bedroom closet', 'closet', 'shelving', 'shelf', 'storage'] },
    { icon: '❄️', terms: ['air conditioner', 'air conditioning', 'exterior condenser', 'condenser', 'air handler', 'heat pump', 'furnace', 'hvac', 'supply vent', 'return vent', 'vent'] },
    { icon: '⚙️', terms: ['condensate pump', 'ejector pump', 'sump pump', 'irrigation pump', 'pool pump', 'spa pump', 'pump', 'chemical feeder'] },
    { icon: '🏊', terms: ['pool', 'spa', 'jacuzzi'] },
    { icon: '🔌', terms: ['appliance'] },
    { icon: '🧰', terms: ['fixture', 'equipment', 'component', 'controller'] },
];

function normalizeVisualLabel(label: string) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function labelIncludesTerm(normalizedLabel: string, term: string) {
    return ` ${normalizedLabel} `.includes(` ${term} `);
}

function resolveIconRule<T extends { icon: string; terms: readonly string[] }>(
    normalizedLabel: string,
    rules: readonly T[],
    preferMostSpecific = true
) {
    const matches = rules.flatMap((rule) => rule.terms
        .filter((term) => labelIncludesTerm(normalizedLabel, term))
        .map((term) => ({ icon: rule.icon, term })));

    return preferMostSpecific
        ? matches.sort((left, right) => right.term.length - left.term.length)[0]?.icon
        : matches[0]?.icon;
}

function semanticVisual(
    key: string,
    terms: readonly string[],
    source: ImageSourcePropType,
): HomeOSSemanticVisualRule {
    return { key, terms, asset: { source } };
}

function bundledAsset(key: string, loader: () => ImageSourcePropType): ImageSourcePropType {
    return process.env.EXPO_OS
        ? loader()
        : { uri: `homeos-semantic-asset://${key}` };
}

function resolveSemanticVisualRule(
    normalizedLabel: string,
    rules: readonly HomeOSSemanticVisualRule[],
) {
    const matches = rules.flatMap((rule) => rule.terms
        .filter((term) => labelIncludesTerm(normalizedLabel, term))
        .map((term) => ({ rule, term })));

    return matches.sort((left, right) => right.term.length - left.term.length)[0]?.rule;
}

/**
 * Central HomeOS illustration resolver. Recognized concepts receive the same
 * approved cutout artwork across active decks, Add decks, and detail headers.
 * Custom and unknown records intentionally return undefined so existing media
 * and conservative generic fallbacks remain available without misclassification.
 */
export function resolveHomeOSSemanticVisual(
    label: string,
    context: 'area' | 'equipment',
): HomeOSSemanticVisual | undefined {
    const normalizedLabel = normalizeVisualLabel(label).replace(/\s+#?\d+$/, '');
    if (!normalizedLabel || normalizedLabel.includes('custom')) return undefined;

    const rule = resolveSemanticVisualRule(
        normalizedLabel,
        context === 'area' ? HOME_OS_AREA_VISUAL_RULES : HOME_OS_EQUIPMENT_VISUAL_RULES,
    );

    return rule
        ? { key: rule.key, asset: rule.asset, contentFit: 'contain' }
        : undefined;
}

/**
 * One replacement point for approved HomeOS illustrations and homeowner media.
 * Bundled semantic artwork is resolved above; explicit property media still wins here.
 */
export function resolveHomeOSVisualSource(asset?: HomeOSVisualAsset): ImageSourcePropType | undefined {
    if (asset?.uri?.trim()) return { uri: asset.uri.trim() };
    if (asset?.source) return asset.source;
    return undefined;
}

/** Homeowner media is always preferred over a shared catalog illustration. */
export function resolveHomeOSEquipmentVisual(
    homeownerPhotoUrl?: string | null,
    catalogImageUrl?: string | null
): HomeOSVisualAsset | undefined {
    const homeownerPhoto = homeownerPhotoUrl?.trim();
    if (homeownerPhoto) return { uri: homeownerPhoto };

    const catalogImage = catalogImageUrl?.trim();
    if (catalogImage) return { uri: catalogImage };

    return undefined;
}

/** Area cards retain their room/zone vocabulary and any explicit override. */
export function resolveHomeOSAreaFallbackIcon(label: string, fallbackIcon?: string) {
    const normalizedLabel = normalizeVisualLabel(label).replace(/\s+#?\d+$/, '');
    if (normalizedLabel.includes('custom')) return '⌂';

    const matchedIcon = resolveIconRule(normalizedLabel, HOME_OS_AREA_ICON_RULES);
    if (matchedIcon) return matchedIcon;

    const explicitFallback = fallbackIcon?.trim();
    if (explicitFallback) return explicitFallback;

    // The neutral home glyph is intentional only for a custom or unknown area.
    return '⌂';
}

/**
 * Equipment and component terms win over room words and generic screen fallbacks.
 * For example, Kitchen Sink resolves as a sink rather than as a Kitchen area.
 */
export function resolveHomeOSEquipmentFallbackIcon(label: string, fallbackIcon?: string) {
    const normalizedLabel = normalizeVisualLabel(label);

    if (normalizedLabel) {
        const matchingRule = resolveIconRule(normalizedLabel, HOME_OS_EQUIPMENT_ICON_RULES, false);

        if (matchingRule) return matchingRule;
    }

    const explicitFallback = fallbackIcon?.trim();

    return explicitFallback && !HOME_OS_ROOM_ONLY_FALLBACK_ICONS.has(explicitFallback)
        ? explicitFallback
        : '🧰';
}

const HOME_OS_ROOM_ONLY_FALLBACK_ICONS = new Set([
    '🏠',
    '🍳',
    '🚗',
    '📦',
    '🚪',
    '🌿',
    '🛋️',
]);

export function resolveHomeOSFallbackIcon(label: string, fallback = '⌂') {
    const areaFallback = label.trim() ? getAreaIcon(label) : fallback;
    return resolveHomeOSEquipmentFallbackIcon(label, areaFallback);
}
