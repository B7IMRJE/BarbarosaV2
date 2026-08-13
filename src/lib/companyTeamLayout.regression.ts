import { resolveCompanyTeamContentWidth } from './companyTeamLayout';

runCompanyTeamLayoutRegressions();

function runCompanyTeamLayoutRegressions() {
    assert(resolveCompanyTeamContentWidth(320, 14) === 292, 'A 320px phone should keep 14px safe space on both sides.');
    assert(resolveCompanyTeamContentWidth(375, 14) === 347, 'A 375px phone should remain fully inside its viewport.');
    assert(resolveCompanyTeamContentWidth(390, 14) === 362, 'A 390px phone should remain fully inside its viewport.');
    assert(resolveCompanyTeamContentWidth(1180, 20) === 900, 'Wide layouts should retain the existing 900px content limit.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
