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
export function resolveHomeOSContainerGrid({
    viewportWidth,
    contentWidth,
    minimumItemWidth,
    gap,
    maximumColumns = 5,
}: {
    viewportWidth: number;
    contentWidth: number;
    minimumItemWidth: number;
    gap: number;
    maximumColumns?: number;
}) {
    const safeGap = Math.max(0, gap);
    const safeMinimumWidth = Math.max(1, minimumItemWidth);
    const fittingColumns = Math.max(
        1,
        Math.floor((Math.max(0, contentWidth) + safeGap) / (safeMinimumWidth + safeGap))
    );
    const responsiveMaximum = viewportWidth <= HOMEOS_PHONE_LAYOUT_MAX_WIDTH
        ? Math.min(2, maximumColumns)
        : maximumColumns;

    return Math.max(1, Math.min(fittingColumns, responsiveMaximum));
}

export function resolveHomeOSContainerItemWidth({
    contentWidth,
    columns,
    gap,
    minimumItemWidth,
    maximumItemWidth,
}: {
    contentWidth: number;
    columns: number;
    gap: number;
    minimumItemWidth: number;
    maximumItemWidth: number;
}) {
    const safeContentWidth = Math.max(0, contentWidth);
    const safeColumns = Math.max(1, columns);
    const availableWidth = (
        safeContentWidth - Math.max(0, gap) * (safeColumns - 1)
    ) / safeColumns;
    const safeMinimumWidth = Math.min(Math.max(0, minimumItemWidth), safeContentWidth);

    return Math.min(maximumItemWidth, Math.max(safeMinimumWidth, availableWidth));
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
