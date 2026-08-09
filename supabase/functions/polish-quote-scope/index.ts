declare const Deno: {
    env: { get(name: string): string | undefined };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SCOPE_LENGTH = 8_000;

type FunctionEnv = {
    supabaseUrl: string;
    publishableKey: string;
    openAiApiKey: string;
    model: string;
};

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') return handleOptions(req);
        if (req.method !== 'POST') return errorJson(req, 405, 'method_not_allowed', 'Method not allowed.');

        try {
            const env = loadEnv();
            const token = bearerToken(req);

            if (!token) return errorJson(req, 401, 'not_authenticated', 'Please sign in again before using AI assistance.');
            if (!env.openAiApiKey) {
                return errorJson(req, 501, 'openai_not_configured', 'AI scope polishing is not configured. Your notes were not changed.');
            }

            const body = await readJsonBody(req);
            const sessionId = readString(body.session_id);
            const roughScope = readString(body.rough_scope);

            if (!UUID_PATTERN.test(sessionId)) return errorJson(req, 400, 'invalid_session', 'A valid quote session is required.');
            if (!roughScope) return errorJson(req, 400, 'missing_scope', 'Add rough scope notes before asking AI to polish them.');
            if (roughScope.length > MAX_SCOPE_LENGTH) return errorJson(req, 413, 'scope_too_long', 'Shorten the scope notes before asking AI to polish them.');
            if (!await isAuthenticated(env, token)) return errorJson(req, 401, 'not_authenticated', 'Please sign in again before using AI assistance.');

            const authorization = await authorizeEstimateSession(env, token, sessionId);
            if (!authorization.allowed) {
                return errorJson(req, authorization.status, authorization.code, authorization.message);
            }

            const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.openAiApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: env.model,
                    input: [
                        {
                            role: 'system',
                            content: [{
                                type: 'input_text',
                                text: [
                                    'Rewrite technician rough notes into a concise, professional, editable scope of work.',
                                    'Preserve every supplied fact and the technician’s meaning.',
                                    'Organize requested work, materials, testing, cleanup, and other inclusions only when those details appear in the source notes.',
                                    'Omit any category the source does not address. Never fill gaps or infer customary work.',
                                    'Never add or calculate price, quantities, materials, equipment, brands, model numbers, permits, code compliance, safety claims, warranties, guarantees, timelines, diagnostic conclusions, testing steps, cleanup, or work details not explicitly supplied.',
                                    'Do not make the scope broader than the notes. Do not use sales language or imply certainty beyond the notes.',
                                    'Return JSON only.',
                                ].join(' '),
                            }],
                        },
                        {
                            role: 'user',
                            content: [{
                                type: 'input_text',
                                text: JSON.stringify({ task: 'Polish this quote scope without adding facts.', rough_scope: roughScope }),
                            }],
                        },
                    ],
                    text: {
                        format: {
                            type: 'json_schema',
                            name: 'polished_quote_scope',
                            strict: true,
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['polished_scope'],
                                properties: { polished_scope: { type: 'string' } },
                            },
                        },
                    },
                    max_output_tokens: 1_500,
                }),
            });
            const responseText = await openAiResponse.text();
            const responseBody = parseRecord(responseText);

            if (!openAiResponse.ok) {
                const detail = readString(readRecord(responseBody?.error)?.message);
                return errorJson(
                    req,
                    openAiResponse.status === 429 ? 503 : 502,
                    'openai_request_failed',
                    detail || 'AI scope polishing is unavailable. Your notes were not changed.',
                );
            }

            const outputText = extractOutputText(responseBody);
            const output = parseRecord(outputText);
            const polishedScope = readString(output?.polished_scope);

            if (!polishedScope || polishedScope.length > MAX_SCOPE_LENGTH) {
                return errorJson(req, 422, 'invalid_ai_response', 'AI returned an unusable scope. Your notes were not changed.');
            }
            if (introducesUnsupportedNumbers(roughScope, polishedScope)) {
                return errorJson(req, 422, 'unsupported_numbers', 'AI attempted to add unsupported numeric details. Your notes were not changed.');
            }

            return json(req, { ok: true, polished_scope: polishedScope });
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            return errorJson(req, 500, 'unexpected_error', message || 'AI scope polishing is temporarily unavailable. Your notes were not changed.');
        }
    },
};

function loadEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requiredEnv('SUPABASE_URL')),
        publishableKey: publishableKey(),
        openAiApiKey: Deno.env.get('OPENAI_API_KEY') || '',
        model: Deno.env.get('QUOTE_SCOPE_POLISH_MODEL') || 'gpt-4.1-mini',
    };
}

async function isAuthenticated(env: FunctionEnv, token: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}` },
    });

    return response.ok;
}

async function authorizeEstimateSession(env: FunctionEnv, token: string, sessionId: string) {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/get_estimate_option_session_for_draft`, {
        method: 'POST',
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_session_id: sessionId }),
    });
    const body = parseJson<unknown>(await response.text());
    const row = Array.isArray(body) ? readRecord(body[0]) : readRecord(body);

    if (!response.ok) return { allowed: false, status: response.status, code: 'session_authorization_failed', message: 'Quote access could not be verified.' };
    if (row?.allowed === true) return { allowed: true, status: 200, code: '', message: '' };

    const code = readString(row?.denial_code) || 'session_not_authorized';
    const status = code === 'not_authenticated' ? 401 : code === 'session_not_found' ? 404 : 403;

    return { allowed: false, status, code, message: readString(row?.denial_message) || 'This account cannot use the requested quote.' };
}

function introducesUnsupportedNumbers(source: string, result: string) {
    const sourceNumbers = new Set(source.match(/\b\d+(?:[.,]\d+)*\b/g) || []);
    const resultNumbers = result.match(/\b\d+(?:[.,]\d+)*\b/g) || [];

    return resultNumbers.some((value) => !sourceNumbers.has(value));
}

function extractOutputText(body: Record<string, unknown> | null) {
    const direct = readString(body?.output_text);
    if (direct) return direct;

    const output = Array.isArray(body?.output) ? body.output : [];
    for (const item of output) {
        const record = readRecord(item);
        const content = Array.isArray(record?.content) ? record.content : [];
        for (const part of content) {
            const text = readString(readRecord(part)?.text);
            if (text) return text;
        }
    }

    return '';
}

async function readJsonBody(req: Request) {
    try {
        const body = await req.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        return body as Record<string, unknown>;
    } catch {
        throw new Error('Invalid AI scope request.');
    }
}

function requiredEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`AI scope polishing is not configured: ${name} is missing.`);
    return value;
}

function publishableKey() {
    const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    if (direct) return direct;
    const configured = parseJson<unknown>(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '');
    if (Array.isArray(configured)) {
        const first = configured.map((entry) => readString(readRecord(entry)?.value || entry)).find(Boolean);
        if (first) return first;
    }
    throw new Error('AI scope polishing is not configured: Supabase publishable key is missing.');
}

function bearerToken(req: Request) {
    return /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '')?.[1]?.trim() || '';
}

function normalizeUrl(value: string) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function handleOptions(req: Request) {
    return new Response('ok', { headers: corsHeaders(req) });
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
    });
}

function errorJson(req: Request, status: number, code: string, message: string) {
    return json(req, { ok: false, code, message }, status);
}

function corsHeaders(req: Request) {
    return {
        'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        Vary: 'Origin',
    };
}

function parseRecord(value: string) {
    return readRecord(parseJson<unknown>(value));
}

function parseJson<T>(value: string): T | null {
    try { return JSON.parse(value) as T; } catch { return null; }
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
