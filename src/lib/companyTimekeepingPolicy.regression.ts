import {
    getCompanyPayBasisLabel,
    isCompanyClockRequired,
    normalizeCompanyPayBasis,
} from './companyTimekeepingPolicyModel';

runCompanyTimekeepingPolicyRegressions();

export function runCompanyTimekeepingPolicyRegressions() {
    hourlyRequiresClocking();
    salariedClockingIsOptional();
    unknownValuesFailClosedToHourly();
}

function hourlyRequiresClocking() {
    assert(normalizeCompanyPayBasis('hourly') === 'hourly', 'Hourly must remain the canonical hourly pay basis.');
    assert(isCompanyClockRequired('hourly'), 'Hourly staff must clock in before opening assigned work.');
    assert(getCompanyPayBasisLabel('hourly') === 'Hourly', 'Hourly should have a readable label.');
}

function salariedClockingIsOptional() {
    assert(normalizeCompanyPayBasis('SALARIED') === 'salaried', 'Salaried values should normalize case-insensitively.');
    assert(!isCompanyClockRequired('salaried'), 'Salaried staff must be allowed to work without clocking in.');
    assert(getCompanyPayBasisLabel('salaried') === 'Salaried', 'Salaried should have a readable label.');
}

function unknownValuesFailClosedToHourly() {
    assert(normalizeCompanyPayBasis('contractor') === 'hourly', 'Unknown pay bases should preserve required clocking.');
    assert(isCompanyClockRequired(null), 'Missing pay-basis data should preserve required clocking.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
