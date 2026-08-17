import {
    buildEstimatePresentationLink,
    formatPresentationJoinCode,
} from './estimatePresentationContract';
import {
    describeRepipeCustomerSelection,
    isRepipePresentationService,
    repipeHomeownerGuideSections,
} from './repipeHomeownerContent';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

assert(formatPresentationJoinCode('ab12 cd34') === 'AB12-CD34', 'Join codes should be short, readable, and normalized.');
assert(formatPresentationJoinCode('AB12-CD34-extra') === 'AB12-CD34', 'Join codes must remain exactly eight hexadecimal characters.');

const link = buildEstimatePresentationLink('private-share-token', 'https://example.test/');
assert(link === 'https://example.test/presentation?session=private-share-token', 'QR link should open only the public presentation route.');
assert(!link.includes('techos') && !link.includes('homeos'), 'Presentation link must never target a staff workspace.');
assert(isRepipePresentationService('whole_home_repipe'), 'Repipe presentations should use the service-specific homeowner guide.');
assert(!isRepipePresentationService('water_heater'), 'Unrelated estimates must not show the repipe guide.');
assert(
    repipeHomeownerGuideSections.some((section) => section.body.includes('Drain, waste, and sewer piping are separate work')),
    'The homeowner guide must distinguish a potable-water repipe from drain replacement.'
);
assert(
    describeRepipeCustomerSelection('Included: Pipe supports / isolators').includes('vibration'),
    'Selected repipe components should carry a plain-language homeowner explanation.'
);
assert(
    describeRepipeCustomerSelection('Permit / inspection plan: Confirm before approval') === '',
    'Unconfirmed estimate conditions must not be described as included work.'
);

console.log('Estimate presentation regression checks passed.');
