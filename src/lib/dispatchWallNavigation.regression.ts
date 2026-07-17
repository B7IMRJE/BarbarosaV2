import {
    buildDispatchWallRoute,
    DISPATCH_WALL_BACK_LABEL,
    DISPATCH_WALL_EXIT_FULLSCREEN_LABEL,
    DISPATCH_WALL_FULLSCREEN_LABEL,
    DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE,
    getDispatchWallBackRoute,
    getDispatchWallFullscreenLabel,
    shouldOpenDispatchWallInCurrentStack,
    shouldReplaceDispatchWallWhenLeaving,
} from './dispatchWallNavigation';

runDispatchWallNavigationRegressions();

export function runDispatchWallNavigationRegressions() {
    dispatchOfficeOpensBoardWithReturnContext();
    backToDispatchOfficePreservesCompany();
    browserBackIsSupportedBySameStackNavigation();
    fullscreenExitLabelStaysAvailable();
    phoneHeaderHasStableBackLabel();
    leavingBoardDoesNotImmediatelyReopenIt();
    nonOfficeLaunchFallsBackToCompanyDashboard();
}

function dispatchOfficeOpensBoardWithReturnContext() {
    const route = buildDispatchWallRoute({
        companyId: 'company 123',
        source: DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE,
    });

    assert(route === '/dispatch-wall?companyId=company%20123&from=dispatch-office', 'Dispatch Office should open the board with return context.');
}

function backToDispatchOfficePreservesCompany() {
    const route = getDispatchWallBackRoute({
        companyId: 'company 123',
        openedFrom: DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE,
    });

    assert(route === '/dispatch?companyId=company%20123', 'Back to Dispatch Office should preserve companyId.');
}

function browserBackIsSupportedBySameStackNavigation() {
    assert(shouldOpenDispatchWallInCurrentStack(), 'Activity Board should open in the current route stack so browser Back can return normally.');
}

function fullscreenExitLabelStaysAvailable() {
    assert(getDispatchWallFullscreenLabel(false) === DISPATCH_WALL_FULLSCREEN_LABEL, 'Board should still expose a Full Screen action.');
    assert(getDispatchWallFullscreenLabel(true) === DISPATCH_WALL_EXIT_FULLSCREEN_LABEL, 'Board should keep Exit Full Screen visible in browser fullscreen.');
}

function phoneHeaderHasStableBackLabel() {
    assert(DISPATCH_WALL_BACK_LABEL === 'Back to Dispatch Office', 'Phone layout should keep a visible Back to Dispatch Office action.');
}

function leavingBoardDoesNotImmediatelyReopenIt() {
    assert(shouldReplaceDispatchWallWhenLeaving(), 'Explicitly leaving the board should replace the route instead of leaving the board directly behind it.');
}

function nonOfficeLaunchFallsBackToCompanyDashboard() {
    const route = getDispatchWallBackRoute({
        companyId: 'company 123',
        openedFrom: '',
    });

    assert(route === '/super-admin/company/company%20123', 'Board opened outside Dispatch Office should fall back to the company dashboard.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
