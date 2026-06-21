declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type ValidationResponse = {
    result?: {
        verdict?: {
            validationGranularity?: string;
            geocodeGranularity?: string;
            addressComplete?: boolean;
            hasUnconfirmedComponents?: boolean;
            hasInferredComponents?: boolean;
            hasReplacedComponents?: boolean;
            hasSpellCorrectedComponents?: boolean;
            possibleNextAction?: string;
        };
        address?: {
            formattedAddress?: string;
            postalAddress?: {
                regionCode?: string;
                postalCode?: string;
                administrativeArea?: string;
                locality?: string;
                addressLines?: string[];
            };
            missingComponentTypes?: string[];
            unconfirmedComponentTypes?: string[];
            unresolvedTokens?: string[];
        };
        geocode?: {
            location?: {
                latitude?: number;
                longitude?: number;
            };
        };
    };
};

const MAX_ADDRESS_LENGTH = 220;
const MAX_UNIT_LENGTH = 60;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,36}$/;
const VALID_GRANULARITIES = new Set(['PREMISE', 'SUB_PREMISE']);
const NON_BLOCKING_COMPONENTS = new Set(['subpremise']);

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
            const placeId = normalizeText(body.placeId, 140);
            const addressText = normalizeText(body.addressText, MAX_ADDRESS_LENGTH);
            const addressLine2 = normalizeText(body.addressLine2, MAX_UNIT_LENGTH);
            const sessionToken = normalizeSessionToken(body.sessionToken);

            if (!placeId || !addressText || !sessionToken) {
                return json(req, { ok: false, code: 'invalid_address_request' }, 400);
            }

            const addressLines = addressLine2 ? [addressText, addressLine2] : [addressText];
            const url = new URL('https://addressvalidation.googleapis.com/v1:validateAddress');
            url.searchParams.set('key', env.googleApiKey);

            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: {
                        regionCode: 'US',
                        addressLines,
                    },
                    sessionToken,
                    enableUspsCass: true,
                }),
            });

            if (!response.ok) {
                return json(req, { ok: false, code: 'address_validation_unavailable' }, 502);
            }

            const data = (await response.json().catch(() => null)) as ValidationResponse | null;
            const parsed = parseValidatedAddress(data, placeId, addressLine2);

            if (!parsed.address) {
                return json(req, {
                    ok: true,
                    status: 'invalid',
                    message: parsed.message,
                    address: null,
                    requiresConfirmation: false,
                });
            }

            return json(req, {
                ok: true,
                status: parsed.requiresConfirmation ? 'needs_confirmation' : 'valid',
                message: parsed.message,
                address: parsed.address,
                requiresConfirmation: parsed.requiresConfirmation,
            });
        } catch {
            return json(req, { ok: false, code: 'unexpected_error' }, 500);
        }
    },
};

function parseValidatedAddress(data: ValidationResponse | null, placeId: string, addressLine2: string) {
    const result = data?.result;
    const verdict = result?.verdict;
    const address = result?.address;
    const postalAddress = address?.postalAddress;
    const location = result?.geocode?.location;
    const missingComponents = address?.missingComponentTypes || [];
    const unconfirmedComponents = address?.unconfirmedComponentTypes || [];
    const unresolvedTokens = address?.unresolvedTokens || [];
    const blockingMissing = missingComponents.filter((component) => !NON_BLOCKING_COMPONENTS.has(component));
    const blockingUnconfirmed = unconfirmedComponents.filter((component) => !NON_BLOCKING_COMPONENTS.has(component));
    const validationGranularity = verdict?.validationGranularity || '';
    const latitude = typeof location?.latitude === 'number' ? location.latitude : null;
    const longitude = typeof location?.longitude === 'number' ? location.longitude : null;
    const addressLine1 = postalAddress?.addressLines?.[0]?.trim() || '';
    const city = postalAddress?.locality?.trim() || '';
    const state = postalAddress?.administrativeArea?.trim() || '';
    const postalCode = postalAddress?.postalCode?.trim() || '';
    const countryCode = postalAddress?.regionCode?.trim().toUpperCase() || '';
    const formattedAddress = address?.formattedAddress?.trim() || '';

    if (
        !verdict?.addressComplete ||
        blockingMissing.length > 0 ||
        blockingUnconfirmed.length > 0 ||
        unresolvedTokens.length > 0
    ) {
        return {
            address: null,
            requiresConfirmation: false,
            message: 'Choose a complete street address before continuing.',
        };
    }

    if (!VALID_GRANULARITIES.has(validationGranularity)) {
        return {
            address: null,
            requiresConfirmation: false,
            message: 'Choose a specific home address, not a city, ZIP code, or street name.',
        };
    }

    if (!addressLine1 || !city || !state || !postalCode || countryCode !== 'US' || latitude === null || longitude === null) {
        return {
            address: null,
            requiresConfirmation: false,
            message: 'We could not confirm every required part of this address.',
        };
    }

    const requiresConfirmation =
        verdict.hasInferredComponents === true ||
        verdict.hasReplacedComponents === true ||
        verdict.hasSpellCorrectedComponents === true ||
        verdict.possibleNextAction === 'CONFIRM' ||
        verdict.possibleNextAction === 'CONFIRM_ADD_SUBPREMISES' ||
        formattedAddress.length > 0;

    return {
        address: {
            addressLine1,
            addressLine2,
            city,
            state,
            postalCode,
            countryCode,
            formattedAddress,
            latitude,
            longitude,
            googlePlaceId: placeId,
            validationStatus: 'validated',
        },
        requiresConfirmation,
        message: requiresConfirmation
            ? 'Review the confirmed address below before creating your home.'
            : 'Address confirmed.',
    };
}

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
