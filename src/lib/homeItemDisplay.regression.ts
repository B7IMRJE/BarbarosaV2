import { resolveHomeItemDisplay } from './homeItemDisplay';

runHomeItemDisplayRegressions();

export function runHomeItemDisplayRegressions() {
    const labeled = resolveHomeItemDisplay({ name: 'Bathroom Vanity 3', placement_label: 'Near shower' });
    assert(labeled.title === 'Bathroom Vanity', 'A placement label should let repeated cards keep the normal equipment title.');
    assert(labeled.placementLabel === 'Near shower', 'The homeowner placement label should remain visible.');

    const unlabeled = resolveHomeItemDisplay({ name: 'Water Heater 2' });
    assert(unlabeled.title === 'Water Heater 2', 'A numbered record should keep its full name until a distinguishing placement label exists.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
