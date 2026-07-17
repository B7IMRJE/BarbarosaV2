export type DispatchWallRealtimeState =
    | 'idle'
    | 'connecting'
    | 'subscribed'
    | 'reconnecting'
    | 'timed_out'
    | 'error'
    | 'closed'
    | 'offline';

export type DispatchWallStatusTone = 'live' | 'loading' | 'warning' | 'offline';

export type DispatchWallConnectionStatus = {
    label: string;
    tone: DispatchWallStatusTone;
    stale: boolean;
};

export const DISPATCH_WALL_FALLBACK_REFRESH_MS = 30_000;
export const DISPATCH_WALL_STALE_AFTER_MS = 90_000;
export const DISPATCH_WALL_EVENT_REFRESH_DEBOUNCE_MS = 1_500;
export const DISPATCH_WALL_RECONNECT_BASE_DELAY_MS = 2_000;
export const DISPATCH_WALL_RECONNECT_MAX_DELAY_MS = 30_000;
export const DISPATCH_WALL_RECONNECT_MAX_ATTEMPTS = 6;
export const DISPATCH_WALL_MANUAL_REFRESH_LABEL = 'Refresh now';

type RefreshDecisionInput = {
    nowMs: number;
    lastRefreshRequestAtMs: number;
    refreshInFlight: boolean;
    online: boolean;
    force?: boolean;
    debounceMs?: number;
};

type ReconnectPlanInput = {
    realtimeStatus: string;
    attempt: number;
    online: boolean;
};

type ConnectionStatusInput = {
    lastSuccessfulLoadAtMs: number | null;
    nowMs: number;
    realtimeState: DispatchWallRealtimeState;
    online: boolean;
    loading: boolean;
    refreshInFlight: boolean;
    reconnectAttempt: number;
    tabHidden?: boolean;
    lastError?: string | null;
};

export function normalizeDispatchWallRealtimeStatus(status: string): DispatchWallRealtimeState {
    const normalized = status.trim().toUpperCase();

    if (normalized === 'SUBSCRIBED') return 'subscribed';
    if (normalized === 'TIMED_OUT') return 'timed_out';
    if (normalized === 'CHANNEL_ERROR') return 'error';
    if (normalized === 'CLOSED') return 'closed';

    return 'connecting';
}

export function shouldRefreshDispatchWallForEvent({
    nowMs,
    lastRefreshRequestAtMs,
    refreshInFlight,
    online,
    force = false,
    debounceMs = DISPATCH_WALL_EVENT_REFRESH_DEBOUNCE_MS,
}: RefreshDecisionInput) {
    if (!online || refreshInFlight) return false;
    if (force) return true;

    return nowMs - lastRefreshRequestAtMs >= debounceMs;
}

export function getDispatchWallReconnectPlan({
    realtimeStatus,
    attempt,
    online,
}: ReconnectPlanInput) {
    const state = normalizeDispatchWallRealtimeStatus(realtimeStatus);
    const shouldReconnect = online &&
        ['timed_out', 'error', 'closed'].includes(state) &&
        attempt <= DISPATCH_WALL_RECONNECT_MAX_ATTEMPTS;

    return {
        shouldReconnect,
        delayMs: shouldReconnect ? getDispatchWallReconnectDelayMs(attempt) : 0,
    };
}

export function shouldRefreshAfterDispatchWallRealtimeSubscribe(status: string) {
    return normalizeDispatchWallRealtimeStatus(status) === 'subscribed';
}

export function getDispatchWallReconnectDelayMs(attempt: number) {
    const normalizedAttempt = Math.max(1, Math.floor(attempt));
    const delay = DISPATCH_WALL_RECONNECT_BASE_DELAY_MS * (2 ** (normalizedAttempt - 1));

    return Math.min(delay, DISPATCH_WALL_RECONNECT_MAX_DELAY_MS);
}

export function getDispatchWallConnectionStatus({
    lastSuccessfulLoadAtMs,
    nowMs,
    realtimeState,
    online,
    loading,
    refreshInFlight,
    reconnectAttempt,
    tabHidden = false,
    lastError,
}: ConnectionStatusInput): DispatchWallConnectionStatus {
    const ageMs = lastSuccessfulLoadAtMs === null ? null : Math.max(0, nowMs - lastSuccessfulLoadAtMs);
    const stale = ageMs === null || ageMs > DISPATCH_WALL_STALE_AFTER_MS;
    const ageLabel = ageMs === null ? '' : formatDispatchWallAge(ageMs);

    if (!online || realtimeState === 'offline') {
        return {
            label: ageLabel ? `Offline / data may be stale · Last updated ${ageLabel}` : 'Offline / data may be stale',
            tone: 'offline',
            stale: true,
        };
    }

    if (loading && lastSuccessfulLoadAtMs === null) {
        return {
            label: 'Connecting to live Dispatch data...',
            tone: 'loading',
            stale: true,
        };
    }

    if (stale) {
        if (tabHidden) {
            return {
                label: ageLabel ? `Browser tab hidden; data may be stale — last updated ${ageLabel}` : 'Browser tab hidden; data may be stale',
                tone: 'warning',
                stale: true,
            };
        }

        return {
            label: ageLabel ? `Data may be stale — last updated ${ageLabel}` : 'Data may be stale — reconnecting',
            tone: 'warning',
            stale: true,
        };
    }

    if (['connecting', 'reconnecting', 'timed_out', 'error', 'closed'].includes(realtimeState)) {
        const reconnectLabel = reconnectAttempt > 0 ? ` · reconnect attempt ${reconnectAttempt}` : '';
        const errorLabel = lastError ? ` · ${lastError}` : '';

        return {
            label: `Data may be stale — reconnecting${reconnectLabel}${errorLabel}`,
            tone: 'warning',
            stale: false,
        };
    }

    if (refreshInFlight) {
        return {
            label: ageLabel ? `Refreshing · Last updated ${ageLabel}` : 'Refreshing Dispatch data...',
            tone: 'loading',
            stale: false,
        };
    }

    return {
        label: ageLabel ? `● Live · Updated ${ageLabel}` : '● Live',
        tone: 'live',
        stale: false,
    };
}

export function shouldRetainDispatchWallDataWhenOffline() {
    return true;
}

function formatDispatchWallAge(ageMs: number) {
    if (ageMs < 60_000) return 'just now';

    const minutes = Math.max(1, Math.round(ageMs / 60_000));

    if (minutes === 1) return '1 minute ago';

    return `${minutes} minutes ago`;
}
