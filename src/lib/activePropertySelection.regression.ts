import { resolveSelectedActivePropertyId } from './activePropertySelection';

const memberships = [
    { propertyId: 'first-home' },
    { propertyId: 'lake-house' },
];

assert(
    resolveSelectedActivePropertyId(memberships, 'lake-house') === 'lake-house',
    'A valid stored selection must remain active.'
);
assert(
    resolveSelectedActivePropertyId(memberships, 'old-revoked-home') === 'first-home',
    'A stale selection must fall back to the first active membership.'
);
assert(
    resolveSelectedActivePropertyId(memberships, null) === 'first-home',
    'Existing one-home behavior must choose the first active membership by default.'
);
assert(
    resolveSelectedActivePropertyId([], 'lake-house') === '',
    'An account with no property memberships must not retain an inaccessible selection.'
);

console.log('Active property selection regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`Active property selection regression failed: ${message}`);
}
