import {
    propertyLandingOtherAreasAction,
    propertyLandingPrimaryDestinations,
    resolvePropertyLandingIdentity,
    shouldShowPropertyDestinations,
} from './propertyLandingNavigation';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Property landing regression failed: ${message}`);
}

assert(
    propertyLandingPrimaryDestinations.map((destination) => destination.title).join('|') === 'My Home|Exterior',
    'The homeowner root must have only My Home and Exterior as primary property destinations.'
);
assert(
    propertyLandingPrimaryDestinations.map((destination) => destination.route).join('|') === '/home/interior|/home/exterior',
    'Primary destinations must keep the existing property-first routes.'
);
assert(
    propertyLandingPrimaryDestinations.map((destination) => destination.description).join('|') === 'Rooms and indoor areas|Yards and outdoor areas',
    'The two primary cards must retain their concise approved subtitles.'
);
const namedIdentity = resolvePropertyLandingIdentity({
    name: 'Oak Street Home',
    address: '100 Oak Street, Austin, TX',
});
assert(namedIdentity.eyebrow === 'Your property', 'The landing must present a clear property identity banner.');
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
