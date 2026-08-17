import { supabase } from './supabase';

export {
    buildEstimatePresentationLink,
    formatPresentationJoinCode,
} from './estimatePresentationContract';

export type EstimatePresentationOption = {
    id: string;
    title: string;
    shortSummary: string;
    homeownerExplanation: string;
    keyBenefits: string[];
    customerSelections: string[];
    totalAmount: number;
    recommended: boolean;
    displayOrder: number;
};

export type EstimatePresentationMedia = {
    id: string;
    title: string;
    productName: string;
};

export type EstimatePresentationMediaCandidate = EstimatePresentationMedia;

export type EstimatePresentationPayload = {
    version: number;
    companyName: string;
    serviceType: string;
    estimate: {
        quoteNumber: string;
        category: string;
        optionCount: number;
    } | null;
    includeEstimateSummary: boolean;
    signatureRequested: boolean;
    options: EstimatePresentationOption[];
    media: EstimatePresentationMedia[];
};

export type CreatedEstimatePresentationSession = {
    id: string;
    joinCode: string;
    shareToken: string;
    expiresAt: string;
    payloadVersion: number;
    status: string;
};

export type EstimatePresentationStaffStatus = {
    id: string;
    status: string;
    expiresAt: string;
    joinedAt: string | null;
    signedAt: string | null;
    signerName: string | null;
    payloadVersion: number;
    signatureRequested: boolean;
    publicPayload: EstimatePresentationPayload | null;
};

export type JoinedEstimatePresentation = {
    sessionId: string;
    viewerToken: string;
    status: string;
    expiresAt: string;
    payloadVersion: number;
    signedAt: string | null;
    payload: EstimatePresentationPayload;
};

export async function createEstimatePresentationSession(input: {
    estimateSessionId: string;
    selectedChoiceIds: string[];
    mediaIds: string[];
    includeEstimateSummary: boolean;
    signatureRequested: boolean;
    expiresMinutes?: number;
}) {
    const { data, error } = await supabase.rpc('create_estimate_presentation_session', {
        p_estimate_session_id: input.estimateSessionId,
        p_selected_choice_ids: input.selectedChoiceIds,
        p_media_ids: input.mediaIds,
        p_include_estimate_summary: input.includeEstimateSummary,
        p_signature_requested: input.signatureRequested,
        p_expires_minutes: input.expiresMinutes || 30,
    });

    if (error) throw error;

    return mapCreatedSession(data);
}

export async function loadEstimatePresentationMediaCandidates(
    estimateSessionId: string,
    selectedChoiceIds: string[]
) {
    const { data, error } = await supabase.rpc('get_estimate_presentation_media_candidates', {
        p_estimate_session_id: estimateSessionId,
        p_selected_choice_ids: selectedChoiceIds,
    });

    if (error) throw error;

    return readArray(data).map(mapPresentationMedia).filter((media) => media.id);
}

export async function updateEstimatePresentationSession(input: {
    presentationSessionId: string;
    selectedChoiceIds: string[];
    mediaIds: string[];
    includeEstimateSummary: boolean;
    signatureRequested: boolean;
}) {
    const { data, error } = await supabase.rpc('update_estimate_presentation_session', {
        p_presentation_session_id: input.presentationSessionId,
        p_selected_choice_ids: input.selectedChoiceIds,
        p_media_ids: input.mediaIds,
        p_include_estimate_summary: input.includeEstimateSummary,
        p_signature_requested: input.signatureRequested,
    });

    if (error) throw error;

    return readRecord(data);
}

export async function endEstimatePresentationSession(
    presentationSessionId: string,
    action: 'ended' | 'revoked' = 'ended'
) {
    const { data, error } = await supabase.rpc('end_estimate_presentation_session', {
        p_presentation_session_id: presentationSessionId,
        p_action: action,
    });

    if (error) throw error;

    return readRecord(data);
}

export async function loadEstimatePresentationStaffStatus(estimateSessionId: string) {
    const { data, error } = await supabase.rpc('get_estimate_presentation_session_status', {
        p_estimate_session_id: estimateSessionId,
    });

    if (error) throw error;
    if (!data) return null;

    return mapStaffStatus(data);
}

export async function joinEstimatePresentation(secret: string) {
    const viewerAgent = typeof navigator === 'undefined' ? 'HomeOS app' : navigator.userAgent;
    const { data, error } = await supabase.rpc('join_estimate_presentation_session', {
        p_secret: secret,
        p_viewer_agent: viewerAgent.slice(0, 240),
    });

    if (error) throw error;

    return mapJoinedPresentation(data, true);
}

export async function refreshJoinedEstimatePresentation(viewerToken: string) {
    const { data, error } = await supabase.rpc('get_joined_estimate_presentation', {
        p_viewer_token: viewerToken,
    });

    if (error) throw error;

    return mapJoinedPresentation({ ...readRecord(data), viewer_token: viewerToken }, false);
}

export async function signJoinedEstimatePresentation(input: {
    viewerToken: string;
    signerName: string;
    signature: string;
}) {
    const { data, error } = await supabase.rpc('sign_joined_estimate_presentation', {
        p_viewer_token: input.viewerToken,
        p_signer_name: input.signerName,
        p_signature: input.signature,
    });

    if (error) throw error;

    return readRecord(data);
}

export async function createEstimatePresentationMediaUrl(viewerToken: string, mediaId: string) {
    const { data, error } = await supabase.functions.invoke('presentation-media', {
        body: {
            viewer_token: viewerToken,
            media_id: mediaId,
        },
    });

    if (error) throw error;
    const record = readRecord(data);
    const signedUrl = readString(record.signed_url);

    if (!signedUrl) throw new Error('Approved photo could not be opened.');

    return signedUrl;
}

function mapCreatedSession(value: unknown): CreatedEstimatePresentationSession {
    const record = readRecord(value);

    return {
        id: readString(record.id),
        joinCode: readString(record.join_code),
        shareToken: readString(record.share_token),
        expiresAt: readString(record.expires_at),
        payloadVersion: readNumber(record.payload_version),
        status: readString(record.status) || 'active',
    };
}

function mapStaffStatus(value: unknown): EstimatePresentationStaffStatus {
    const record = readRecord(value);

    return {
        id: readString(record.id),
        status: readString(record.status),
        expiresAt: readString(record.expires_at),
        joinedAt: readNullableString(record.joined_at),
        signedAt: readNullableString(record.signed_at),
        signerName: readNullableString(record.signer_name),
        payloadVersion: readNumber(record.payload_version),
        signatureRequested: record.signature_requested === true,
        publicPayload: record.public_payload ? mapPayload(record.public_payload) : null,
    };
}

function mapJoinedPresentation(value: unknown, includesNewViewerToken: boolean): JoinedEstimatePresentation {
    const record = readRecord(value);
    const viewerToken = readString(record.viewer_token);

    if (includesNewViewerToken && !viewerToken) throw new Error('Presentation viewer access was not returned.');

    return {
        sessionId: readString(record.session_id),
        viewerToken,
        status: readString(record.status),
        expiresAt: readString(record.expires_at),
        payloadVersion: readNumber(record.payload_version),
        signedAt: readNullableString(record.signed_at),
        payload: mapPayload(record.payload),
    };
}

function mapPayload(value: unknown): EstimatePresentationPayload {
    const record = readRecord(value);
    const hasEstimateSummary = !!record.estimate && typeof record.estimate === 'object' && !Array.isArray(record.estimate);
    const estimate = readRecord(record.estimate);

    return {
        version: readNumber(record.version) || 1,
        companyName: readString(record.company_name) || 'Your service company',
        serviceType: readString(record.service_type) || readString(estimate.category),
        estimate: hasEstimateSummary ? {
            quoteNumber: readString(estimate.quote_number),
            category: readString(estimate.category),
            optionCount: readNumber(estimate.option_count),
        } : null,
        includeEstimateSummary: record.include_estimate_summary === true,
        signatureRequested: record.signature_requested === true,
        options: readArray(record.options).map(mapPresentationOption).filter((option) => option.id),
        media: readArray(record.media).map(mapPresentationMedia).filter((media) => media.id),
    };
}

function mapPresentationOption(value: unknown): EstimatePresentationOption {
    const record = readRecord(value);

    return {
        id: readString(record.id),
        title: readString(record.title),
        shortSummary: readString(record.short_summary),
        homeownerExplanation: readString(record.homeowner_explanation),
        keyBenefits: readStringArray(record.key_benefits),
        customerSelections: readStringArray(record.customer_selections),
        totalAmount: readNumber(record.total_amount),
        recommended: record.recommended === true,
        displayOrder: readNumber(record.display_order),
    };
}

function mapPresentationMedia(value: unknown): EstimatePresentationMedia {
    const record = readRecord(value);

    return {
        id: readString(record.id),
        title: readString(record.title),
        productName: readString(record.product_name),
    };
}

function readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readArray(value: unknown) {
    return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown) {
    return readArray(value).map(readString).filter(Boolean);
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown) {
    const number = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(number) ? number : 0;
}
