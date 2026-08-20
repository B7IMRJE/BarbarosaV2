import type { HomeItemHierarchyRecord } from './homeItemHierarchy';
import { resolveHomeItemComponentDeck } from './homeItemHierarchyProjection';
import {
    resolveHomeItemHealthCardPresentation,
    resolveHomeItemHealthRollupPresentation,
} from './homeItemHealthPresentation';

runHomeItemHealthPresentationRegressions();

export function runHomeItemHealthPresentationRegressions() {
    assertPresentation(
        { status: 'Emergency', install_state: 'Installed' },
        'Critical',
        'critical',
        'Emergency must remain the strongest card state.',
    );
    assertPresentation(
        { status: 'Needs Attention', install_state: 'Installed' },
        'Needs Attention',
        'attention',
        'An attention item must use the visible warning state.',
    );
    assertPresentation(
        { status: 'Missing Information', install_state: 'Unknown' },
        'Needs Review',
        'attention',
        'Missing information must not appear green.',
    );
    assertPresentation(
        { status: null, install_state: null },
        'Needs Review',
        'attention',
        'Unknown items must not appear green.',
    );
    assertPresentation(
        { status: 'Good', install_state: 'Installed' },
        'Good',
        'good',
        'Only a scored good item should use the good state.',
    );
    assemblyRollupUsesWorstDescendantState();

    console.log('Home item health presentation regression checks passed.');
}

function assemblyRollupUsesWorstDescendantState() {
    const sink: HomeItemHierarchyRecord = {
        id: 'sink',
        item_slug: 'sink',
        name: 'Kitchen Sink',
        location: 'Kitchen',
        status: 'Good',
        install_state: 'Installed',
    };
    const pTrap: HomeItemHierarchyRecord = {
        id: 'trap',
        item_slug: 'trap',
        name: 'Kitchen Sink P-Trap',
        location: 'Kitchen Sink',
        parent_area: 'Kitchen',
        parent_home_item_id: 'sink',
        status: 'Emergency',
        install_state: 'Installed',
    };
    const supplyLine: HomeItemHierarchyRecord = {
        id: 'line',
        item_slug: 'line',
        name: 'Kitchen Sink Supply Line',
        location: 'Kitchen Sink',
        parent_area: 'Kitchen',
        parent_home_item_id: 'sink',
        status: 'Missing Information',
        install_state: 'Unknown',
    };
    const components = resolveHomeItemComponentDeck([sink, pTrap, supplyLine], sink);
    const presentation = resolveHomeItemHealthRollupPresentation([sink, ...components]);

    if (presentation.label !== 'Critical' || presentation.tone !== 'critical') {
        throw new Error('A critical saved descendant must make its assembly card critical.');
    }

    const reviewOnly = resolveHomeItemHealthRollupPresentation([sink, supplyLine]);

    if (reviewOnly.label !== 'Needs Review' || reviewOnly.tone !== 'attention') {
        throw new Error('An unknown or missing descendant must prevent a green assembly card.');
    }
}

function assertPresentation(
    item: { status?: string | null; install_state?: string | null },
    expectedLabel: string,
    expectedTone: string,
    message: string,
) {
    const presentation = resolveHomeItemHealthCardPresentation(item);

    if (presentation.label !== expectedLabel || presentation.tone !== expectedTone) {
        throw new Error(
            `${message} Received ${presentation.label}/${presentation.tone}; expected ${expectedLabel}/${expectedTone}.`,
        );
    }
}
