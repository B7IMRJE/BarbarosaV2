import {
    isHomeOSPhoneLayout,
    resolveHomeOSContainerGrid,
    resolveHomeOSHealthCardHeight,
} from './homeos-responsive-layout';

export function runHomeOSResponsiveLayoutRegressions() {
    widenedPhoneViewportKeepsPhoneLayout();
    desktopViewportUsesDesktopLayout();
    containerGridsScaleWithoutOverflow();
    healthCardsKeepComfortablePhoneProportions();
}

function widenedPhoneViewportKeepsPhoneLayout() {
    assert(isHomeOSPhoneLayout(390), 'A standard phone must use the phone layout.');
    assert(isHomeOSPhoneLayout(591), 'A widened iPhone browser viewport must keep the phone layout.');
    assert(isHomeOSPhoneLayout(700), 'The phone breakpoint must remain inclusive.');
}

function desktopViewportUsesDesktopLayout() {
    assert(!isHomeOSPhoneLayout(701), 'A desktop-width viewport must leave the phone layout.');
}

function containerGridsScaleWithoutOverflow() {
    assert(resolveHomeOSContainerGrid(280, 148) === 1, 'Narrow phones must collapse to one container column.');
    assert(resolveHomeOSContainerGrid(390, 148) === 2, 'Phone layouts should retain two columns when safe.');
    assert(resolveHomeOSContainerGrid(900, 148) >= 3, 'Tablets should use at least three columns when space permits.');
    assert(resolveHomeOSContainerGrid(1440, 148) <= 5, 'Desktop grids must preserve readable container widths.');
}

function healthCardsKeepComfortablePhoneProportions() {
    assert(
        resolveHomeOSHealthCardHeight(160, 144, 224) === 144,
        'Narrow phone cards must keep a comfortable minimum height.'
    );
    assert(
        resolveHomeOSHealthCardHeight(260, 144, 224) === 224,
        'Wide phone cards must not grow past the balanced maximum height.'
    );
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`HomeOS responsive layout regression failed: ${message}`);
    }
}

runHomeOSResponsiveLayoutRegressions();
