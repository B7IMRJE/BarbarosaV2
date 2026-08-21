import { resolveUniversalHomeItemDetailFields } from './homeItemDetailPresentation';

const details = resolveUniversalHomeItemDetailFields({
    name: 'Bathroom Faucet',
    status: 'Missing Information',
    condition: 'Installed',
    system: 'Plumbing',
    category: 'Fixture',
    location: 'Bathroom 1',
    parent_area: 'Primary Suite',
    brand: 'Unknown',
    model: 'Unknown',
    serial: 'Unknown',
    part_number: 'Not provided',
    install_date: '2026-08-21',
    parent_home_item_id: 'vanity-1',
});

const labels = details.map((detail) => detail.label);
const requiredLabels = ['Status', 'Condition', 'System', 'Category', 'Location', 'Parent Area', 'Brand', 'Model', 'Serial', 'Part Number', 'Installed'];

for (const label of requiredLabels) {
    if (!labels.includes(label)) {
        throw new Error(`Universal item detail is missing ${label}.`);
    }
}

if (details.find((detail) => detail.label === 'Parent Area')?.value !== 'Primary Suite') {
    throw new Error('A nested component must retain its parent-area information.');
}

if (details.find((detail) => detail.label === 'Location')?.value !== 'Bathroom 1') {
    throw new Error('Location must remain item-specific instead of being replaced by the parent area.');
}

console.log('Universal HomeOS item detail presentation regression checks passed.');
