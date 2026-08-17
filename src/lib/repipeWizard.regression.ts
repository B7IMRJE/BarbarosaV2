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
assert(defaults.repipe_pipe_insulation_included === 'no', 'Optional pipe insulation must not be silently included.');
assert(defaults.repipe_walkthrough_included === undefined, 'Homeowner walkthrough must require an explicit staff answer.');

const answers: EstimateAnswerSet = {
    ...defaults,
    proposed_pipe_material: 'PEX',
    repipe_pipe_system_brand: 'Uponor PEX-A',
    repipe_stub_material: 'copper',
    repipe_pipe_insulation_included: 'yes',
    repipe_pipe_supports_included: 'yes',
    repipe_angle_stops_included: 'yes',
    repipe_angle_stop_count: 12,
    repipe_valves_included: 'yes',
    repipe_valve_count: 3,
    repipe_full_port_shutoff_included: 'yes',
    repipe_pressure_regulator_included: 'yes',
    repipe_type_k_transition_included: 'yes',
    repipe_red_brass_recirc_included: 'no',
    repipe_water_hammer_protection: ['washing machine box', 'dishwasher'],
    repipe_braided_connectors: ['faucets', 'toilets'],
    repipe_exterior_components: ['hose-bibb vacuum breakers'],
    repipe_expansion_tank_included: 'yes',
    repipe_halo_5_included: 'yes',
    repipe_walkthrough_included: 'yes',
    repipe_home_protection_included: 'yes',
    repipe_inspection_plan: 'included when required',
    patching: 'included',
    repipe_testing_scope: 'included when required by confirmed project conditions',
    repipe_manufacturer_warranty: '25-year written manufacturer warranty',
    repipe_workmanship_warranty: 'Lifetime workmanship warranty under written company terms',
    repipe_verified_credentials: 'Current company license and verified training credentials',
};
const summary = buildRepipeIncludedScopeSummary(answers);
const formatted = formatRepipeIncludedScopeSummary(answers);

assert(summary.some((item) => item.id === 'fixture-stubs' && item.detail === 'Copper'), 'Stub material should be homeowner-visible.');
assert(summary.some((item) => item.id === 'distribution-piping' && item.detail === 'PEX'), 'Selected potable-water piping should be homeowner-visible.');
assert(summary.some((item) => item.id === 'pipe-system' && item.detail === 'Uponor PEX-A'), 'Verified pipe system should stay attached to the estimate.');
assert(summary.some((item) => item.id === 'pipe-supports' && item.description.includes('movement')), 'Included supports should explain their purpose.');
assert(formatted.includes('Angle stops: 12 included'), 'Angle-stop count should be listed once.');
assert(formatted.includes('Other valves: 3 included'), 'Valve count should be listed once.');
assert(formatted.includes('Water-hammer protection: Washing machine box, Dishwasher'), 'Selected water-hammer locations should be listed.');
assert(formatted.includes('Home protection'), 'Selected home-protection work should be listed.');
assert(formatted.includes('Permit / inspections: Included when required'), 'Selected inspection coordination should be listed without promising authority timing.');
assert(formatted.includes('Lead / asbestos testing: Included when required by confirmed project conditions'), 'Hazard testing must use the confirmed conditional scope.');
assert(formatted.includes('Manufacturer warranty: 25-year written manufacturer warranty'), 'Warranty terms must appear only when explicitly entered.');
assert(formatted.includes('Water main riser'), 'Default water main riser must stay visible in the summary.');
assert(!formatted.includes('Water heater'), 'Unselected equipment must not appear as included.');
assert(!formatted.includes('Red-brass recirculation connection'), 'Unselected specialty material must not appear as included.');

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
