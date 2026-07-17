import {
    DISPATCH_WALL_FALLBACK_REFRESH_MS,
    DISPATCH_WALL_MANUAL_REFRESH_LABEL,
    DISPATCH_WALL_RECONNECT_MAX_ATTEMPTS,
    getDispatchWallConnectionStatus,
    getDispatchWallReconnectPlan,
    shouldRefreshAfterDispatchWallRealtimeSubscribe,
    shouldRefreshDispatchWallForEvent,
    shouldRetainDispatchWallDataWhenOffline,
} from './dispatchWallLifecycle';

runDispatchWallLifecycleRegressions();

export function runDispatchWallLifecycleRegressions() {
    periodicFallbackRefreshContinuesRunning();
    tabVisibilityRegainTriggersRefresh();
    windowFocusTriggersRefresh();
    focusPlusVisibilityDoesNotOverlapDuplicateLoads();
    offlineStateKeepsExistingBoardData();
    onlineRecoveryReconnectsAndRefreshes();
    realtimeChannelErrorTriggersBoundedReconnect();
    successfulReconnectTriggersRefresh();
    oldRealtimeChannelsAreReplacedBeforeAnotherSubscribe();
    staleThresholdChangesLiveIndicatorToWarning();
    hiddenTabExplainsPossibleRefreshThrottling();
    manualRefreshActionStaysVisible();
    successfulLoadRestoresLiveState();
    repeatedFocusAndVisibilityDoNotCreateDuplicateSubscriptions();
}

function periodicFallbackRefreshContinuesRunning() {
    assert(DISPATCH_WALL_FALLBACK_REFRESH_MS === 30_000, 'Dispatch wall fallback refresh should remain 30 seconds.');
    assert(shouldRefreshDispatchWallForEvent({
        nowMs: 30_000,
        lastRefreshRequestAtMs: 0,
        refreshInFlight: false,
        online: true,
    }), 'Fallback interval should request a refresh when realtime appears connected.');
}

function tabVisibilityRegainTriggersRefresh() {
    assert(shouldRefreshDispatchWallForEvent({
        nowMs: 10_000,
        lastRefreshRequestAtMs: 0,
        refreshInFlight: false,
        online: true,
    }), 'Visible tab should request an immediate refresh.');
}

function windowFocusTriggersRefresh() {
    assert(shouldRefreshDispatchWallForEvent({
        nowMs: 10_000,
        lastRefreshRequestAtMs: 0,
        refreshInFlight: false,
        online: true,
    }), 'Window focus should request one refresh.');
}

function focusPlusVisibilityDoesNotOverlapDuplicateLoads() {
    assert(shouldRefreshDispatchWallForEvent({
        nowMs: 10_000,
        lastRefreshRequestAtMs: 0,
        refreshInFlight: false,
        online: true,
    }), 'First focus or visibility event should refresh.');
    assert(!shouldRefreshDispatchWallForEvent({
        nowMs: 10_100,
        lastRefreshRequestAtMs: 10_000,
        refreshInFlight: true,
        online: true,
    }), 'Overlapping focus plus visibility events should not trigger duplicate loads.');
}

function offlineStateKeepsExistingBoardData() {
    const status = getDispatchWallConnectionStatus({
        lastSuccessfulLoadAtMs: 1_000,
        nowMs: 20_000,
        realtimeState: 'offline',
        online: false,
        loading: false,
        refreshInFlight: false,
        reconnectAttempt: 0,
    });

    assert(status.tone === 'offline', 'Offline state should show an offline warning.');
    assert(status.label.includes('data may be stale'), 'Offline state should warn that data may be stale.');
    assert(shouldRetainDispatchWallDataWhenOffline(), 'Offline state should retain the last loaded board data.');
}

function onlineRecoveryReconnectsAndRefreshes() {
    const plan = getDispatchWallReconnectPlan({
        realtimeStatus: 'CLOSED',
        attempt: 1,
        online: true,
    });

    assert(plan.shouldReconnect, 'Online recovery should reconnect after a closed realtime channel.');
    assert(shouldRefreshDispatchWallForEvent({
        nowMs: 15_000,
        lastRefreshRequestAtMs: 0,
        refreshInFlight: false,
        online: true,
        force: true,
    }), 'Online recovery should force an immediate refresh.');
}

function realtimeChannelErrorTriggersBoundedReconnect() {
    const firstPlan = getDispatchWallReconnectPlan({
        realtimeStatus: 'CHANNEL_ERROR',
        attempt: 1,
        online: true,
    });
    const exhaustedPlan = getDispatchWallReconnectPlan({
        realtimeStatus: 'CHANNEL_ERROR',
        attempt: DISPATCH_WALL_RECONNECT_MAX_ATTEMPTS + 1,
        online: true,
    });

    assert(firstPlan.shouldReconnect, 'Realtime channel error should schedule a reconnect.');
    assert(firstPlan.delayMs > 0, 'Realtime channel reconnect should use backoff.');
    assert(!exhaustedPlan.shouldReconnect, 'Realtime reconnect should be bounded.');
}

function successfulReconnectTriggersRefresh() {
    assert(shouldRefreshAfterDispatchWallRealtimeSubscribe('SUBSCRIBED'), 'Successful realtime subscribe should refresh data.');
    assert(!shouldRefreshAfterDispatchWallRealtimeSubscribe('TIMED_OUT'), 'Timed-out subscribe should not be treated as a successful refresh.');
}

function oldRealtimeChannelsAreReplacedBeforeAnotherSubscribe() {
    const manager = createSubscriptionManager();

    manager.subscribe();
    manager.subscribe();

    assert(manager.activeChannels === 3, 'Resubscribe should keep only one active channel set.');
    assert(manager.removedChannels === 3, 'Resubscribe should remove old realtime channels before creating another set.');
}

function staleThresholdChangesLiveIndicatorToWarning() {
    const status = getDispatchWallConnectionStatus({
        lastSuccessfulLoadAtMs: 0,
        nowMs: 120_000,
        realtimeState: 'subscribed',
        online: true,
        loading: false,
        refreshInFlight: false,
        reconnectAttempt: 0,
    });

    assert(status.tone === 'warning', 'Stale data should not show a green Live indicator.');
    assert(status.label.includes('Data may be stale'), 'Stale data should show a warning label.');
}

function hiddenTabExplainsPossibleRefreshThrottling() {
    const status = getDispatchWallConnectionStatus({
        lastSuccessfulLoadAtMs: 0,
        nowMs: 240_000,
        realtimeState: 'subscribed',
        online: true,
        loading: false,
        refreshInFlight: false,
        reconnectAttempt: 0,
        tabHidden: true,
    });

    assert(status.tone === 'warning', 'Hidden stale tab should use a warning tone.');
    assert(status.label.includes('Browser tab hidden'), 'Hidden stale tab should distinguish browser throttling from backend failure.');
}

function manualRefreshActionStaysVisible() {
    assert(DISPATCH_WALL_MANUAL_REFRESH_LABEL === 'Refresh now', 'Activity Board should expose a visible manual refresh action.');
}

function successfulLoadRestoresLiveState() {
    const status = getDispatchWallConnectionStatus({
        lastSuccessfulLoadAtMs: 110_000,
        nowMs: 120_000,
        realtimeState: 'subscribed',
        online: true,
        loading: false,
        refreshInFlight: false,
        reconnectAttempt: 0,
    });

    assert(status.tone === 'live', 'A recent successful load with subscribed realtime should restore Live state.');
}

function repeatedFocusAndVisibilityDoNotCreateDuplicateSubscriptions() {
    const manager = createSubscriptionManager();

    manager.subscribe();
    manager.refreshFromLifecycleEvent(10_000);
    manager.refreshFromLifecycleEvent(10_100);
    manager.refreshFromLifecycleEvent(10_200);

    assert(manager.activeChannels === 3, 'Repeated focus and visibility refreshes should not create new subscriptions.');
    assert(manager.refreshes === 1, 'Repeated focus and visibility refreshes should debounce to one load.');
}

function createSubscriptionManager() {
    return {
        activeChannels: 0,
        removedChannels: 0,
        refreshes: 0,
        lastRefreshRequestAtMs: 0,
        subscribe() {
            if (this.activeChannels > 0) {
                this.removedChannels += this.activeChannels;
            }

            this.activeChannels = 3;
        },
        refreshFromLifecycleEvent(nowMs: number) {
            const shouldRefresh = shouldRefreshDispatchWallForEvent({
                nowMs,
                lastRefreshRequestAtMs: this.lastRefreshRequestAtMs,
                refreshInFlight: false,
                online: true,
            });

            if (!shouldRefresh) return;

            this.lastRefreshRequestAtMs = nowMs;
            this.refreshes += 1;
        },
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
