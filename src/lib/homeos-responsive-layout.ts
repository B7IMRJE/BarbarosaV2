export const HOMEOS_PHONE_LAYOUT_MAX_WIDTH = 700;

const HOME_HEALTH_CARD_ASPECT_RATIO = 1.15;

export function isHomeOSPhoneLayout(viewportWidth: number) {
    return viewportWidth <= HOMEOS_PHONE_LAYOUT_MAX_WIDTH;
}

export function resolveHomeOSHealthCardHeight(
    tileWidth: number,
    minimumHeight: number,
    maximumHeight: number
) {
    return Math.min(
        maximumHeight,
        Math.max(minimumHeight, tileWidth / HOME_HEALTH_CARD_ASPECT_RATIO)
    );
}
