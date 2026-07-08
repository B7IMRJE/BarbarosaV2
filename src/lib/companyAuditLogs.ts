import { supabase } from './supabase';

export type AuditJsonValue =
    | string
    | number
    | boolean
    | null
    | AuditJsonValue[]
    | { [key: string]: AuditJsonValue };

export type AuditJsonRecord = { [key: string]: AuditJsonValue };

export type CompanyAuditLog = {
    id: string;
    company_id: string;
    actor_user_id: string;
    actor_email: string | null;
    actor_company_user_id: string | null;
    actor_role: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    target_label: string | null;
    before_data: AuditJsonRecord | null;
    after_data: AuditJsonRecord | null;
    metadata: AuditJsonRecord | null;
    created_at: string;
};

export type CompanyAuditEventInput = {
    companyId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    targetLabel?: string | null;
    beforeData?: AuditJsonRecord | null;
    afterData?: AuditJsonRecord | null;
    metadata?: AuditJsonRecord | null;
};

export async function logCompanyAuditEvent(input: CompanyAuditEventInput): Promise<CompanyAuditLog | null> {
    const companyId = input.companyId.trim();
    const action = input.action.trim();
    const targetType = input.targetType.trim();

    if (!companyId || !action || !targetType) {
        throw new Error('Company id, action, and target type are required for audit logging.');
    }

    const { data, error } = await supabase.rpc('log_company_audit_event', {
        p_company_id: companyId,
        p_action: action,
        p_target_type: targetType,
        p_target_id: input.targetId || null,
        p_target_label: input.targetLabel || null,
        p_before_data: input.beforeData || null,
        p_after_data: input.afterData || null,
        p_metadata: input.metadata || null,
    });

    if (error) {
        throw new Error(error.message);
    }

    return parseCompanyAuditLog(data);
}

export async function getCompanyAuditLogs(companyId: string, limit = 80): Promise<CompanyAuditLog[]> {
    const normalizedCompanyId = companyId.trim();

    if (!normalizedCompanyId) {
        throw new Error('Company id is required to load audit logs.');
    }

    const { data, error } = await supabase
        .from('company_audit_logs')
        .select('id, company_id, actor_user_id, actor_email, actor_company_user_id, actor_role, action, target_type, target_id, target_label, before_data, after_data, metadata, created_at')
        .eq('company_id', normalizedCompanyId)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 200)));

    if (error) {
        throw new Error(error.message);
    }

    return (Array.isArray(data) ? data : [])
        .map(parseCompanyAuditLog)
        .filter((log): log is CompanyAuditLog => Boolean(log));
}

export function safeAuditRecord(record: Record<string, unknown>): AuditJsonRecord {
    const sanitized: AuditJsonRecord = {};

    Object.entries(record).forEach(([key, value]) => {
        const jsonValue = toAuditJsonValue(value);

        if (jsonValue !== undefined) {
            sanitized[key] = jsonValue;
        }
    });

    return sanitized;
}

function parseCompanyAuditLog(row: unknown): CompanyAuditLog | null {
    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const id = readString(record.id);
    const companyId = readString(record.company_id);
    const actorUserId = readString(record.actor_user_id);
    const action = readString(record.action);
    const targetType = readString(record.target_type);
    const createdAt = readString(record.created_at);

    if (!id || !companyId || !actorUserId || !action || !targetType || !createdAt) return null;

    return {
        id,
        company_id: companyId,
        actor_user_id: actorUserId,
        actor_email: readOptionalString(record.actor_email),
        actor_company_user_id: readOptionalString(record.actor_company_user_id),
        actor_role: readOptionalString(record.actor_role),
        action,
        target_type: targetType,
        target_id: readOptionalString(record.target_id),
        target_label: readOptionalString(record.target_label),
        before_data: readOptionalAuditRecord(record.before_data),
        after_data: readOptionalAuditRecord(record.after_data),
        metadata: readOptionalAuditRecord(record.metadata),
        created_at: createdAt,
    };
}

function toAuditJsonValue(value: unknown): AuditJsonValue | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value
            .map(toAuditJsonValue)
            .filter((item): item is AuditJsonValue => item !== undefined);
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const output: AuditJsonRecord = {};

        Object.entries(record).forEach(([key, nestedValue]) => {
            const jsonValue = toAuditJsonValue(nestedValue);

            if (jsonValue !== undefined) {
                output[key] = jsonValue;
            }
        });

        return output;
    }

    return String(value);
}

function readOptionalAuditRecord(value: unknown): AuditJsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    return safeAuditRecord(value as Record<string, unknown>);
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readOptionalString(value: unknown) {
    const text = readString(value);

    return text || null;
}
