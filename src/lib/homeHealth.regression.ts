import {
    hasActiveEmergency,
    scoreAreaHealth,
    scoreOverallHomeHealth,
    scoreSystemHealth,
} from './homeHealth';

runHomeHealthRegressions();

export function runHomeHealthRegressions() {
    emptyStarterCardsDoNotLowerHomeHealth();
    activatedItemsStillCount();
    emptyAreasRemainUnscored();
    terminalEmergenciesDoNotForceCriticalHealth();
}

function emptyStarterCardsDoNotLowerHomeHealth() {
    const summary = scoreOverallHomeHealth([
        {
            category: 'Area',
            system: 'Plumbing',
            location: 'Kitchen',
            status: 'Missing Information',
            install_state: 'Unknown',
        },
        ...Array.from({ length: 78 }, (_, index) => ({
            id: `starter-${index}`,
            category: 'Fixture',
            system: 'Plumbing',
            location: 'Kitchen',
            status: 'Missing Information',
            install_state: 'Unknown',
        })),
    ], []);

    assert(summary.score === 100, 'An empty starter home should begin at 100/100.');
    assert(summary.itemCount === 0, 'Empty starter cards should not count as active home items.');
    assert(summary.label === 'Good', 'An empty starter home should not be labeled Needs Attention.');
}

function activatedItemsStillCount() {
    const summary = scoreOverallHomeHealth([
        {
            category: 'Fixture',
            system: 'Plumbing',
            location: 'Kitchen',
            status: 'Not Inspected',
            install_state: 'Installed',
        },
    ], []);

    assert(summary.score === 60, 'An activated not-inspected item should count toward Home Health.');
    assert(summary.itemCount === 1, 'An activated item should count as a real home item.');
}

function emptyAreasRemainUnscored() {
    const items = [{
        category: 'Fixture',
        system: 'Plumbing',
        location: 'Kitchen',
        status: 'Missing Information',
        install_state: 'Unknown',
    }];

    assert(scoreAreaHealth(items, 'Kitchen').score === null, 'An empty area should remain visually empty.');
    assert(scoreSystemHealth(items, 'Plumbing').score === null, 'A system with only starter cards should remain visually empty.');
}

function terminalEmergenciesDoNotForceCriticalHealth() {
    assert(!hasActiveEmergency([{ status: 'Resolved' }]), 'Resolved emergencies must not force Home Health critical.');
    assert(!hasActiveEmergency([{ status: 'Cancelled' }]), 'Cancelled emergencies must not force Home Health critical.');
    assert(!hasActiveEmergency([{ status: 'Closed' }]), 'Closed emergencies must not force Home Health critical.');
    assert(hasActiveEmergency([{ status: 'Reported' }]), 'Reported emergencies must remain active.');
    assert(hasActiveEmergency([{ status: 'In Progress' }]), 'In-progress emergencies must remain active.');
}

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}
