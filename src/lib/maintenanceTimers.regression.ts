import {
    getMaintenancePresets,
    getWaterHeaterDrainPanCadence,
} from './maintenanceTimers';

runMaintenanceTimerRegressions();

export function runMaintenanceTimerRegressions() {
    waterHeaterDrainPanCadenceTightensWithAge();
    unknownWaterHeaterAgeStaysSafeAndExplicit();
    olderWaterHeaterAddsReplacementPlanning();
}

function waterHeaterDrainPanCadenceTightensWithAge() {
    const referenceDate = new Date('2026-07-22T12:00:00');

    assertCadence('2023-07-22', referenceDate, 1, 'years');
    assertCadence('2020-07-22', referenceDate, 6, 'months');
    assertCadence('2013-07-22', referenceDate, 3, 'months');
    assertCadence('2010-07-22', referenceDate, 1, 'months');
}

function unknownWaterHeaterAgeStaysSafeAndExplicit() {
    const cadence = getWaterHeaterDrainPanCadence(null, new Date('2026-07-22T12:00:00'));

    assert(cadence.recurrenceInterval === 1, 'Unknown age should default to one-year drain-pan checks.');
    assert(cadence.recurrenceUnit === 'years', 'Unknown age should default to annual drain-pan checks.');
    assert(cadence.description.includes('After year 5'), 'Unknown-age guidance should explain the age schedule.');
}

function olderWaterHeaterAddsReplacementPlanning() {
    const presets = getMaintenancePresets({
        name: 'Water Heater',
        system: 'Plumbing',
        category: 'Equipment',
        item_slug: 'garage-water-heater',
        install_date: '2010-07-22',
    });

    const drainPan = presets.find((preset) => preset.key === 'water_heater_drain_pan');

    assert(drainPan?.recurrenceInterval === 1, 'A 16-year-old water heater should use a one-month interval.');
    assert(drainPan?.recurrenceUnit === 'months', 'A 16-year-old water heater should be checked monthly.');
    assert(
        presets.some((preset) => preset.key === 'water_heater_replacement_review'),
        'An older water heater should add replacement planning.'
    );
}

function assertCadence(
    installDate: string,
    referenceDate: Date,
    recurrenceInterval: number,
    recurrenceUnit: 'months' | 'years'
) {
    const cadence = getWaterHeaterDrainPanCadence(installDate, referenceDate);

    assert(
        cadence.recurrenceInterval === recurrenceInterval,
        `${installDate} should use interval ${recurrenceInterval}.`
    );
    assert(
        cadence.recurrenceUnit === recurrenceUnit,
        `${installDate} should use recurrence unit ${recurrenceUnit}.`
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
