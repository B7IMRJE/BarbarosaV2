export const HOMEOS_PHONE_LAYOUT_MAX_WIDTH = 700;
export const HOMEOS_TABLET_LAYOUT_MAX_WIDTH = 1100;

const HOME_HEALTH_CARD_ASPECT_RATIO = 1.15;

export function isHomeOSPhoneLayout(viewportWidth: number) {
    return viewportWidth <= HOMEOS_PHONE_LAYOUT_MAX_WIDTH;
}

/**
 * Keeps HomeOS container grids consistent while allowing callers to own their
 * available width. The result is intentionally layout-only: visual tokens
 * remain in the shared theme foundation.
 */
export function resolveHomeOSContainerGrid(viewportWidth: number, minimumItemWidth: number) {
    if (viewportWidth <= HOMEOS_PHONE_LAYOUT_MAX_WIDTH) {
        return viewportWidth >= minimumItemWidth * 2 + 16 ? 2 : 1;
    }

    if (viewportWidth <= HOMEOS_TABLET_LAYOUT_MAX_WIDTH) {
        return Math.max(3, Math.floor(viewportWidth / minimumItemWidth));
    }

    return Math.max(3, Math.min(5, Math.floor(viewportWidth / minimumItemWidth)));
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
