declare const Deno: { env: { get(name: string): string | undefined } };

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

export default {
    async fetch(request: Request): Promise<Response> {
        if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

        const url = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const authorization = request.headers.get('authorization') || '';
        if (!url || !anonKey || !serviceKey) return json({ error: 'Function configuration is incomplete.' }, 500);
        if (!authorization.startsWith('Bearer ')) return json({ error: 'Authentication required.' }, 401);

        const adminCheck = await fetch(`${url}/rest/v1/rpc/homeos_is_platform_admin`, {
            method: 'POST',
            headers: { apikey: anonKey, authorization, 'Content-Type': 'application/json' },
            body: '{}',
        });
        if (!adminCheck.ok || await adminCheck.json() !== true) return json({ error: 'Platform administrator access required.' }, 403);

        const input = await request.json().catch(() => ({}));
        const announcementId = String(input.announcement_id || '').trim();
        if (!announcementId) return json({ error: 'announcement_id is required.' }, 400);

        const adminHeaders = {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
        };
        const announcementResponse = await fetch(
            `${url}/rest/v1/platform_announcements?id=eq.${encodeURIComponent(announcementId)}&select=id,title,destination_route`,
            { headers: adminHeaders }
        );
        const announcements = await announcementResponse.json();
        const announcement = announcements?.[0];
        if (!announcement) return json({ error: 'Announcement not found.' }, 404);

        const recipientsResponse = await fetch(
            `${url}/rest/v1/platform_announcement_recipients?announcement_id=eq.${encodeURIComponent(announcementId)}&push_status=eq.queued&select=user_id`,
            { headers: adminHeaders }
        );
        const recipients = await recipientsResponse.json();
        const userIds = [...new Set((recipients || []).map((item: { user_id: string }) => item.user_id))] as string[];
        if (userIds.length === 0) return json({ ok: true, queued: 0, delivered: 0 });

        const devicesResponse = await fetch(
            `${url}/rest/v1/communication_push_devices?active=eq.true&user_id=in.(${userIds.join(',')})&select=user_id,expo_push_token`,
            { headers: adminHeaders }
        );
        const devices = await devicesResponse.json();
        let delivered = 0;
        const failedUsers = new Set<string>();
        const deliveredUsers = new Set<string>();

        for (let offset = 0; offset < devices.length; offset += 100) {
            const batch = devices.slice(offset, offset + 100);
            const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(batch.map((device: { user_id: string; expo_push_token: string }) => ({
                    to: device.expo_push_token,
                    sound: 'default',
                    title: 'HomeOS update',
                    body: 'You have a new update from HomeOS.',
                    data: { announcementId, route: announcement.destination_route || '/notifications' },
                    channelId: 'homeos-updates',
                }))),
            });
            const tickets = pushResponse.ok ? (await pushResponse.json())?.data || [] : [];
            batch.forEach((device: { user_id: string }, index: number) => {
                if (tickets[index]?.status === 'ok') {
                    delivered += 1;
                    deliveredUsers.add(device.user_id);
                } else {
                    failedUsers.add(device.user_id);
                }
            });
        }

        for (const userId of userIds) {
            const status = deliveredUsers.has(userId) ? 'delivered' : 'failed';
            await fetch(
                `${url}/rest/v1/platform_announcement_recipients?announcement_id=eq.${encodeURIComponent(announcementId)}&user_id=eq.${encodeURIComponent(userId)}`,
                { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ push_status: status }) }
            );
        }
        return json({ ok: true, queued: userIds.length, delivered, failed: failedUsers.size });
    },
};

function json(value: unknown, status = 200) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });
}
