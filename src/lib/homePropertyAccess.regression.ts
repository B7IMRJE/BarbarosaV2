import {
    HOME_STORY_COUNT_OPTIONS,
    homeStoryCountLabel,
    maskGateCode,
    normalizeHomeStoryCount,
} from './homePropertyAccessValues';

runHomePropertyAccessRegressions();

export function runHomePropertyAccessRegressions() {
    assert(
        HOME_STORY_COUNT_OPTIONS.map((option) => option.value).join(',') === '1,2,3,4,4_plus',
        'Home profile must offer one through four and four-plus stories.'
    );
    assert(normalizeHomeStoryCount('4_plus') === '4_plus', 'Four-plus must remain a supported permanent value.');
    assert(normalizeHomeStoryCount('5') === null, 'Unsupported story values must not enter the permanent record.');
    assert(homeStoryCountLabel('1') === '1 story', 'One story must use the singular label.');
    assert(homeStoryCountLabel('4_plus') === '4+ stories', 'Four-plus must use the expected label.');
    assert(maskGateCode('1234') === '••••', 'Gate codes must be masked by default.');
    assert(maskGateCode('1234567890123456').length === 12, 'Masking must not reveal an exact long code length.');
    assert(maskGateCode('') === '', 'An empty gate code must remain empty.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
