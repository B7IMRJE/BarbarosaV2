export type HealthStatus =
    | 'critical'
    | 'needs_attention'
    | 'not_inspected'
    | 'unknown'
    | 'missing_information'
    | 'good'
    | 'no_data';

export type HealthLabel =
    | 'Good'
    | 'Needs Review'
    | 'Needs Attention'
    | 'Critical'
    | 'Not enough data yet';

export type HomeHealthItem = {
    id?: string;
    status?: string | null;
    condition?: string | null;
    install_state?: string | null;
    system?: string | null;
    area?: string | null;
    location?: string | null;
    parent_area?: string | null;
    category?: string | null;
};

export type HomeHealthEmergency = {
    id?: string;
    status?: string | null;
    emergency_type?: string | null;
};

export type ItemHealth = {
    score: number;
    status: HealthStatus;
};

export type HealthSummary = {
    score: number | null;
    label: HealthLabel;
    status: HealthStatus;
    itemCount: number;
    criticalCount: number;
    needsAttentionCount: number;
    unknownCount: number;
    goodCount: number;
    emergencyOverride: boolean;
};

const scoreByStatus: Record<Exclude<HealthStatus, 'no_data'>, number> = {
    good: 100,
    not_inspected: 60,
    unknown: 50,
    missing_information: 40,
    needs_attention: 20,
    critical: 0,
};

export function normalizeHealthStatus(value?: string | null): HealthStatus {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) return 'unknown';

    if (
        normalized.includes('emergency') ||
        normalized.includes('critical') ||
        normalized.includes('active leak') ||
        normalized.includes('flood') ||
        normalized.includes('gas smell')
    ) {
        return 'critical';
    }

    if (
        normalized.includes('needs attention') ||
        normalized.includes('maintenance recommended') ||
        normalized.includes('repair') ||
        normalized.includes('problem')
    ) {
        return 'needs_attention';
    }

    if (normalized.includes('not inspected')) {
        return 'not_inspected';
    }

    if (normalized.includes('missing information') || normalized === 'missing') {
        return 'missing_information';
    }

    if (normalized.includes('unknown')) {
        return 'unknown';
    }

    if (normalized.includes('good') || normalized.includes('installed')) {
        return 'good';
    }

    return 'unknown';
}

export function scoreHomeItem(item: HomeHealthItem): ItemHealth {
    const candidates = [item.status, item.condition, item.install_state].filter((value) =>
        String(value || '').trim()
    );
    const statuses = candidates.map(normalizeHealthStatus);

    if (statuses.length === 0) {
        return { status: 'unknown', score: scoreByStatus.unknown };
    }

    if (statuses.includes('critical')) {
        return { status: 'critical', score: scoreByStatus.critical };
    }

    if (statuses.includes('needs_attention')) {
        return { status: 'needs_attention', score: scoreByStatus.needs_attention };
    }

    if (statuses.includes('missing_information')) {
        return { status: 'missing_information', score: scoreByStatus.missing_information };
    }

    if (statuses.includes('not_inspected')) {
        return { status: 'not_inspected', score: scoreByStatus.not_inspected };
    }

    if (statuses.includes('unknown')) {
        return { status: 'unknown', score: scoreByStatus.unknown };
    }

    return { status: 'good', score: scoreByStatus.good };
}

export function healthLabelFromScore(score: number | null): HealthLabel {
    if (score === null) return 'Not enough data yet';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Needs Review';
    if (score >= 30) return 'Needs Attention';
    return 'Critical';
}

export function scoreItems(items: HomeHealthItem[]): HealthSummary {
    if (items.length === 0) {
        return {
            score: null,
            label: 'Not enough data yet',
            status: 'no_data',
            itemCount: 0,
            criticalCount: 0,
            needsAttentionCount: 0,
            unknownCount: 0,
            goodCount: 0,
            emergencyOverride: false,
        };
    }

    const itemHealth = items.map(scoreHomeItem);
    const total = itemHealth.reduce((sum, health) => sum + health.score, 0);
    const score = Math.round(total / itemHealth.length);

    return {
        score,
        label: healthLabelFromScore(score),
        status: summaryStatusFromItems(itemHealth),
        itemCount: itemHealth.length,
        criticalCount: itemHealth.filter((health) => health.status === 'critical').length,
        needsAttentionCount: itemHealth.filter((health) => health.status === 'needs_attention').length,
        unknownCount: itemHealth.filter((health) =>
            ['unknown', 'missing_information', 'not_inspected'].includes(health.status)
        ).length,
        goodCount: itemHealth.filter((health) => health.status === 'good').length,
        emergencyOverride: false,
    };
}

export function scoreSystemHealth(items: HomeHealthItem[], system: string): HealthSummary {
    return scoreItems(items.filter((item) => sameText(item.system, system)));
}

export function scoreCategoryHealth(items: HomeHealthItem[], category: string): HealthSummary {
    return scoreItems(items.filter((item) => sameText(item.category, category)));
}

export function scoreAreaHealth(items: HomeHealthItem[], area: string): HealthSummary {
    return scoreItems(
        items.filter((item) =>
            [item.area, item.location, item.parent_area].some((itemArea) => sameText(itemArea, area))
        )
    );
}

export function scoreAllSystems(
    items: HomeHealthItem[],
    systems: string[]
): Record<string, HealthSummary> {
    return systems.reduce<Record<string, HealthSummary>>((summaries, system) => {
        summaries[system] = scoreSystemHealth(items, system);
        return summaries;
    }, {});
}

export function scorePlumbingCategories(items: HomeHealthItem[]) {
    return {
        Areas: scoreCategoryHealth(items, 'Area'),
        Fixtures: scoreCategoryHealth(items, 'Fixture'),
        Equipment: scoreCategoryHealth(items, 'Equipment'),
    };
}

export function hasActiveEmergency(emergencies: HomeHealthEmergency[]) {
    return emergencies.some((emergency) => {
        const status = String(emergency.status || '').trim().toLowerCase();
        return status !== 'resolved';
    });
}

export function scoreOverallHomeHealth(
    items: HomeHealthItem[],
    emergencies: HomeHealthEmergency[]
): HealthSummary {
    const summary = scoreItems(items);

    if (!hasActiveEmergency(emergencies)) {
        return summary;
    }

    return {
        ...summary,
        score: 0,
        label: 'Critical',
        status: 'critical',
        emergencyOverride: true,
    };
}

export function statusForCard(summary: HealthSummary): string | null {
    if (summary.status === 'no_data') return null;
    if (summary.status === 'critical') return 'Emergency';
    if (summary.status === 'needs_attention') return 'Needs Attention';
    if (
        summary.status === 'unknown' ||
        summary.status === 'missing_information' ||
        summary.status === 'not_inspected'
    ) {
        return 'Not Inspected';
    }
    return 'Good';
}

function summaryStatusFromItems(itemHealth: ItemHealth[]): HealthStatus {
    if (itemHealth.some((health) => health.status === 'critical')) return 'critical';
    if (itemHealth.some((health) => health.status === 'needs_attention')) return 'needs_attention';
    if (itemHealth.some((health) => health.status === 'missing_information')) return 'missing_information';
    if (itemHealth.some((health) => health.status === 'unknown')) return 'unknown';
    if (itemHealth.some((health) => health.status === 'not_inspected')) return 'not_inspected';
    return 'good';
}

function sameText(a?: string | null, b?: string | null) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}
