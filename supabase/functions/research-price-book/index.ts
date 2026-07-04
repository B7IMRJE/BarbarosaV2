declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type FunctionEnv = {
    supabaseUrl: string;
    publishableKey: string;
    openAiApiKey: string;
    model: string;
};

type AuthUser = {
    id: string;
    email?: string;
};

type PriceResearchItem = {
    price_key: string;
    name: string;
    system: string;
    category: string;
    current_price: number | null;
    unit: string;
    labor_hours: number | null;
    material_cost: number | null;
    notes: string | null;
};

type ResearchSuggestion = {
    item_key: string;
    name: string;
    suggested_low_price: number | null;
    suggested_average_price: number | null;
    suggested_high_price: number | null;
    recommended_price: number | null;
    confidence: 'low' | 'medium' | 'high';
    reasoning_summary: string;
    assumptions: string[];
    caution_notes: string[];
    source_notes: string[];
    apply_allowed: boolean;
};

type OpenAiPriceResearchResult = {
    suggestions: ResearchSuggestion[];
};

type RpcErrorBody = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

type PriceResearchRequest = {
    company_id: string;
    company_name: string;
    service_area_zip: string;
    city: string;
    trade: string;
    pricing_positioning: 'budget' | 'market_average' | 'premium';
    target_margin_percent: number | null;
    notes: string;
    items: PriceResearchItem[];
};

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return json(req, { ok: false, code: 'method_not_allowed', message: 'Method not allowed.' }, 405);
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return json(req, { ok: false, code: 'not_authenticated', message: 'Not authenticated.' }, 401);
            }

            if (!env.openAiApiKey) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'openai_not_configured',
                        message: 'AI price research is not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.',
                    },
                    501
                );
            }

            const body = await readJsonBody(req);
            const payload = readPriceResearchRequest(body);
            const user = await loadAuthUser(env, authToken);

            if (!user) {
                return json(req, { ok: false, code: 'not_authenticated', message: 'Not authenticated.' }, 401);
            }

            const canManage = await verifyPriceBookManageAccess(env, authToken, user.id, payload.company_id);

            if (!canManage) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'not_authorized',
                        message: 'You do not have permission to research prices for this company price book.',
                    },
                    403
                );
            }

            const suggestions = await researchPricesWithOpenAi(env, payload);

            return json(req, {
                ok: true,
                code: 'suggestions_ready',
                message: 'AI-assisted price suggestions generated. Review carefully before applying.',
                model: env.model,
                research_note: 'AI estimate based on provided company/item context, not live market research.',
                suggestions,
            });
        } catch (error) {
            if (error instanceof RequestError) {
                return json(req, { ok: false, code: error.code, message: error.safeMessage }, error.status);
            }

            const message = error instanceof Error ? error.message : 'Unexpected price research error.';

            return json(req, { ok: false, code: 'unexpected_error', message }, 500);
        }
    },
};

function handleOptions(req: Request) {
    return new Response('ok', {
        status: 200,
        headers: corsHeaders(req),
    });
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
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = resolveAllowedCorsOrigin(origin) || origin || '*';

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

function resolveAllowedCorsOrigin(origin: string) {
    if (!origin) return '';

    const allowedOrigins = new Set<string>();

    for (const configuredOrigin of [
        Deno.env.get('PUBLIC_APP_URL'),
        Deno.env.get('APP_BASE_URL'),
        ...parseCsv(Deno.env.get('PRICE_RESEARCH_CORS_ORIGINS')),
    ]) {
        if (!configuredOrigin) continue;

        try {
            allowedOrigins.add(new URL(configuredOrigin).origin);
        } catch {
            // Ignore malformed entries instead of widening access.
        }
    }

    return allowedOrigins.has(origin) ? origin : '';
}

function loadFunctionEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requireEnv('SUPABASE_URL', 'SUPABASE_URL')),
        publishableKey: getPublishableKey(),
        openAiApiKey: Deno.env.get('OPENAI_API_KEY') || '',
        model: Deno.env.get('PRICE_RESEARCH_MODEL') || 'gpt-4.1-mini',
    };
}

function requireEnv(name: string, secretName: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new RequestError(
            500,
            `missing_${name.toLowerCase()}`,
            `Price research is not configured. Set ${secretName} in Supabase Edge Function secrets.`
        );
    }

    return value;
}

function getPublishableKey() {
    const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (directKey) return directKey;

    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');

    if (publishableKeysJson) {
        try {
            const parsed = JSON.parse(publishableKeysJson) as Record<string, unknown>;
            const defaultKey = parsed.default;

            if (typeof defaultKey === 'string' && defaultKey) return defaultKey;

            const firstKey = Object.values(parsed).find((value) => typeof value === 'string' && value);

            if (typeof firstKey === 'string') return firstKey;
        } catch {
            throw new RequestError(
                500,
                'invalid_supabase_publishable_keys',
                'Price research is not configured. Set SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY in Supabase Edge Function secrets.'
            );
        }
    }

    throw new RequestError(
        500,
        'missing_supabase_publishable_key',
        'Price research is not configured. Set SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY in Supabase Edge Function secrets.'
    );
}

function normalizeUrl(value: string) {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new RequestError(500, 'invalid_supabase_url', 'Price research Supabase URL is invalid.');
    }

    return url.toString().replace(/\/+$/, '');
}

function getBearerToken(req: Request) {
    const authorization = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1]?.trim() || null;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) return {};

        return body as Record<string, unknown>;
    } catch {
        throw new RequestError(400, 'invalid_json', 'Invalid price research request.');
    }
}

function readPriceResearchRequest(body: Record<string, unknown>): PriceResearchRequest {
    const companyId = readString(body.company_id);

    if (!UUID_PATTERN.test(companyId)) {
        throw new RequestError(400, 'invalid_company_id', 'Company id is required for AI price research.');
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
        .map(readPriceResearchItem)
        .filter((item): item is PriceResearchItem => Boolean(item))
        .slice(0, 20);

    if (items.length === 0) {
        throw new RequestError(400, 'missing_items', 'Add at least one price book item before researching prices.');
    }

    return {
        company_id: companyId,
        company_name: readString(body.company_name) || 'Company',
        service_area_zip: readString(body.service_area_zip),
        city: readString(body.city),
        trade: readString(body.trade) || 'Home service',
        pricing_positioning: readPositioning(body.pricing_positioning),
        target_margin_percent: readNullableNumber(body.target_margin_percent),
        notes: readString(body.notes),
        items,
    };
}

function readPriceResearchItem(value: unknown): PriceResearchItem | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const row = value as Record<string, unknown>;
    const priceKey = readString(row.price_key || row.item_key);
    const name = readString(row.name);

    if (!priceKey || !name) return null;

    return {
        price_key: priceKey,
        name,
        system: readString(row.system) || 'Other',
        category: readString(row.category) || 'Service',
        current_price: readNullableNumber(row.current_price),
        unit: readString(row.unit) || 'each',
        labor_hours: readNullableNumber(row.labor_hours),
        material_cost: readNullableNumber(row.material_cost),
        notes: readNullableString(row.notes),
    };
}

function readPositioning(value: unknown): PriceResearchRequest['pricing_positioning'] {
    const normalized = readString(value).toLowerCase().replace(/\s+/g, '_');

    if (normalized === 'budget' || normalized === 'market_average' || normalized === 'premium') {
        return normalized;
    }

    return 'market_average';
}

async function loadAuthUser(env: FunctionEnv, authToken: string): Promise<AuthUser | null> {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${authToken}`,
        },
    });

    if (!response.ok) return null;

    const data = parseRecord(await response.text());
    const id = readString(data?.id);

    return id ? { id, email: readString(data?.email) || undefined } : null;
}

async function verifyPriceBookManageAccess(
    env: FunctionEnv,
    authToken: string,
    userId: string,
    companyId: string
) {
    const rpcAccess = await invokeBooleanRpc(env, authToken, 'company_price_book_can_manage', {
        p_company_id: companyId,
    });

    if (rpcAccess === true) return true;

    if (await isPlatformAdmin(env, authToken, userId)) return true;

    return isActiveManagerRole(await loadCompanyUser(env, authToken, userId, companyId));
}

async function invokeBooleanRpc(
    env: FunctionEnv,
    authToken: string,
    functionName: string,
    payload: Record<string, unknown>
): Promise<boolean | null> {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: restHeaders(env, authToken),
        body: JSON.stringify(payload),
    });

    const text = await response.text();

    if (!response.ok) return null;

    const parsed = parseJson<unknown>(text);

    return typeof parsed === 'boolean' ? parsed : null;
}

async function isPlatformAdmin(env: FunctionEnv, authToken: string, userId: string) {
    const primary = await fetchTableRows(env, authToken, 'profiles', {
        id: `eq.${userId}`,
        select: 'role,is_platform_admin',
        limit: '1',
    });

    if (primary.ok) {
        return isPlatformAdminProfile(primary.rows[0]);
    }

    const fallback = await fetchTableRows(env, authToken, 'profiles', {
        id: `eq.${userId}`,
        select: 'role',
        limit: '1',
    });

    return fallback.ok ? isPlatformAdminProfile(fallback.rows[0]) : false;
}

async function loadCompanyUser(env: FunctionEnv, authToken: string, userId: string, companyId: string) {
    const result = await fetchTableRows(env, authToken, 'company_users', {
        company_id: `eq.${companyId}`,
        auth_user_id: `eq.${userId}`,
        select: 'role,status',
        limit: '1',
    });

    return result.ok ? result.rows[0] : null;
}

async function fetchTableRows(
    env: FunctionEnv,
    authToken: string,
    table: string,
    params: Record<string, string>
) {
    const url = new URL(`/rest/v1/${table}`, env.supabaseUrl);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
        method: 'GET',
        headers: restHeaders(env, authToken),
    });

    if (!response.ok) return { ok: false, rows: [] as Record<string, unknown>[] };

    const parsed = parseJson<unknown>(await response.text());

    return {
        ok: Array.isArray(parsed),
        rows: Array.isArray(parsed) ? parsed.filter(isRecord) : [],
    };
}

function isPlatformAdminProfile(profile?: Record<string, unknown> | null) {
    return (
        readString(profile?.role).trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function isActiveManagerRole(companyUser?: Record<string, unknown> | null) {
    const role = readString(companyUser?.role).trim().toLowerCase();
    const status = readString(companyUser?.status).trim().toLowerCase();

    return status === 'active' && ['owner', 'admin', 'manager'].includes(role);
}

function restHeaders(env: FunctionEnv, authToken: string) {
    return {
        apikey: env.publishableKey,
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Info': 'barbarosa-price-book-research-edge',
    };
}

async function researchPricesWithOpenAi(env: FunctionEnv, payload: PriceResearchRequest) {
    const response = await fetch('https://api.openai.com/v1/responses', {
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
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'You are a pricing research assistant for a home-service company price book.',
                                'Return structured JSON only.',
                                'You do not have live web browsing in this function.',
                                'Do not invent source URLs.',
                                'Use provided item context, trade, service area, target margin, positioning, and common home-service pricing reasoning.',
                                'If information is insufficient, use low confidence and list assumptions.',
                                'All prices are USD.',
                                'Never say a price is guaranteed.',
                            ].join(' '),
                        },
                    ],
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: JSON.stringify({
                                task: 'Suggest price book prices for manual review.',
                                research_note: 'AI estimate based on provided company/item context, not live market research.',
                                payload,
                            }),
                        },
                    ],
                },
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: 'price_book_research_result',
                    strict: true,
                    schema: priceResearchSchema(),
                },
            },
            max_output_tokens: 5000,
        }),
    });

    const responseText = await response.text();

    if (!response.ok) {
        const body = parseRecord(responseText);
        const openAiMessage = readString(readRecord(body?.error)?.message) || responseText.slice(0, 240);
        throw new RequestError(
            response.status >= 400 && response.status < 600 ? response.status : 502,
            'openai_request_failed',
            `AI price research failed: ${openAiMessage || 'OpenAI request failed.'}`
        );
    }

    const body = parseRecord(responseText);
    const outputText = extractOutputText(body);

    if (!outputText) {
        throw new RequestError(502, 'openai_empty_response', 'AI price research returned no structured output.');
    }

    const parsed = parseJson<unknown>(outputText);
    const result = readOpenAiPriceResearchResult(parsed);

    if (!result.suggestions.length) {
        throw new RequestError(502, 'openai_no_suggestions', 'AI price research returned no suggestions.');
    }

    return result.suggestions.map(normalizeSuggestion);
}

function priceResearchSchema() {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['suggestions'],
        properties: {
            suggestions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'item_key',
                        'name',
                        'suggested_low_price',
                        'suggested_average_price',
                        'suggested_high_price',
                        'recommended_price',
                        'confidence',
                        'reasoning_summary',
                        'assumptions',
                        'caution_notes',
                        'source_notes',
                        'apply_allowed',
                    ],
                    properties: {
                        item_key: { type: 'string' },
                        name: { type: 'string' },
                        suggested_low_price: { type: ['number', 'null'] },
                        suggested_average_price: { type: ['number', 'null'] },
                        suggested_high_price: { type: ['number', 'null'] },
                        recommended_price: { type: ['number', 'null'] },
                        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                        reasoning_summary: { type: 'string' },
                        assumptions: { type: 'array', items: { type: 'string' } },
                        caution_notes: { type: 'array', items: { type: 'string' } },
                        source_notes: { type: 'array', items: { type: 'string' } },
                        apply_allowed: { type: 'boolean' },
                    },
                },
            },
        },
    };
}

function extractOutputText(body: Record<string, unknown> | null) {
    const direct = readString(body?.output_text);

    if (direct) return direct;

    const output = Array.isArray(body?.output) ? body?.output : [];

    for (const outputItem of output) {
        if (!isRecord(outputItem)) continue;

        const content = Array.isArray(outputItem.content) ? outputItem.content : [];

        for (const contentItem of content) {
            if (!isRecord(contentItem)) continue;

            const text = readString(contentItem.text);

            if (text) return text;
        }
    }

    return '';
}

function readOpenAiPriceResearchResult(value: unknown): OpenAiPriceResearchResult {
    const record = isRecord(value) ? value : {};
    const suggestions = Array.isArray(record.suggestions)
        ? record.suggestions.map(readSuggestion).filter((suggestion): suggestion is ResearchSuggestion => Boolean(suggestion))
        : [];

    return { suggestions };
}

function readSuggestion(value: unknown): ResearchSuggestion | null {
    if (!isRecord(value)) return null;

    const itemKey = readString(value.item_key);
    const name = readString(value.name);
    const recommendedPrice = readNullableNumber(value.recommended_price);

    if (!itemKey || !name || recommendedPrice === null) return null;

    return {
        item_key: itemKey,
        name,
        suggested_low_price: readNullableNumber(value.suggested_low_price),
        suggested_average_price: readNullableNumber(value.suggested_average_price),
        suggested_high_price: readNullableNumber(value.suggested_high_price),
        recommended_price: recommendedPrice,
        confidence: readConfidence(value.confidence),
        reasoning_summary: readString(value.reasoning_summary),
        assumptions: readStringArray(value.assumptions),
        caution_notes: readStringArray(value.caution_notes),
        source_notes: readStringArray(value.source_notes),
        apply_allowed: value.apply_allowed === true,
    };
}

function normalizeSuggestion(suggestion: ResearchSuggestion): ResearchSuggestion {
    return {
        ...suggestion,
        suggested_low_price: normalizePrice(suggestion.suggested_low_price),
        suggested_average_price: normalizePrice(suggestion.suggested_average_price),
        suggested_high_price: normalizePrice(suggestion.suggested_high_price),
        recommended_price: normalizePrice(suggestion.recommended_price),
        source_notes: suggestion.source_notes.length
            ? suggestion.source_notes
            : ['AI estimate based on provided company/item context, not live market research.'],
        caution_notes: suggestion.caution_notes.length
            ? suggestion.caution_notes
            : ['Review carefully. Pricing varies by market, code requirements, access, and job conditions.'],
    };
}

function normalizePrice(value: number | null) {
    if (value === null || !Number.isFinite(value)) return null;

    return Math.round(Math.max(0, value) * 100) / 100;
}

function readConfidence(value: unknown): ResearchSuggestion['confidence'] {
    const normalized = readString(value).toLowerCase();

    if (normalized === 'medium' || normalized === 'high') return normalized;

    return 'low';
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readNullableNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsed = Number.parseFloat(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map(readString).filter(Boolean).slice(0, 8)
        : [];
}

function readRecord(value: unknown) {
    return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseRecord(value: string) {
    const parsed = parseJson<unknown>(value);

    return isRecord(parsed) ? parsed : null;
}

function parseJson<T>(value: string): T | null {
    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function parseCsv(value: string | undefined) {
    return String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

class RequestError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        public readonly safeMessage: string
    ) {
        super(safeMessage);
    }
}
