import { cleanOptionalProfileText } from './profileSyncInput';

runProfileSyncRegressions();

export function runProfileSyncRegressions() {
    blankOptionalFieldsBecomeNull();
    providedProfileFieldsAreTrimmed();
}

function blankOptionalFieldsBecomeNull() {
    assert(cleanOptionalProfileText('   ') === null, 'Blank profile fields must not overwrite a stored value.');
    assert(cleanOptionalProfileText(undefined) === null, 'Missing profile fields must remain optional.');
}

function providedProfileFieldsAreTrimmed() {
    assert(cleanOptionalProfileText('  Morgan Lee  ') === 'Morgan Lee', 'Profile fields should be normalized before sync.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
