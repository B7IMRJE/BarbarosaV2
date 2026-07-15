import { supabase } from './supabase';
import {
    estimateRequirementId,
    isPhotoRequirementAnswer,
    type EstimateAnswerSet,
    type EstimateAnswerValue,
    type EstimateRequirementPhotoAnswer,
} from './estimateOptions';

export const ESTIMATE_REQUIREMENT_BUCKET = 'estimate-requirement-files';

type EstimateAnswerRow = {
    question_id?: string | null;
    answer?: unknown;
};

export type EstimateRequirementPhotoUploadInput = {
    companyId: string;
    sessionId: string;
    requirementLabel: string;
    file: File;
};

export function mapEstimateAnswerRows(data: unknown): EstimateAnswerSet {
    if (!Array.isArray(data)) return {};

    return data.reduce<EstimateAnswerSet>((answers, rowValue) => {
        const row = readAnswerRow(rowValue);
        const key = readText(row?.question_id);

        if (!key) return answers;

        answers[key] = normalizeAnswerValue(row?.answer);

        return answers;
    }, {});
}

export async function loadEstimateSessionAnswers(sessionId: string) {
    const { data, error } = await supabase.rpc('get_estimate_option_answers_for_draft', {
        p_session_id: sessionId,
    });

    if (error) {
        throw new Error(error.message || 'Estimate requirements could not be loaded.');
    }

    return mapEstimateAnswerRows(data);
}

export async function saveEstimateSessionAnswer(
    sessionId: string,
    questionId: string,
    answer: EstimateAnswerValue
) {
    const { error } = await supabase.rpc('upsert_estimate_option_answer_for_draft', {
        p_session_id: sessionId,
        p_question_id: questionId,
        p_answer: answer,
    });

    if (error) {
        throw new Error(error.message || 'Estimate requirement could not be saved.');
    }
}

export async function deleteEstimateSessionAnswer(sessionId: string, questionId: string) {
    const { error } = await supabase.rpc('delete_estimate_option_answer_for_draft', {
        p_session_id: sessionId,
        p_question_id: questionId,
    });

    if (error) {
        throw new Error(error.message || 'Estimate requirement could not be removed.');
    }
}

export async function uploadEstimateRequirementPhoto(input: EstimateRequirementPhotoUploadInput) {
    const requirementId = estimateRequirementId(input.requirementLabel);
    const attachmentId = createAttachmentId();
    const fileName = sanitizeStorageFileName(input.file.name || `${requirementId}.jpg`);
    const storagePath = [
        input.companyId,
        input.sessionId,
        requirementId,
        attachmentId,
        fileName,
    ].join('/');

    const { error } = await supabase.storage
        .from(ESTIMATE_REQUIREMENT_BUCKET)
        .upload(storagePath, input.file, {
            cacheControl: '3600',
            contentType: input.file.type || 'image/jpeg',
            upsert: false,
        });

    if (error) {
        throw new Error(error.message || 'Photo upload failed.');
    }

    return {
        kind: 'requirement_photo',
        requirementId,
        attachmentId,
        bucket: ESTIMATE_REQUIREMENT_BUCKET,
        storagePath,
        fileName,
        contentType: input.file.type || null,
        sizeBytes: Number.isFinite(input.file.size) ? input.file.size : null,
        uploadedAt: new Date().toISOString(),
    } satisfies EstimateRequirementPhotoAnswer;
}

export async function removeEstimateRequirementPhotoFile(answer: EstimateAnswerValue) {
    if (!isPhotoRequirementAnswer(answer)) return;

    const { error } = await supabase.storage
        .from(answer.bucket)
        .remove([answer.storagePath]);

    if (error) {
        throw new Error(error.message || 'Photo could not be removed.');
    }
}

export async function createEstimateRequirementPhotoPreview(answer: EstimateAnswerValue) {
    if (!isPhotoRequirementAnswer(answer)) return null;

    const { data, error } = await supabase.storage
        .from(answer.bucket)
        .createSignedUrl(answer.storagePath, 60 * 30);

    if (error) return null;

    return data?.signedUrl || null;
}

function normalizeAnswerValue(value: unknown): EstimateAnswerValue {
    if (value === null) return null;
    if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');

    const valueType = typeof value;

    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        return value as EstimateAnswerValue;
    }

    if (value && valueType === 'object') {
        return value as EstimateAnswerValue;
    }

    return null;
}

function readAnswerRow(value: unknown): EstimateAnswerRow | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as EstimateAnswerRow
        : null;
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function createAttachmentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function sanitizeStorageFileName(value: string) {
    const name = value
        .trim()
        .replace(/[^\w.\-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return name || 'requirement-photo.jpg';
}
