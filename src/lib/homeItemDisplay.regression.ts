import { resolveHomeItemCardDetails, resolveHomeItemDisplay } from './homeItemDisplay';

runHomeItemDisplayRegressions();

export function runHomeItemDisplayRegressions() {
    const labeled = resolveHomeItemDisplay({ name: 'Bathroom Vanity 3', placement_label: 'Near shower' });
    assert(labeled.title === 'Bathroom Vanity', 'A placement label should let repeated cards keep the normal equipment title.');
    assert(labeled.placementLabel === 'Near shower', 'The homeowner placement label should remain visible.');

    const unlabeled = resolveHomeItemDisplay({ name: 'Water Heater 2' });
    assert(unlabeled.title === 'Water Heater 2', 'A numbered record should keep its full name until a distinguishing placement label exists.');

    const details = resolveHomeItemCardDetails({
        status: 'Installed',
        system: 'Plumbing',
        category: 'Fixture',
        location: 'Bathroom 1',
        brand: 'Kohler',
        model: 'Memoirs',
        serial: 'ABC-123',
        install_date: '2025-06-15',
    });
    assert(details.find((detail) => detail.label === 'Location')?.value === 'Bathroom 1', 'The modern card should keep the installed location inside the card.');
    assert(details.find((detail) => detail.label === 'Brand')?.value === 'Kohler', 'The modern card should keep brand information inside the card.');
    assert(details.find((detail) => detail.label === 'Installed')?.value === 'Jun 15, 2025', 'The modern card should format the installation date inside the card.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
