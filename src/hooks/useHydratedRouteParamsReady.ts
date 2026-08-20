import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Dynamic static-export routes render once without their concrete URL params.
 * Keep the first web render identical to that exported markup, then reveal the
 * client route params after hydration.
 */
export function useHydratedRouteParamsReady() {
    const [ready, setReady] = useState(Platform.OS !== 'web');

    useEffect(() => {
        setReady(true);
    }, []);

    return ready;
}
