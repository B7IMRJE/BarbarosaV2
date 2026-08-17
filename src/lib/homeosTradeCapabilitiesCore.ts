export type HomeOSTradeContext = {
    enabledTradeKeys: string[];
    canStartRepipe: boolean;
    repipeTradeEnabled: boolean;
};

export type HomeOSTradeContextInput = {
    companyId?: string | null;
    propertyId?: string | null;
    serviceRequestId?: string | null;
    scheduleSlotId?: string | null;
    jobId?: string | null;
};

export function homeOSTradeContextRpcParams(input: HomeOSTradeContextInput = {}) {
    return {
        p_company_id: clean(input.companyId),
        p_property_id: clean(input.propertyId),
        p_service_request_id: clean(input.serviceRequestId),
        p_schedule_slot_id: clean(input.scheduleSlotId),
        p_job_id: clean(input.jobId),
    };
}

export function normalizeHomeOSTradeKey(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
}

export function tradeKeyForHomeOSSystem(system?: string | null) {
    const value = normalizeText(system);
    if (['electrical', 'electric'].includes(value)) return 'electrical';
    if (['hvac', 'heating', 'cooling', 'climate'].includes(value)) return 'hvac';
    if (['plumbing', 'water service', 'drain sewer', 'drain and sewer', 'gas', 'water treatment'].includes(value)) return 'plumbing';
    return null;
}

export function isHomeOSTradeEnabled(enabledTradeKeys: readonly string[], tradeKey?: string | null) {
    const normalizedTradeKey = normalizeHomeOSTradeKey(tradeKey);
    if (!normalizedTradeKey) return true;
    return enabledTradeKeys.some((key) => normalizeHomeOSTradeKey(key) === normalizedTradeKey);
}

export function historicalHomeOSTradeNotice(
    system: string | null | undefined,
    enabledTradeKeys: readonly string[],
) {
    const tradeKey = tradeKeyForHomeOSSystem(system);
    if (!tradeKey || isHomeOSTradeEnabled(enabledTradeKeys, tradeKey)) return '';
    return `Historical installed item · ${tradeLabel(tradeKey)} is disabled for new additions`;
}

export function isWholeHomeRepipePlacement(
    system: string | null | undefined,
    area: string | null | undefined,
    parentArea?: string | null,
) {
    return tradeKeyForHomeOSSystem(system) === 'plumbing'
        && normalizeText(area) === 'whole home'
        && !normalizeText(parentArea);
}

export function parseHomeOSTradeContext(value: unknown): HomeOSTradeContext {
    const row = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    const enabledTradeKeys = Array.isArray(row.enabled_trade_keys)
        ? [...new Set(row.enabled_trade_keys.map((key) => normalizeHomeOSTradeKey(String(key || ''))).filter(Boolean))]
        : [];
    return {
        enabledTradeKeys,
        canStartRepipe: row.can_start_repipe === true,
        repipeTradeEnabled: row.repipe_trade_enabled === true,
    };
}

function tradeLabel(tradeKey: string) {
    if (tradeKey === 'hvac') return 'HVAC';
    return tradeKey.charAt(0).toUpperCase() + tradeKey.slice(1);
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function clean(value?: string | null) {
    return String(value || '').trim() || null;
}
