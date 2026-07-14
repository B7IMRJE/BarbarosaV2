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
};

type EstimateOptionSession = {
    id: string;
    companyId: string;
    propertyId: string | null;
    serviceRequestId: string | null;
    jobId: string | null;
    scheduleSlotId: string | null;
    homeItemId: string | null;
    category: string;
    status: string;
    source: string;
    createdByCompanyUserId: string | null;
    technicianApprovedAt: string | null;
    presentedAt: string | null;
};

type EstimateOptionDraftRequest = {
    session_id: string;
    homeowner_preferred_first_name: string;
    answered_questions: Record<string, unknown>;
    technician_notes: string;
    approved_product_candidates: ApprovedReference[];
    approved_scope_combinations: ApprovedReference[];
    deterministic_price_results: DeterministicPriceResult[];
    warranties: ApprovedReference[];
    inclusions: ApprovedReference[];
    exclusions: ApprovedReference[];
    warnings: string[];
    company_tone_rules: string[];
};

type ApprovedReference = {
    id: string;
    label: string;
};

type DeterministicPriceResult = {
    id: string;
    choice_id: string;
    kind: 'individual' | 'package';
    total_amount: number;
    scope_ids: string[];
    product_ids: string[];
    warranty_ids: string[];
    inclusion_ids: string[];
    exclusion_ids: string[];
};

type AiDraftChoice = {
    source_choice_id: string;
    kind: 'individual' | 'package';
    title: string;
    short_summary: string;
    homeowner_explanation: string;
    key_benefits: string[];
    why_it_differs: string;
    recommended_reason: string | null;
    approved_product_ids: string[];
    approved_scope_ids: string[];
    approved_warranty_ids: string[];
    inclusion_ids: string[];
    exclusion_ids: string[];
    display_order: number;
};

type AiDraftValidation = {
    valid: boolean;
    choices: AiDraftChoice[];
    errors: string[];
};

type ErrorStage =
    | 'method'
    | 'config'
    | 'auth'
    | 'validate_body'
    | 'permission'
    | 'openai'
    | 'validation'
    | 'unexpected';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return errorJson(req, 405, 'method_not_allowed', 'method', 'Method not allowed.', `Received ${req.method}.`);
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return errorJson(req, 401, 'not_authenticated', 'auth', 'Not authenticated.', 'Missing Bearer token.');
            }

            if (!env.openAiApiKey) {
                return errorJson(
                    req,
                    501,
                    'openai_not_configured',
                    'config',
                    'AI estimate option drafting is not configured. Set OPENAI_API_KEY in Supabase Edge Function secrets.',
                    'OPENAI_API_KEY is missing.'
                );
            }

            const body = await readJsonBody(req);
            const payload = readEstimateOptionDraftRequest(body);
            const user = await loadAuthUser(env, authToken);

            if (!user) {
                return errorJson(req, 401, 'not_authenticated', 'auth', 'Not authenticated.', 'Supabase auth did not return a user.');
            }

            const estimateSession = await loadEstimateSessionForDraft(env, authToken, payload.session_id, user.id);

            const result = await draftOptionsWithRetry(env, payload, estimateSession);

            if (!result.valid) {
                return errorJson(req, 422, 'ai_validation_failed', 'validation', 'AI draft validation failed.', result.errors.join(' | '));
            }

            return json(req, {
                ok: true,
                code: 'estimate_option_drafts_ready',
                message: 'AI estimate option copy drafted for technician review.',
                model: env.model,
                choices: result.choices,
            });
        } catch (error) {
            if (error instanceof RequestError) {
                return errorJson(req, error.status, error.code, error.stage, error.safeMessage, error.detail);
            }

            const message = error instanceof Error ? error.message : 'Unexpected estimate option drafting error.';

            return errorJson(req, 500, 'unexpected_error', 'unexpected', 'Unexpected estimate option drafting error.', message);
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

function errorJson(
    req: Request,
    status: number,
    code: string,
    stage: ErrorStage,
    message: string,
    detail = ''
) {
    return json(req, { ok: false, code, stage, message, detail }, status);
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
        ...parseCsv(Deno.env.get('ESTIMATE_OPTION_CORS_ORIGINS')),
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
        model: Deno.env.get('ESTIMATE_OPTION_DRAFT_MODEL') || 'gpt-4.1-mini',
    };
}

function requireEnv(name: string, secretName: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new RequestError(
            500,
            `missing_${name.toLowerCase()}`,
            'config',
            `Estimate option drafting is not configured. Set ${secretName} in Supabase Edge Function secrets.`,
            `${name} is missing.`
        );
    }

    return value;
}

function getPublishableKey() {
    const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (directKey) return directKey;

    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
    const parsed = parseJson<unknown>(publishableKeysJson || '');

    if (Array.isArray(parsed)) {
        const firstKey = parsed
            .map((entry) => readString(readRecord(entry)?.value || entry))
            .find((entry) => entry.length > 0);

        if (firstKey) return firstKey;
    }

    throw new RequestError(
        500,
        'missing_supabase_publishable_key',
        'config',
        'Estimate option drafting is not configured. Set SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY.',
        'No publishable Supabase key was found.'
    );
}

function getBearerToken(req: Request) {
    const authorization = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1]?.trim() || null;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new RequestError(400, 'invalid_request', 'validate_body', 'Invalid estimate option drafting request body.', 'Body must be a JSON object.');
        }

        return body as Record<string, unknown>;
    } catch (error) {
        if (error instanceof RequestError) throw error;

        throw new RequestError(400, 'invalid_request', 'validate_body', 'Invalid estimate option drafting request.', 'Request body could not be parsed as JSON.');
    }
}

function readEstimateOptionDraftRequest(body: Record<string, unknown>): EstimateOptionDraftRequest {
    const sessionId = readString(body.session_id);

    if (!UUID_PATTERN.test(sessionId)) {
        throw new RequestError(400, 'missing_session_id', 'validate_body', 'Estimate session is required for AI estimate option drafting.', 'session_id must be a valid UUID.');
    }

    const deterministicPriceResults = readDeterministicPriceResults(body.deterministic_price_results);

    if (deterministicPriceResults.length < 2) {
        throw new RequestError(400, 'not_enough_options', 'validate_body', 'At least two deterministic priced options are required before AI drafting.', 'deterministic_price_results must contain at least two valid choices.');
    }

    return {
        session_id: sessionId,
        homeowner_preferred_first_name: readString(body.homeowner_preferred_first_name),
        answered_questions: readRecord(body.answered_questions) || {},
        technician_notes: readString(body.technician_notes),
        approved_product_candidates: readReferences(body.approved_product_candidates),
        approved_scope_combinations: readReferences(body.approved_scope_combinations),
        deterministic_price_results: deterministicPriceResults,
        warranties: readReferences(body.warranties),
        inclusions: readReferences(body.inclusions),
        exclusions: readReferences(body.exclusions),
        warnings: readTextArray(body.warnings),
        company_tone_rules: readTextArray(body.company_tone_rules),
    };
}

function readDeterministicPriceResults(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry): DeterministicPriceResult | null => {
            const record = readRecord(entry);
            const totalAmount = readNumber(record?.total_amount);
            const choiceId = readString(record?.choice_id);
            const id = readString(record?.id);
            const kind = readString(record?.kind) === 'package' ? 'package' : 'individual';

            if (!record || !id || !choiceId || totalAmount === null) return null;

            return {
                id,
                choice_id: choiceId,
                kind,
                total_amount: totalAmount,
                scope_ids: readTextArray(record.scope_ids),
                product_ids: readTextArray(record.product_ids),
                warranty_ids: readTextArray(record.warranty_ids),
                inclusion_ids: readTextArray(record.inclusion_ids),
                exclusion_ids: readTextArray(record.exclusion_ids),
            };
        })
        .filter((entry): entry is DeterministicPriceResult => Boolean(entry))
        .slice(0, 6);
}

function readReferences(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry): ApprovedReference | null => {
            const record = readRecord(entry);
            const id = readString(record?.id);
            const label = readString(record?.label);

            return id && label ? { id, label } : null;
        })
        .filter((entry): entry is ApprovedReference => Boolean(entry))
        .slice(0, 100);
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

    return id ? { id } : null;
}

async function loadEstimateSessionForDraft(
    env: FunctionEnv,
    authToken: string,
    sessionId: string,
    userId: string
): Promise<EstimateOptionSession> {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/get_estimate_option_session_for_draft`, {
        method: 'POST',
        headers: restHeaders(env, authToken),
        body: JSON.stringify({ p_session_id: sessionId }),
    });
    const text = await response.text();

    if (!response.ok) {
        throw new RequestError(
            response.status >= 400 && response.status < 600 ? response.status : 403,
            'session_authorization_failed',
            'permission',
            'Estimate session authorization failed.',
            text.slice(0, 240)
        );
    }

    const parsed = parseJson<unknown>(text);
    const row = Array.isArray(parsed) ? readRecord(parsed[0]) : readRecord(parsed);
    const allowed = readBoolean(row?.allowed);
    const denialCode = readString(row?.denial_code) || 'session_not_authorized';
    const denialMessage = readString(row?.denial_message) || 'This account cannot use the requested estimate session.';

    if (allowed !== true) {
        throw new RequestError(
            sessionDenialStatus(denialCode),
            denialCode,
            denialCode === 'not_authenticated' ? 'auth' : 'permission',
            denialMessage,
            `User ${userId} cannot use estimate session ${sessionId}: ${denialCode}.`
        );
    }

    const session = readEstimateSession(row);

    if (!session) {
        throw new RequestError(
            403,
            'invalid_session_authorization',
            'permission',
            'Estimate session authorization returned an invalid session.',
            `Session ${sessionId} was authorized but did not include required fields.`
        );
    }

    return session;
}

function readEstimateSession(row: Record<string, unknown> | null): EstimateOptionSession | null {
    const id = readString(row?.id);
    const companyId = readString(row?.company_id);

    if (!id || !companyId) return null;

    return {
        id,
        companyId,
        propertyId: readNullableString(row?.property_id),
        serviceRequestId: readNullableString(row?.service_request_id),
        jobId: readNullableString(row?.job_id),
        scheduleSlotId: readNullableString(row?.schedule_slot_id),
        homeItemId: readNullableString(row?.home_item_id),
        category: readString(row?.category) || 'estimate',
        status: readString(row?.status) || 'draft',
        source: readString(row?.source) || 'techos',
        createdByCompanyUserId: readNullableString(row?.created_by_company_user_id),
        technicianApprovedAt: readNullableString(row?.technician_approved_at),
        presentedAt: readNullableString(row?.presented_at),
    };
}

function sessionDenialStatus(code: string) {
    if (code === 'not_authenticated') return 401;
    if (code === 'missing_session_id') return 400;
    if (code === 'session_not_found') return 404;
    if (code === 'session_closed' || code === 'company_inactive') return 409;

    return 403;
}

function restHeaders(env: FunctionEnv, authToken: string) {
    return {
        apikey: env.publishableKey,
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Info': 'barbarosa-estimate-option-draft-edge',
    };
}

async function draftOptionsWithRetry(
    env: FunctionEnv,
    payload: EstimateOptionDraftRequest,
    estimateSession: EstimateOptionSession
) {
    const first = await draftOptionsWithOpenAi(env, payload, estimateSession, []);

    if (first.valid) return first;

    return draftOptionsWithOpenAi(env, payload, estimateSession, first.errors);
}

async function draftOptionsWithOpenAi(
    env: FunctionEnv,
    payload: EstimateOptionDraftRequest,
    estimateSession: EstimateOptionSession,
    previousValidationErrors: string[]
) {
    const response = await postOpenAiResponses(env, {
        model: env.model,
        input: [
            {
                role: 'system',
                content: [
                    {
                        type: 'input_text',
                        text: [
                            'You draft homeowner-facing estimate option copy for a plumbing company.',
                            'Return structured JSON only.',
                            'Hard rule: never invent or calculate prices, discounts, products, model numbers, warranties, rebates, code requirements, financing payments, availability, labor quantities, or required materials.',
                            'Use only provided approved product IDs, scope IDs, warranty IDs, inclusion IDs, exclusion IDs, and deterministic price result IDs.',
                            'Do not include numeric prices, amounts, costs, quantities, discounts, financing, or labor/material numbers in your JSON. The app already has deterministic prices.',
                            'Create 2 to 4 individual options and no more than 2 packages. Total homeowner-facing choices must not exceed 6.',
                            'Keep names brief, professional, and not fear-based. Use the preferred first name tastefully when provided.',
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
                            task: 'Draft estimate option copy for technician review.',
                            session: buildSafeSessionPromptContext(estimateSession),
                            payload,
                            previous_validation_errors: previousValidationErrors,
                        }),
                    },
                ],
            },
        ],
        text: {
            format: {
                type: 'json_schema',
                name: 'estimate_option_draft_result',
                strict: true,
                schema: estimateOptionDraftSchema(),
            },
        },
        max_output_tokens: 4500,
    });

    const responseText = await response.text();

    if (!response.ok) {
        const body = parseRecord(responseText);
        const openAiMessage = readString(readRecord(body?.error)?.message) || responseText.slice(0, 240);
        throw new RequestError(
            response.status >= 400 && response.status < 600 ? response.status : 502,
            'openai_request_failed',
            'openai',
            `AI estimate option drafting failed: ${openAiMessage || 'OpenAI request failed.'}`,
            `OpenAI HTTP status ${response.status}.`
        );
    }

    const body = parseRecord(responseText);
    const outputText = extractOutputText(body);

    if (!outputText) {
        throw new RequestError(502, 'openai_empty_response', 'openai', 'AI estimate option drafting returned no structured output.', 'No output_text or content text was found.');
    }

    return validateAiDraftResponse(parseJson<unknown>(outputText), payload);
}

function buildSafeSessionPromptContext(session: EstimateOptionSession) {
    return {
        session_id: session.id,
        company_id: session.companyId,
        property_id: session.propertyId,
        service_request_id: session.serviceRequestId,
        job_id: session.jobId,
        schedule_slot_id: session.scheduleSlotId,
        home_item_id: session.homeItemId,
        category: session.category,
        source: session.source,
        status: session.status,
        technician_review_required: session.technicianApprovedAt === null,
        homeowner_visible: false,
    };
}

function postOpenAiResponses(env: FunctionEnv, body: Record<string, unknown>) {
    try {
        return fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.openAiApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    } catch {
        throw new RequestError(502, 'openai_network_error', 'openai', 'AI estimate option drafting could not reach OpenAI.', 'Fetch to OpenAI failed before an HTTP response was returned.');
    }
}

function estimateOptionDraftSchema() {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['choices'],
        properties: {
            choices: {
                type: 'array',
                minItems: 2,
                maxItems: 6,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'source_choice_id',
                        'kind',
                        'title',
                        'short_summary',
                        'homeowner_explanation',
                        'key_benefits',
                        'why_it_differs',
                        'recommended_reason',
                        'approved_product_ids',
                        'approved_scope_ids',
                        'approved_warranty_ids',
                        'inclusion_ids',
                        'exclusion_ids',
                        'display_order',
                    ],
                    properties: {
                        source_choice_id: { type: 'string' },
                        kind: { type: 'string', enum: ['individual', 'package'] },
                        title: { type: 'string' },
                        short_summary: { type: 'string' },
                        homeowner_explanation: { type: 'string' },
                        key_benefits: { type: 'array', items: { type: 'string' } },
                        why_it_differs: { type: 'string' },
                        recommended_reason: { type: ['string', 'null'] },
                        approved_product_ids: { type: 'array', items: { type: 'string' } },
                        approved_scope_ids: { type: 'array', items: { type: 'string' } },
                        approved_warranty_ids: { type: 'array', items: { type: 'string' } },
                        inclusion_ids: { type: 'array', items: { type: 'string' } },
                        exclusion_ids: { type: 'array', items: { type: 'string' } },
                        display_order: { type: 'number' },
                    },
                },
            },
        },
    };
}

function validateAiDraftResponse(value: unknown, payload: EstimateOptionDraftRequest): AiDraftValidation {
    const errors: string[] = [];
    const record = readRecord(value);
    const rawChoices = Array.isArray(record?.choices) ? record.choices : [];
    const choiceIds = payload.deterministic_price_results.map((result) => result.choice_id);
    const productIds = new Set([
        ...payload.approved_product_candidates.map((reference) => reference.id),
        ...payload.deterministic_price_results.flatMap((result) => result.product_ids),
    ]);
    const scopeIds = new Set([
        ...payload.approved_scope_combinations.map((reference) => reference.id),
        ...payload.deterministic_price_results.flatMap((result) => result.scope_ids),
    ]);
    const warrantyIds = new Set([
        ...payload.warranties.map((reference) => reference.id),
        ...payload.deterministic_price_results.flatMap((result) => result.warranty_ids),
    ]);
    const inclusionIds = new Set([
        ...payload.inclusions.map((reference) => reference.id),
        ...payload.deterministic_price_results.flatMap((result) => result.inclusion_ids),
    ]);
    const exclusionIds = new Set([
        ...payload.exclusions.map((reference) => reference.id),
        ...payload.deterministic_price_results.flatMap((result) => result.exclusion_ids),
    ]);

    collectDisallowedNumericFields(value).forEach((path) => {
        errors.push(`AI response attempted to set a numeric price or quantity at ${path}.`);
    });

    const choices = rawChoices
        .map((choice, index): AiDraftChoice | null => {
            const choiceRecord = readRecord(choice);

            if (!choiceRecord) {
                errors.push(`Choice ${index + 1} is not an object.`);
                return null;
            }

            const sourceChoiceId = readString(choiceRecord.source_choice_id);
            const kind = readString(choiceRecord.kind) === 'package' ? 'package' : 'individual';
            const draftChoice: AiDraftChoice = {
                source_choice_id: sourceChoiceId,
                kind,
                title: readString(choiceRecord.title),
                short_summary: readString(choiceRecord.short_summary),
                homeowner_explanation: readString(choiceRecord.homeowner_explanation),
                key_benefits: readTextArray(choiceRecord.key_benefits),
                why_it_differs: readString(choiceRecord.why_it_differs),
                recommended_reason: readNullableString(choiceRecord.recommended_reason),
                approved_product_ids: readTextArray(choiceRecord.approved_product_ids),
                approved_scope_ids: readTextArray(choiceRecord.approved_scope_ids),
                approved_warranty_ids: readTextArray(choiceRecord.approved_warranty_ids),
                inclusion_ids: readTextArray(choiceRecord.inclusion_ids),
                exclusion_ids: readTextArray(choiceRecord.exclusion_ids),
                display_order: readNumber(choiceRecord.display_order) || index + 1,
            };

            if (!choiceIds.includes(sourceChoiceId)) errors.push(`Unknown choice id: ${sourceChoiceId || 'blank'}.`);
            if (!draftChoice.title) errors.push(`Choice ${sourceChoiceId || index + 1} is missing title.`);
            if (!draftChoice.short_summary) errors.push(`Choice ${sourceChoiceId || index + 1} is missing short summary.`);
            if (!draftChoice.homeowner_explanation) errors.push(`Choice ${sourceChoiceId || index + 1} is missing homeowner explanation.`);

            assertAllowedIds(draftChoice.approved_product_ids, productIds, `Choice ${sourceChoiceId} has unapproved product`, errors);
            assertAllowedIds(draftChoice.approved_scope_ids, scopeIds, `Choice ${sourceChoiceId} has unapproved scope`, errors);
            assertAllowedIds(draftChoice.approved_warranty_ids, warrantyIds, `Choice ${sourceChoiceId} has unapproved warranty`, errors);
            assertAllowedIds(draftChoice.inclusion_ids, inclusionIds, `Choice ${sourceChoiceId} has unapproved inclusion`, errors);
            assertAllowedIds(draftChoice.exclusion_ids, exclusionIds, `Choice ${sourceChoiceId} has unapproved exclusion`, errors);

            return draftChoice;
        })
        .filter((choice): choice is AiDraftChoice => Boolean(choice));
    const individualCount = choices.filter((choice) => choice.kind === 'individual').length;
    const packageCount = choices.filter((choice) => choice.kind === 'package').length;

    if (individualCount < 2 || individualCount > 4) errors.push('AI must return 2 to 4 individual options.');
    if (packageCount > 2) errors.push('AI must return no more than 2 packages.');
    if (choices.length > 6) errors.push('AI must return no more than 6 choices.');

    return {
        valid: errors.length === 0,
        choices,
        errors,
    };
}

function assertAllowedIds(values: string[], allowed: Set<string>, prefix: string, errors: string[]) {
    values.forEach((value) => {
        if (!allowed.has(value)) errors.push(`${prefix}: ${value}.`);
    });
}

function collectDisallowedNumericFields(value: unknown, path = 'response'): string[] {
    if (typeof value === 'number') {
        return isAllowedAiNumericPath(path) ? [] : [path];
    }

    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => collectDisallowedNumericFields(entry, `${path}[${index}]`));
    }

    const record = readRecord(value);

    if (!record) return [];

    return Object.entries(record).flatMap(([key, nestedValue]) =>
        collectDisallowedNumericFields(nestedValue, `${path}.${key}`)
    );
}

function isAllowedAiNumericPath(path: string) {
    return path.toLowerCase().endsWith('.display_order');
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

function normalizeUrl(value: string) {
    return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseCsv(value?: string) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseRecord(value: string) {
    const parsed = parseJson<unknown>(value);

    return readRecord(parsed);
}

function parseJson<T>(value: string): T | null {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function readRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readBoolean(value: unknown) {
    return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;

    const parsed = Number.parseFloat(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
}

function readTextArray(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => readString(entry))
        .filter((entry) => entry.length > 0);
}

class RequestError extends Error {
    status: number;
    code: string;
    stage: ErrorStage;
    safeMessage: string;
    detail: string;

    constructor(status: number, code: string, stage: ErrorStage, safeMessage: string, detail: string) {
        super(detail || safeMessage);
        this.status = status;
        this.code = code;
        this.stage = stage;
        this.safeMessage = safeMessage;
        this.detail = detail;
    }
}
