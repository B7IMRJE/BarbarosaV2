import {
    isHomeOSPhoneLayout,
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
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
    const viewports = [280, 320, 390, 700, 900, 1100, 1440];
    const systemLayouts = viewports.map((viewportWidth) => resolveLayout({
        viewportWidth,
        contentWidth: Math.min(Math.max(viewportWidth - 40, 0), 900),
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    }));
    const areaLayouts = viewports.map((viewportWidth) => resolveLayout({
        viewportWidth,
        contentWidth: Math.min(Math.max(viewportWidth - 40, 0), 900),
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    }));
    const homeLayouts = viewports.map((viewportWidth) => resolveLayout({
        viewportWidth,
        contentWidth: Math.min(Math.max(viewportWidth - 40, 0), 1120),
        minimumItemWidth: 152,
        maximumItemWidth: 260,
        maximumColumns: 4,
    }));

    assertColumns(systemLayouts, [1, 1, 2, 2, 5, 5, 5], 'system');
    assertColumns(areaLayouts, [1, 1, 2, 2, 5, 5, 5], 'area');
    assertColumns(homeLayouts, [1, 1, 2, 2, 4, 4, 4], 'home destination');
    assertMinimumWidths(systemLayouts, 152, 'system');
    assertMinimumWidths(areaLayouts, 152, 'area');
    assertMinimumWidths(homeLayouts, 152, 'home destination');
    assertMonotonicColumns(systemLayouts, 'system');
    assertMonotonicColumns(areaLayouts, 'area');
    assertMonotonicColumns(homeLayouts, 'home destination');
    assertContinuousLayoutBehavior({
        surface: 'system',
        contentCap: 900,
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    });
    assertContinuousLayoutBehavior({
        surface: 'area',
        contentCap: 900,
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    });
    assertContinuousLayoutBehavior({
        surface: 'home destination',
        contentCap: 1120,
        minimumItemWidth: 152,
        maximumItemWidth: 260,
        maximumColumns: 4,
    });

    const breakpointBefore = resolveLayout({
        viewportWidth: 700,
        contentWidth: 660,
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    });
    const breakpointAfter = resolveLayout({
        viewportWidth: 701,
        contentWidth: 661,
        minimumItemWidth: 152,
        maximumItemWidth: 220,
        maximumColumns: 5,
    });

    assert(
        breakpointAfter.columns >= breakpointBefore.columns,
        'Leaving phone layout must never reduce the number of fitting columns.'
    );
    assert(
        breakpointAfter.itemWidth >= 152,
        'The first wider-layout card must retain its declared minimum width.'
    );
}

function resolveLayout({
    viewportWidth,
    contentWidth,
    minimumItemWidth,
    maximumItemWidth,
    maximumColumns,
}: {
    viewportWidth: number;
    contentWidth: number;
    minimumItemWidth: number;
    maximumItemWidth: number;
    maximumColumns: number;
}) {
    const gap = 12;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth,
        gap,
        maximumColumns,
    });

    return {
        viewportWidth,
        columns,
        itemWidth: resolveHomeOSContainerItemWidth({
            contentWidth,
            columns,
            gap,
            minimumItemWidth,
            maximumItemWidth,
        }),
    };
}

function assertColumns(
    layouts: readonly { viewportWidth: number; columns: number }[],
    expected: readonly number[],
    surface: string
) {
    layouts.forEach((layout, index) => {
        assert(
            layout.columns === expected[index],
            `${surface} layout at ${layout.viewportWidth}px must use ${expected[index]} columns, received ${layout.columns}.`
        );
    });
}

function assertMinimumWidths(
    layouts: readonly { viewportWidth: number; itemWidth: number }[],
    minimumItemWidth: number,
    surface: string
) {
    layouts.forEach((layout) => {
        assert(
            layout.itemWidth >= minimumItemWidth,
            `${surface} cards at ${layout.viewportWidth}px must remain at least ${minimumItemWidth}px wide, received ${layout.itemWidth}.`
        );
    });
}

function assertMonotonicColumns(
    layouts: readonly { viewportWidth: number; columns: number }[],
    surface: string
) {
    layouts.slice(1).forEach((layout, index) => {
        assert(
            layout.columns >= layouts[index].columns,
            `${surface} columns must not decrease from ${layouts[index].viewportWidth}px to ${layout.viewportWidth}px.`
        );
    });
}

function assertContinuousLayoutBehavior({
    surface,
    contentCap,
    minimumItemWidth,
    maximumItemWidth,
    maximumColumns,
}: {
    surface: string;
    contentCap: number;
    minimumItemWidth: number;
    maximumItemWidth: number;
    maximumColumns: number;
}) {
    let previousColumns = 0;

    for (let viewportWidth = 280; viewportWidth <= 1440; viewportWidth += 1) {
        const layout = resolveLayout({
            viewportWidth,
            contentWidth: Math.min(Math.max(viewportWidth - 40, 0), contentCap),
            minimumItemWidth,
            maximumItemWidth,
            maximumColumns,
        });

        assert(
            layout.columns >= previousColumns,
            `${surface} columns must not decrease at ${viewportWidth}px.`
        );
        assert(
            layout.itemWidth >= minimumItemWidth,
            `${surface} cards must retain their minimum width at ${viewportWidth}px.`
        );
        previousColumns = layout.columns;
    }
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
