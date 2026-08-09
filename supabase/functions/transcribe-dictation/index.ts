declare const Deno: {
    env: { get(name: string): string | undefined };
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'video/mp4',
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

        try {
            const env = loadEnv();
            const token = bearerToken(req);

            if (!token) return errorJson(req, 401, 'not_authenticated', 'Please sign in again before using dictation.');
            if (!env.openAiApiKey) {
                return errorJson(req, 501, 'openai_not_configured', 'Dictation is not configured yet. You can still type in this field.');
            }
            if (!await isAuthenticated(env, token)) {
                return errorJson(req, 401, 'not_authenticated', 'Please sign in again before using dictation.');
            }

            const contentType = normalizeContentType(req.headers.get('Content-Type'));
            if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
                return errorJson(req, 415, 'unsupported_audio', 'That microphone recording format is not supported. Please try again.');
            }

            const audio = await req.arrayBuffer();
            if (!audio.byteLength) return errorJson(req, 400, 'empty_audio', 'No speech recording was received.');
            if (audio.byteLength > MAX_AUDIO_BYTES) {
                return errorJson(req, 413, 'audio_too_large', 'That recording is too large. Please try a shorter note.');
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
                return errorJson(
                    req,
                    openAiResponse.status === 429 ? 503 : 502,
                    'transcription_failed',
                    detail || 'The transcription service is unavailable. Your text was not changed.',
                );
            }

            const transcript = readString(responseBody?.text);
            if (!transcript) return errorJson(req, 422, 'no_speech', 'No speech was detected. Please try again and speak clearly.');

            return json(req, { ok: true, transcript });
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            return errorJson(req, 500, 'unexpected_error', message || 'Dictation is temporarily unavailable. Your text was not changed.');
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

function safeFilename(value: string | null, contentType: string) {
    const filename = String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
    if (filename && /\.(flac|m4a|mp3|mp4|ogg|wav|webm)$/i.test(filename)) return filename;

    const extension = contentType.includes('webm') ? 'webm'
        : contentType.includes('wav') ? 'wav'
            : contentType.includes('ogg') ? 'ogg'
                : contentType.includes('mpeg') ? 'mp3'
                    : contentType.includes('flac') ? 'flac'
                        : 'm4a';

    return `homeos-dictation.${extension}`;
}

function normalizeContentType(value: string | null) {
    return String(value || '').split(';')[0].trim().toLowerCase();
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
