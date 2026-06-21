declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type GoogleSuggestion = {
    placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
        };
        types?: string[];
    };
};

const MIN_QUERY_LENGTH = 4;
const MAX_QUERY_LENGTH = 160;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,36}$/;

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
            const input = normalizeText(body.input, MAX_QUERY_LENGTH);
            const sessionToken = normalizeSessionToken(body.sessionToken);

            if (!sessionToken) {
                return json(req, { ok: false, code: 'invalid_session_token' }, 400);
            }

            if (input.length < MIN_QUERY_LENGTH) {
                return json(req, { ok: true, predictions: [] });
            }

            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': env.googleApiKey,
                    'X-Goog-FieldMask':
                        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.types',
                },
                body: JSON.stringify({
                    input,
                    sessionToken,
                    includedRegionCodes: ['us'],
                    includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
                    languageCode: 'en',
                    regionCode: 'us',
                }),
            });

            if (!response.ok) {
                return json(req, { ok: false, code: 'address_search_unavailable' }, 502);
            }

            const data = (await response.json().catch(() => null)) as { suggestions?: GoogleSuggestion[] } | null;
            const predictions = (data?.suggestions || [])
                .map((suggestion) => suggestion.placePrediction)
                .filter((prediction) => prediction?.placeId && prediction?.text?.text)
                .map((prediction) => ({
                    placeId: prediction?.placeId || '',
                    description: prediction?.text?.text || '',
                    mainText: prediction?.structuredFormat?.mainText?.text || prediction?.text?.text || '',
                    secondaryText: prediction?.structuredFormat?.secondaryText?.text || '',
                    types: Array.isArray(prediction?.types) ? prediction?.types : [],
                }));

            return json(req, { ok: true, predictions });
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

function normalizeText(value: unknown, maxLength: number) {
    return String(typeof value === 'string' ? value : '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeSessionToken(value: unknown) {
    if (typeof value !== 'string') return '';

    const token = value.trim();

    return SESSION_TOKEN_PATTERN.test(token) ? token : '';
}
