import { nextHomeItemInstanceName } from './homeItemInstances';

runHomeItemInstanceRegressions();

export function runHomeItemInstanceRegressions() {
    assert(
        nextHomeItemInstanceName('Water Heater', ['Water Heater']) === 'Water Heater 2',
        'A second assembly should receive a clear numbered name.'
    );
    assert(
        nextHomeItemInstanceName('Water Heater 2', ['Water Heater', 'Water Heater 2', 'Water Heater 3']) === 'Water Heater 4',
        'Adding another numbered assembly should use the next available number without nesting suffixes.'
    );
    assert(
        nextHomeItemInstanceName('Kitchen Sink', [' kitchen   sink ', 'KITCHEN SINK 2']) === 'Kitchen Sink 3',
        'Instance naming should treat spacing and letter case consistently.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
