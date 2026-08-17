import {
    buildEstimatePresentationLink,
    formatPresentationJoinCode,
} from './estimatePresentationContract';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

assert(formatPresentationJoinCode('ab12 cd34') === 'AB12-CD34', 'Join codes should be short, readable, and normalized.');
assert(formatPresentationJoinCode('AB12-CD34-extra') === 'AB12-CD34', 'Join codes must remain exactly eight hexadecimal characters.');

const link = buildEstimatePresentationLink('private-share-token', 'https://example.test/');
assert(link === 'https://example.test/presentation?session=private-share-token', 'QR link should open only the public presentation route.');
assert(!link.includes('techos') && !link.includes('homeos'), 'Presentation link must never target a staff workspace.');

console.log('Estimate presentation regression checks passed.');
