import { useCallback, useRef } from 'react';

/**
 * Keeps an imperative callback identity stable while always calling the latest
 * committed render implementation. Use this for callbacks shared by effects
 * and user actions, where React's effect-only useEffectEvent is not applicable.
 */
export function useStableCallback<TArgs extends unknown[], TResult>(
    callback: (...args: TArgs) => TResult
) {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    return useCallback(
        (...args: TArgs) => callbackRef.current(...args),
        []
    );
}
