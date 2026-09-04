import { buildStarterHomePlan } from './starterHomeSetup';
import type { HomeStoryCount } from './homePropertyAccessValues';

export type HomeSetupStatus = {
    property_id: string;
    home_name: string;
    property_type: string;
    story_count: HomeStoryCount | null;
    starter_state: 'unselected' | 'legacy_review' | 'pending' | 'complete' | 'empty' | 'existing';
    completed_at: string | null;
    needs_details: boolean;
    needs_choice: boolean;
    can_retry: boolean;
    skipped_areas: number;
    /** Client-only: refresh the area list only after an actual recovery. */
    recovered?: boolean;
};
export type HomeSetupScope = { userId: string; propertyId: string };
export type HomeSetupChoices = {
    bathrooms: number;
    kitchen: boolean;
    laundry: boolean;
    garage: boolean;
    waterHeater: boolean | 'not_sure';
    hvac: boolean | 'not_sure';
    frontYard: boolean;
    backYard: boolean;
    pool: boolean;
};

export function buildHomeSetupPlan(choices: HomeSetupChoices) {
    if (!Number.isInteger(choices.bathrooms) || choices.bathrooms < 0 || choices.bathrooms > 4) {
        throw new Error('Choose between zero and four bathrooms (four represents four or more).');
    }
    return buildStarterHomePlan({
        bathrooms: choices.bathrooms, includeKitchen: choices.kitchen, includeLaundry: choices.laundry,
        includeGarage: choices.garage, includeWaterHeater: choices.waterHeater !== false, includeHvac: choices.hvac !== false,
        includeExterior: choices.frontYard || choices.backYard, includePool: choices.pool,
    }).filter(area => area.name !== 'Exterior'
        && (area.name !== 'Front Yard' || choices.frontYard)
        && (area.name !== 'Back Yard' || choices.backYard))
        .map(area => ({
            name: area.name,
            // The shared mechanical room must not lose its plumbing equipment
            // just because optional HVAC was selected. Each item is still trade-checked.
            system: area.name === 'Mechanical Area' && choices.waterHeater !== false ? 'Plumbing' : area.system,
            scope: ['Front Yard', 'Back Yard', 'Pool Area'].includes(area.name) ? 'exterior' : 'interior',
            items: area.starterItems.map(item => ({
                name: item.name, system: item.system, category: item.category, parentName: item.parentName || null,
            })),
        }));
}

export function homeSetupRoute(propertyId: string) {
    return `/onboarding/base-home-wizard?propertyId=${encodeURIComponent(propertyId)}`;
}

export function isHomeSetupComplete(status: HomeSetupStatus) {
    return !status.needs_details && !status.needs_choice && status.starter_state !== 'pending'
        && !!status.completed_at;
}

// One automatic attempt per signed-in owner/property per app session. No timers,
// recursive retries, or treating a failed read as missing data. Manual retry is
// explicit. The database lock/checkpoints provide cross-device idempotency.
export function createHomeSetupInspector(deps: {
    read: (scope: HomeSetupScope) => Promise<HomeSetupStatus>;
    finish: (scope: HomeSetupScope) => Promise<HomeSetupStatus>;
}) {
    const attempted = new Set<string>();
    const inflight = new Map<string, Promise<HomeSetupStatus>>();
    return (scope: HomeSetupScope, manualRetry = false) => {
        const key = `${scope.userId}:${scope.propertyId}`;
        const existing = inflight.get(key);
        if (existing) return existing;
        const promise = (async () => {
            const status = await deps.read(scope);
            if (status.property_id !== scope.propertyId) throw new Error('Home setup response did not match this home.');
            if (status.can_retry && (manualRetry || !attempted.has(key))) {
                attempted.add(key);
                const finished = await deps.finish(scope);
                if (finished.property_id !== scope.propertyId) throw new Error('Home setup response did not match this home.');
                return { ...finished, recovered: isHomeSetupComplete(finished) };
            }
            return status;
        })().finally(() => inflight.delete(key));
        inflight.set(key, promise);
        return promise;
    };
}
