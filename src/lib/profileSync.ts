import { supabase } from './supabase';
import { cleanOptionalProfileText } from './profileSyncInput';

export type SelfProfileRole = 'HOMEOWNER' | 'WORK';

export type SyncMyProfileInput = {
    fullName?: string | null;
    phone?: string | null;
    role: SelfProfileRole;
};

export async function syncMyProfile(input: SyncMyProfileInput) {
    const { error } = await supabase.rpc('sync_my_profile', {
        p_full_name: cleanOptionalProfileText(input.fullName),
        p_phone: input.role === 'HOMEOWNER' ? cleanOptionalProfileText(input.phone) : null,
        p_requested_role: input.role,
    });

    if (error) {
        throw new Error(`Could not prepare your secure profile: ${error.message}`);
    }
}
