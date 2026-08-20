import {
    propertyLandingOtherAreasAction,
    propertyLandingPrimaryDestinations,
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
    propertyLandingOtherAreasAction.route === '/home/unclassified',
    'Ambiguous existing areas must remain reachable from a secondary route instead of appearing as homepage actions.'
);
assert(shouldShowPropertyDestinations(false), 'The homeowner root must show property destinations.');
assert(!shouldShowPropertyDestinations(true), 'Provider mode must keep its existing client HomeOS presentation.');
