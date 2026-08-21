import {
    myHomeAreaDestinations,
    propertyLandingIdentityPresentation,
    propertyLandingOtherAreasAction,
    propertyLandingPrimaryDestinations,
    propertyLandingWorkflowDestinations,
    resolvePropertyLandingIdentity,
    shouldShowPropertyDestinations,
} from './propertyLandingNavigation';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Property landing regression failed: ${message}`);
}

assert(
    propertyLandingPrimaryDestinations.map((destination) => destination.title).join('|') === 'My Home',
    'The homeowner root must have My Home as its only primary property destination.'
);
assert(
    propertyLandingPrimaryDestinations[0]?.route === '/home',
    'My Home must open the Interior and Exterior chooser before either area deck.'
);
assert(
    propertyLandingPrimaryDestinations[0]?.accessibilityLabel === 'Open My Home areas',
    'The complete My Home card must remain an actionable entry into the home-area flow.'
);
assert(
    propertyLandingPrimaryDestinations[0]?.description === 'Rooms and indoor areas',
    'The My Home card must retain its concise approved subtitle.'
);
assert(propertyLandingPrimaryDestinations.length === 1, 'Exterior must not compete as a landing destination.');
assert(
    myHomeAreaDestinations.map((destination) => destination.route).join('|') === '/home/interior|/home/exterior',
    'Interior and Exterior must remain reachable from within My Home.'
);
assert(propertyLandingIdentityPresentation.showMap === false, 'The property landing must not render a map.');
assert(propertyLandingIdentityPresentation.showHomeMotif, 'The approved translucent home motif must remain in the identity card.');
assert(!propertyLandingIdentityPresentation.showAreaSections, 'Interior and Exterior sections must appear only after opening My Home.');
assert(
    propertyLandingWorkflowDestinations.map((destination) => destination.key).join('|') === 'emergency|requests|maintenance|connections',
    'Existing emergency, regular request/job, maintenance, and connection workflow cards must remain below My Home.'
);
const namedIdentity = resolvePropertyLandingIdentity({
    name: 'Oak Street Home',
    address: '100 Oak Street, Austin, TX',
});
assert(namedIdentity.eyebrow === 'Your Property', 'The landing must present a clear property identity banner.');
assert(namedIdentity.title === 'Oak Street Home', 'The property name should lead the identity banner.');
assert(namedIdentity.address === '100 Oak Street, Austin, TX', 'The address must remain visible beneath a distinct property name.');
const addressOnlyIdentity = resolvePropertyLandingIdentity({ address: '100 Oak Street, Austin, TX' });
assert(addressOnlyIdentity.title === '100 Oak Street, Austin, TX', 'An address must become the banner title when no property name exists.');
assert(addressOnlyIdentity.address === '', 'An address-only identity must not repeat itself in the banner.');
assert(
    propertyLandingOtherAreasAction.route === '/home/unclassified',
    'Ambiguous existing areas must remain reachable from a secondary route instead of appearing as homepage actions.'
);
assert(shouldShowPropertyDestinations(false), 'The homeowner root must show property destinations.');
assert(!shouldShowPropertyDestinations(true), 'Provider mode must keep its existing client HomeOS presentation.');
