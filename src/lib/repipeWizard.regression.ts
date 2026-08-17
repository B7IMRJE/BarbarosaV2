import {
    buildRepipeIncludedScopeSummary,
    formatRepipeIncludedScopeSummary,
    getEstimateCategoryTemplate,
    getInitialEstimateAnswers,
    isEstimateQuestionAnswerComplete,
    type EstimateAnswerSet,
} from './estimateOptions';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

const defaults = getInitialEstimateAnswers('whole_home_repipe');
assert(defaults.repipe_water_main_riser_included === 'yes', 'Water main riser must start included.');
assert(defaults.repipe_angle_stop_count === 0, 'Angle-stop quantity must start at zero.');

const answers: EstimateAnswerSet = {
    ...defaults,
    repipe_stub_material: 'copper',
    repipe_angle_stops_included: 'yes',
    repipe_angle_stop_count: 12,
    repipe_valves_included: 'yes',
    repipe_valve_count: 3,
    repipe_expansion_tank_included: 'yes',
    repipe_halo_5_included: 'yes',
};
const summary = buildRepipeIncludedScopeSummary(answers);
const formatted = formatRepipeIncludedScopeSummary(answers);

assert(summary.some((item) => item.id === 'fixture-stubs' && item.detail === 'Copper'), 'Stub material should be homeowner-visible.');
assert(formatted.includes('Angle stops: 12 included'), 'Angle-stop count should be listed once.');
assert(formatted.includes('Other valves: 3 included'), 'Valve count should be listed once.');
assert(formatted.includes('Water main riser'), 'Default water main riser must stay visible in the summary.');
assert(!formatted.includes('Water heater'), 'Unselected equipment must not appear as included.');

const template = getEstimateCategoryTemplate('whole_home_repipe');
const angleStopCounter = template.questions.find((question) => question.id === 'repipe_angle_stop_count');
assert(angleStopCounter, 'Repipe angle-stop counter should exist.');
assert(
    !isEstimateQuestionAnswerComplete(angleStopCounter!, {
        ...defaults,
        repipe_angle_stops_included: 'yes',
        repipe_angle_stop_count: 0,
    }),
    'Included angle stops require a positive quantity.'
);
assert(
    !isEstimateQuestionAnswerComplete(angleStopCounter!, {
        ...defaults,
        repipe_angle_stops_included: 'no',
        repipe_angle_stop_count: 2,
    }),
    'Excluded angle stops must not retain a non-zero quantity.'
);
assert(
    isEstimateQuestionAnswerComplete(angleStopCounter!, defaults),
    'Excluded angle stops with a zero quantity should be complete.'
);

console.log('Repipe Wizard regression checks passed.');
