declare const Deno: {
    env: { get(name: string): string | undefined };
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_EXTENSION_BY_CONTENT_TYPE = new Map([
    ['audio/m4a', 'm4a'],
    ['audio/mp3', 'mp3'],
    ['audio/mp4', 'mp4'],
    ['audio/mpeg', 'mp3'],
    ['audio/mpga', 'mpga'],
    ['audio/wav', 'wav'],
    ['audio/webm', 'webm'],
    ['audio/x-m4a', 'm4a'],
    ['audio/x-wav', 'wav'],
    ['video/mp4', 'mp4'],
]);

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

        const requestId = crypto.randomUUID();
        const startedAt = Date.now();
        let contentType = '';

        try {
            const env = loadEnv();
            const token = bearerToken(req);

            logDictation('request_received', requestId, { content_type: normalizeContentType(req.headers.get('Content-Type')) });

            if (!token) return loggedError(req, requestId, startedAt, 401, 'not_authenticated', 'Please sign in again before using dictation.');
            if (!env.openAiApiKey) {
                return loggedError(req, requestId, startedAt, 501, 'openai_not_configured', 'Dictation is not configured yet. You can still type in this field.');
            }
            if (!await isAuthenticated(env, token)) {
                return loggedError(req, requestId, startedAt, 401, 'not_authenticated', 'Please sign in again before using dictation.');
            }

            contentType = normalizeContentType(req.headers.get('Content-Type'));
            if (!isSupportedAudioContentType(contentType)) {
                return loggedError(req, requestId, startedAt, 415, 'unsupported_audio', 'That microphone recording format is not supported. Please try again.', { content_type: contentType });
            }

            const audio = await req.arrayBuffer();
            if (!audio.byteLength) return loggedError(req, requestId, startedAt, 400, 'empty_audio', 'No speech recording was received.', { content_type: contentType, audio_bytes: 0 });
            if (audio.byteLength > MAX_AUDIO_BYTES) {
                return loggedError(req, requestId, startedAt, 413, 'audio_too_large', 'That recording is too large. Please try a shorter note.', { content_type: contentType, audio_bytes: audio.byteLength });
            }

            const filename = safeFilename(req.headers.get('X-HomeOS-Audio-Filename'), contentType);
            const form = new FormData();
            form.append('file', new Blob([audio], { type: contentType }), filename);
            form.append('model', env.model);
            form.append('response_format', 'json');
            form.append('language', 'en');

            const openAiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${env.openAiApiKey}` },
                body: form,
            });
            const responseText = await openAiResponse.text();
            const responseBody = parseRecord(responseText);

            if (!openAiResponse.ok) {
                const detail = readString(readRecord(responseBody?.error)?.message);
                return loggedError(
                    req,
                    requestId,
                    startedAt,
                    openAiResponse.status === 429 ? 503 : 502,
                    'transcription_failed',
                    detail || 'The transcription service is unavailable. Your text was not changed.',
                    {
                        audio_bytes: audio.byteLength,
                        content_type: contentType,
                        upstream_status: openAiResponse.status,
                    },
                );
            }

            const transcript = readString(responseBody?.text);
            if (!transcript) return loggedError(req, requestId, startedAt, 422, 'no_speech', 'No speech was detected. Please try again and speak clearly.', { audio_bytes: audio.byteLength, content_type: contentType, upstream_status: openAiResponse.status });

            logDictation('request_completed', requestId, {
                audio_bytes: audio.byteLength,
                content_type: contentType,
                duration_ms: Date.now() - startedAt,
                status: 200,
                upstream_status: openAiResponse.status,
            });
            return json(req, { ok: true, transcript }, 200, requestId);
        } catch {
            return loggedError(req, requestId, startedAt, 500, 'unexpected_error', 'Dictation is temporarily unavailable. Your text was not changed.', { content_type: contentType });
        }
    },
};

function loadEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requiredEnv('SUPABASE_URL')),
        publishableKey: publishableKey(),
        openAiApiKey: Deno.env.get('OPENAI_API_KEY') || '',
        model: Deno.env.get('DICTATION_TRANSCRIPTION_MODEL') || 'gpt-4o-mini-transcribe',
    };
}

async function isAuthenticated(env: FunctionEnv, token: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}` },
    });

    return response.ok;
}

function requiredEnv(name: string) {
    const value = Deno.env.get(name);
    if (!value) throw new Error(`Dictation is not configured: ${name} is missing.`);
    return value;
}

function publishableKey() {
    const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
    if (direct) return direct;

    const configured = parseJson<unknown>(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '');
    if (Array.isArray(configured)) {
        const first = configured
            .map((entry) => readString(readRecord(entry)?.value || entry))
            .find(Boolean);
        if (first) return first;
    }

    throw new Error('Dictation is not configured: Supabase publishable key is missing.');
}

export function safeFilename(value: string | null, contentType: string) {
    const extension = AUDIO_EXTENSION_BY_CONTENT_TYPE.get(normalizeContentType(contentType)) || 'bin';
    const filename = String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
    const basename = filename.replace(/\.[^.]*$/, '').replace(/^\.+|\.+$/g, '') || 'homeos-dictation';

    return `${basename}.${extension}`;
}

export function normalizeContentType(value: string | null) {
    return String(value || '').split(';')[0].trim().toLowerCase();
}

export function isSupportedAudioContentType(value: string | null) {
    return AUDIO_EXTENSION_BY_CONTENT_TYPE.has(normalizeContentType(value));
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

function json(req: Request, body: Record<string, unknown>, status = 200, requestId = '') {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(req),
            'Content-Type': 'application/json; charset=utf-8',
            ...(requestId ? { 'X-HomeOS-Request-Id': requestId } : {}),
        },
    });
}

function errorJson(req: Request, status: number, code: string, message: string) {
    return json(req, { ok: false, code, message }, status);
}

function loggedError(
    req: Request,
    requestId: string,
    startedAt: number,
    status: number,
    code: string,
    message: string,
    details: Record<string, string | number> = {},
) {
    logDictation('request_completed', requestId, {
        ...details,
        code,
        duration_ms: Date.now() - startedAt,
        status,
    });
    return json(req, { ok: false, code, message }, status, requestId);
}

function logDictation(event: string, requestId: string, details: Record<string, string | number>) {
    console.log(JSON.stringify({
        event: `dictation_${event}`,
        request_id: requestId,
        ...details,
    }));
}

function corsHeaders(req: Request) {
    return {
        'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-homeos-audio-filename',
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
