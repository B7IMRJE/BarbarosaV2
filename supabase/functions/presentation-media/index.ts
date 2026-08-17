declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type ApprovedMedia = {
    bucket?: unknown;
    storage_path?: unknown;
    title?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVED_BUCKETS = new Set(['company-product-catalog', 'catalog-factory-media']);

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') return response(req, 200, { ok: true });
        if (req.method !== 'POST') return response(req, 405, { ok: false, message: 'Method not allowed.' });

        try {
            const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
            const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
            const body = await req.json().catch(() => ({})) as Record<string, unknown>;
            const viewerToken = readText(body.viewer_token);
            const mediaId = readText(body.media_id);

            if (viewerToken.length < 32 || viewerToken.length > 96 || !UUID_PATTERN.test(mediaId)) {
                return response(req, 400, { ok: false, message: 'Presentation photo request is invalid.' });
            }

            const media = await validateMediaAccess(supabaseUrl, serviceRoleKey, viewerToken, mediaId);

            if (!media) {
                return response(req, 404, { ok: false, message: 'This photo is unavailable for the current presentation.' });
            }

            const bucket = readText(media.bucket);
            const storagePath = readText(media.storage_path);

            if (!APPROVED_BUCKETS.has(bucket) || !storagePath) {
                return response(req, 404, { ok: false, message: 'This photo is unavailable for the current presentation.' });
            }

            const signedUrl = await createSignedUrl(supabaseUrl, serviceRoleKey, bucket, storagePath);

            return response(req, 200, {
                ok: true,
                signed_url: signedUrl,
                title: readText(media.title) || 'Approved product photo',
                expires_in_seconds: 300,
            });
        } catch (error) {
            return response(req, 500, {
                ok: false,
                message: 'The approved presentation photo could not be opened.',
                detail: error instanceof Error ? error.message : 'Unexpected presentation media error.',
            });
        }
    },
};

async function validateMediaAccess(
    supabaseUrl: string,
    serviceRoleKey: string,
    viewerToken: string,
    mediaId: string
): Promise<ApprovedMedia | null> {
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/validate_estimate_presentation_media_access`, {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({
            p_viewer_token: viewerToken,
            p_media_id: mediaId,
        }),
    });

    if (!result.ok) throw new Error(`Presentation media authorization failed (${result.status}).`);
    const rows = await result.json() as unknown;

    return Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
        ? rows[0] as ApprovedMedia
        : null;
}

async function createSignedUrl(
    supabaseUrl: string,
    serviceRoleKey: string,
    bucket: string,
    storagePath: string
) {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const result = await fetch(`${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
        method: 'POST',
        headers: serviceHeaders(serviceRoleKey),
        body: JSON.stringify({ expiresIn: 300 }),
    });

    if (!result.ok) throw new Error(`Presentation photo signing failed (${result.status}).`);
    const payload = await result.json() as Record<string, unknown>;
    const signedPath = readText(payload.signedURL) || readText(payload.signedUrl);

    if (!signedPath) throw new Error('Presentation photo signing did not return a URL.');

    return signedPath.startsWith('http') ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;
}

function requiredEnv(name: string) {
    const value = Deno.env.get(name)?.trim();

    if (!value) throw new Error(`${name} is not configured.`);

    return value;
}

function serviceHeaders(serviceRoleKey: string) {
    return {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
    };
}

function response(req: Request, status: number, body: Record<string, unknown>) {
    const origin = req.headers.get('Origin') || '*';

    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Max-Age': '86400',
            Vary: 'Origin',
        },
    });
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
