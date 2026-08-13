export function resolveCompanyTeamContentWidth(
    viewportWidth: number,
    horizontalPadding: number,
    maximumWidth = 900
) {
    const safeViewportWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
    const safePadding = Number.isFinite(horizontalPadding) ? Math.max(0, horizontalPadding) : 0;
    const safeMaximumWidth = Number.isFinite(maximumWidth) ? Math.max(0, maximumWidth) : 0;

    return Math.min(safeMaximumWidth, Math.max(0, safeViewportWidth - safePadding * 2));
}
