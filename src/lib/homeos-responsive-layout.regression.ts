import {
    isHomeOSPhoneLayout,
    resolveHomeOSHealthCardHeight,
} from './homeos-responsive-layout';

export function runHomeOSResponsiveLayoutRegressions() {
    widenedPhoneViewportKeepsPhoneLayout();
    desktopViewportUsesDesktopLayout();
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
