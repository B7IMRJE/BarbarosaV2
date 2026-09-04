import { listActivePropertyMemberships, requireActivePropertyMembership } from './activeProperty';
import { supabase } from './supabase';
import {
    createHomeSetupInspector, type HomeSetupScope, type HomeSetupStatus,
} from './home-setup-integrity-core';
export * from './home-setup-integrity-core';

export async function resolveOwnedHomeSetupScope(propertyId?: string): Promise<HomeSetupScope | null> {
    // A supplied ID is an exact target, never a hint that can fall back to a
    // different selected property. Server RPCs additionally verify owner_id.
    if (propertyId) {
        const result = await listActivePropertyMemberships();
        const membership = result.memberships.find(row => row.propertyId === propertyId);
        if (!membership || membership.membershipRole.toUpperCase() !== 'OWNER') {
            throw new Error('Open this setup from the account that owns this home.');
        }
        return { userId: result.userId, propertyId };
    }
    const active = await requireActivePropertyMembership();
    if (active.membershipRole.toUpperCase() !== 'OWNER') return null;
    return { userId: active.userId, propertyId: active.propertyId };
}

async function setupRpc(scope: HomeSetupScope, name: string, values: Record<string, unknown> = {}) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || user.id !== scope.userId) {
        throw new Error('Your account changed. Reopen this home to continue setup.');
    }
    const { data, error } = await supabase.rpc(name, { ...values, p_property_id: scope.propertyId });
    if (error) throw new Error(`Could not check or finish home setup: ${error.message}. Your home is saved; retry when connected.`);
    if (!data || data.property_id !== scope.propertyId || typeof data.needs_details !== 'boolean'
        || typeof data.needs_choice !== 'boolean' || typeof data.can_retry !== 'boolean'
        || !['unselected', 'legacy_review', 'pending', 'complete', 'empty', 'existing'].includes(data.starter_state)) {
        throw new Error('Home setup could not be verified. Please try again.');
    }
    return data as HomeSetupStatus;
}

export const readHomeSetup = (scope: HomeSetupScope) => setupRpc(scope, 'get_my_home_setup');
export const finishHomeSetup = (scope: HomeSetupScope) => setupRpc(scope, 'finish_my_home_starter_setup');
export const inspectHomeSetup = createHomeSetupInspector({ read: readHomeSetup, finish: finishHomeSetup });
export const saveHomeSetupStory = (scope: HomeSetupScope, storyCount: string) => setupRpc(scope,
    'save_my_home_setup_story', { p_story_count: storyCount });
export const chooseHomeSetup = (scope: HomeSetupScope, plan: unknown, keepEmpty = false) => setupRpc(scope,
    'choose_my_home_starter_setup', { p_plan: plan, p_keep_empty: keepEmpty });
