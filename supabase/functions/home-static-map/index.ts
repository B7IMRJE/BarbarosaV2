declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return json(req, { ok: true });
        }

        if (req.method !== 'POST') {
            return json(req, { ok: false, code: 'method_not_allowed' }, 405);
        }

        try {
            const authToken = getBearerToken(req);

            if (!authToken) {
                return json(req, { ok: false, code: 'not_authenticated' }, 401);
            }

            const env = loadFunctionEnv();
            const callerVerified = await verifyCaller(env, authToken);

            if (!callerVerified) {
                return json(req, { ok: false, code: 'not_authenticated' }, 401);
            }

            const body = await readJsonBody(req);
            const latitude = Number(body.latitude);
            const longitude = Number(body.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return json(req, { ok: false, code: 'invalid_coordinates' }, 400);
            }

            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                return json(req, { ok: false, code: 'invalid_coordinates' }, 400);
            }

            const marker = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
            const mapUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
            mapUrl.searchParams.set('center', marker);
            mapUrl.searchParams.set('zoom', '16');
            mapUrl.searchParams.set('size', '360x220');
            mapUrl.searchParams.set('scale', '2');
            mapUrl.searchParams.set('maptype', 'roadmap');
            mapUrl.searchParams.set('markers', `color:blue|${marker}`);
            mapUrl.searchParams.set('key', env.googleApiKey);

            const response = await fetch(mapUrl.toString());

            if (!response.ok) {
                return json(req, { ok: false, code: 'map_unavailable' }, 502);
            }

            const contentType = response.headers.get('Content-Type') || 'image/png';
            const bytes = new Uint8Array(await response.arrayBuffer());
            const dataUrl = `data:${contentType};base64,${toBase64(bytes)}`;

            return json(req, { ok: true, dataUrl });
        } catch {
            return json(req, { ok: false, code: 'unexpected_error' }, 500);
        }
    },
};

function loadFunctionEnv() {
    const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
    const publishableKey = getPublishableKey();
    const googleApiKey = requireEnv('GOOGLE_MAPS_SERVER_API_KEY');

    return { supabaseUrl, publishableKey, googleApiKey };
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(req),
            'Content-Type': 'application/json; charset=utf-8',
        },
    });
}

function corsHeaders(req: Request) {
    const origin = req.headers.get('Origin') || '*';

    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function requireEnv(name: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new Error(`Missing ${name}`);
    }

    return value;
}

function getPublishableKey() {
    const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (directKey) return directKey;

    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');

    if (publishableKeysJson) {
        const parsed = JSON.parse(publishableKeysJson) as Record<string, unknown>;
        const defaultKey = parsed.default;

        if (typeof defaultKey === 'string' && defaultKey) return defaultKey;

        const firstKey = Object.values(parsed).find((value) => typeof value === 'string' && value);

        if (typeof firstKey === 'string') return firstKey;
    }

    throw new Error('Missing Supabase publishable key');
}

function getBearerToken(req: Request) {
    const authorization = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1]?.trim() || null;
}

async function verifyCaller(env: { supabaseUrl: string; publishableKey: string }, authToken: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${authToken}`,
        },
    });

    if (!response.ok) return false;

    const data = (await response.json().catch(() => null)) as { id?: unknown } | null;

    return typeof data?.id === 'string' && data.id.length > 0;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {};
        }

        return body as Record<string, unknown>;
    } catch {
        return {};
    }
}

function toBase64(bytes: Uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
    }

    return btoa(binary);
}
