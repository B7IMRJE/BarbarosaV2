import { resolveDispatchWallLayout } from './dispatchWallLayout';

export function runDispatchWallLayoutRegressions() {
    phoneViewStacksPanels();
    zoomedLaptopKeepsFixedWallboard();
    desktopKeepsFullWallboardChrome();
    shortScreensUseCompactCards();
}

function phoneViewStacksPanels() {
    const layout = resolveDispatchWallLayout(390, 844);

    assert(layout.stacked, 'A phone-width wallboard should stack its panels.');
    assert(!layout.compactWidth, 'A stacked phone view should not use the compact fixed-grid header.');
}

function zoomedLaptopKeepsFixedWallboard() {
    const layout = resolveDispatchWallLayout(700, 720);

    assert(!layout.stacked, 'A zoomed laptop must retain the fixed wallboard panel grid.');
    assert(layout.compactWidth, 'A zoomed laptop should use compact wallboard labels and header chrome.');
}

function desktopKeepsFullWallboardChrome() {
    const layout = resolveDispatchWallLayout(1440, 900);

    assert(!layout.stacked, 'A desktop wallboard must retain the fixed panel grid.');
    assert(!layout.compactWidth, 'A wide desktop should use the full wallboard header.');
}

function shortScreensUseCompactCards() {
    const layout = resolveDispatchWallLayout(1440, 760);

    assert(layout.compactHeight, 'A short wallboard viewport should use compact job cards.');
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Dispatch wall layout regression failed: ${message}`);
    }
}

runDispatchWallLayoutRegressions();
