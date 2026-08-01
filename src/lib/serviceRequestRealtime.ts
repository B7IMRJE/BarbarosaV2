import { supabase } from './supabase';

export const SERVICE_REQUEST_REFRESH_EVENT = 'refresh';

export function companyServiceRequestTopic(companyId: string) {
    return `service-requests:company:${companyId.trim()}`;
}

export function propertyServiceRequestTopic(propertyId: string) {
    return `service-requests:property:${propertyId.trim()}`;
}

export async function broadcastServiceRequestRefresh(
    topic: string,
    payload: Record<string, unknown>
) {
    const cleanTopic = topic.trim();
    if (!cleanTopic) return false;

    const channel = supabase.channel(cleanTopic);

    try {
        await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            const timeoutId = setTimeout(finish, 2500);

            channel.subscribe((status) => {
                if (status !== 'SUBSCRIBED') return;
                clearTimeout(timeoutId);
                finish();
            });
        });

        return await channel.send({
            type: 'broadcast',
            event: SERVICE_REQUEST_REFRESH_EVENT,
            payload,
        }) === 'ok';
    } catch {
        return false;
    } finally {
        await supabase.removeChannel(channel);
    }
}
