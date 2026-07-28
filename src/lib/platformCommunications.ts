import { supabase } from './supabase';

export type CommunicationCategory =
    | 'account_security'
    | 'job_update'
    | 'company_announcement'
    | 'product_news'
    | 'promotion';

export type CommunicationCustomer = {
    user_id: string;
    display_name: string;
    masked_email: string | null;
    masked_phone: string | null;
    city: string | null;
    state: string | null;
    account_status: string;
    relationship_status: string;
    connected_companies: { id: string; name: string; status: string }[];
    preferences: Record<string, boolean>;
    last_announcement_at: string | null;
    last_delivery_status: string | null;
    unread_count: number;
};

export type HomeOSAnnouncement = {
    id: string;
    title: string;
    body: string;
    category: CommunicationCategory;
    destination_route: string | null;
    sender_name: string;
    sent_at: string;
    read_at: string | null;
};

export type CommunicationPreferences = {
    job_updates: boolean;
    company_announcements: boolean;
    homeos_product_news: boolean;
    promotions: boolean;
    push_enabled: boolean;
    email_opt_in: boolean;
    sms_opt_in: boolean;
};

export async function loadCommunicationDirectory() {
    const result = await supabase.rpc('get_platform_communication_directory');
    if (result.error) throw result.error;
    return (result.data || []) as CommunicationCustomer[];
}

export async function loadAnnouncementHistory() {
    const result = await supabase.rpc('get_platform_announcement_history');
    if (result.error) throw result.error;
    return result.data || [];
}

export async function sendPlatformAnnouncement(input: {
    title: string;
    body: string;
    category: CommunicationCategory;
    audienceType: 'individual' | 'selected' | 'company' | 'platform';
    userIds?: string[];
    companyId?: string | null;
    destinationRoute?: string;
    requestPush?: boolean;
}) {
    const result = await supabase.rpc('create_platform_announcement', {
        p_title: input.title,
        p_body: input.body,
        p_category: input.category,
        p_audience_type: input.audienceType,
        p_user_ids: input.userIds || null,
        p_company_id: input.companyId || null,
        p_destination_route: input.destinationRoute || '/notifications',
        p_request_push: input.requestPush !== false,
    });
    if (result.error) throw result.error;
    const announcementId = result.data as string;
    if (input.requestPush !== false) {
        const pushResult = await supabase.functions.invoke('send-platform-announcement', {
            body: { announcement_id: announcementId },
        });
        if (pushResult.error) {
            console.warn('In-app announcement sent; native push delivery is pending.', pushResult.error);
        }
    }
    return announcementId;
}

export async function loadMyAnnouncements() {
    const result = await supabase.rpc('get_my_platform_announcements');
    if (result.error) throw result.error;
    return (result.data || []) as HomeOSAnnouncement[];
}

export async function markAnnouncementRead(id: string) {
    const result = await supabase.rpc('mark_platform_announcement_read', { p_announcement_id: id });
    if (result.error) throw result.error;
}

export async function loadMyCommunicationPreferences() {
    const result = await supabase.rpc('get_my_communication_preferences');
    if (result.error) throw result.error;
    return result.data as CommunicationPreferences;
}

export async function saveMyCommunicationPreferences(preferences: CommunicationPreferences) {
    const result = await supabase.rpc('update_my_communication_preferences', {
        p_job_updates: preferences.job_updates,
        p_company_announcements: preferences.company_announcements,
        p_product_news: preferences.homeos_product_news,
        p_promotions: preferences.promotions,
        p_push_enabled: preferences.push_enabled,
        p_email_opt_in: preferences.email_opt_in,
        p_sms_opt_in: preferences.sms_opt_in,
    });
    if (result.error) throw result.error;
}
