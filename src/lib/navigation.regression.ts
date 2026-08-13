import { shouldShowGlobalBackButton } from './navigation';

runNavigationRegressions();

export function runNavigationRegressions() {
    assert(!shouldShowGlobalBackButton('/'), 'HomeOS home must not render a disabled Back button.');
    assert(!shouldShowGlobalBackButton('/?providerMode=1'), 'Client HomeOS home must not render a disabled Back button.');
    assert(shouldShowGlobalBackButton('/equipment'), 'Deeper HomeOS pages must retain Back navigation.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
