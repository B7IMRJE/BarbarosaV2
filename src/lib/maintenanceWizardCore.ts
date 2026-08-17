import type { HomeOSStarterCardChoice } from './homeosStarterCatalog';

export const MAINTENANCE_WIZARD_LOAD_TIMEOUT_MS = 15_000;

export type MaintenanceWizardRouteParams = {
    providerMode?: string | string[];
    companyId?: string | string[];
    propertyId?: string | string[];
    returnTo?: string | string[];
    serviceRequestId?: string | string[];
    scheduleSlotId?: string | string[];
    jobId?: string | string[];
};

export class MaintenanceWizardLoadTimeoutError extends Error {
    constructor(message = 'HomeOS items took too long to load. Check your connection and try again.') {
        super(message);
        this.name = 'MaintenanceWizardLoadTimeoutError';
    }
}

export type MaintenanceWizardItem = {
    id: string;
    item_slug: string | null;
    name: string | null;
    system: string | null;
    category: string | null;
    location: string | null;
    parent_area: string | null;
    install_state: string | null;
    status: string | null;
    starter_template_key?: string | null;
    archived?: boolean | null;
};

export type MaintenanceGuideStep = 'spotlight' | 'section';

export function maintenanceWizardRouteContextKey(params: MaintenanceWizardRouteParams) {
    return [
        firstRouteParam(params.providerMode),
        firstRouteParam(params.companyId),
        firstRouteParam(params.propertyId),
        firstRouteParam(params.returnTo),
        firstRouteParam(params.serviceRequestId),
        firstRouteParam(params.scheduleSlotId),
        firstRouteParam(params.jobId),
    ].join('|');
}

export function isCurrentMaintenanceWizardLoad(runId: number, latestRunId: number) {
    return runId === latestRunId;
}

export async function withMaintenanceWizardLoadTimeout<T>(
    operation: PromiseLike<T>,
    message?: string,
    timeoutMs = MAINTENANCE_WIZARD_LOAD_TIMEOUT_MS,
) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve(operation),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new MaintenanceWizardLoadTimeoutError(message)),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

export function sortMaintenanceWizardItems(items: readonly MaintenanceWizardItem[]) {
    return items
        .filter((item) => !item.archived && Boolean(item.item_slug))
        .sort((left, right) => installedWeight(left) - installedWeight(right)
            || text(left.location || left.parent_area).localeCompare(text(right.location || right.parent_area))
            || text(left.name).localeCompare(text(right.name)));
}

export function maintenanceWizardItemStatus(item: MaintenanceWizardItem) {
    return installedWeight(item) === 0 ? 'Installed / confirmed' : 'HomeOS item';
}

export function maintenanceDeckSuggestions(
    items: readonly MaintenanceWizardItem[],
    cards: readonly HomeOSStarterCardChoice[],
) {
    const installedTemplateKeys = new Set(items.map((item) => text(item.starter_template_key)).filter(Boolean));
    const installedNames = new Set(items.map((item) => normalize(item.name)).filter(Boolean));

    return cards
        .filter((card) => !installedTemplateKeys.has(card.templateKey) && !installedNames.has(normalize(card.name)))
        .filter((card) => ['equipment', 'fixture'].includes(normalize(card.category)))
        .sort((left, right) => maintenanceRelevance(left) - maintenanceRelevance(right)
            || left.name.localeCompare(right.name));
}

export function maintenanceSafetyNotice(item: Pick<MaintenanceWizardItem, 'name' | 'system' | 'category'>) {
    const identity = normalize([item.name, item.system, item.category].filter(Boolean).join(' '));
    const licensed = ['gas', 'electrical', 'panel', 'breaker', 'generator', 'water heater', 'tankless', 'pressurized', 'hvac', 'air conditioner', 'furnace']
        .some((term) => identity.includes(term));

    return licensed
        ? 'Safety: follow the manufacturer manual and use a qualified licensed professional for gas, electrical, pressurized, or other hazardous service. The suggested cadence is a company/custom starting point, not a substitute for the manual.'
        : 'Follow the manufacturer manual for the installed equipment. Suggested cadences are company/custom starting points and can be changed for this home.';
}

export function isMaintenanceGuideStep(value?: string | null): value is MaintenanceGuideStep {
    return value === 'spotlight' || value === 'section';
}

function installedWeight(item: MaintenanceWizardItem) {
    const value = normalize(`${item.install_state || ''} ${item.status || ''}`);
    if (value.includes('installed') || value.includes('good') || value.includes('confirmed')) return 0;
    if (value.includes('missing') || value.includes('not applicable')) return 2;
    return 1;
}

function maintenanceRelevance(card: HomeOSStarterCardChoice) {
    const value = normalize(`${card.name} ${card.system} ${card.category}`);
    if (['hvac', 'water heater', 'tankless', 'filter', 'valve', 'panel', 'alarm', 'generator'].some((term) => value.includes(term))) return 0;
    return 1;
}

function text(value?: string | null) {
    return String(value || '').trim();
}

function normalize(value?: string | null) {
    return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstRouteParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
