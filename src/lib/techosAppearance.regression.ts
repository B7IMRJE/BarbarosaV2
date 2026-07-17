import {
    DEFAULT_TECHOS_THEME_ID,
    TECHOS_DASHBOARD_VISUAL_VARIANTS,
    TECHOS_JOB_DETAIL_VISUAL_VARIANTS,
    resolveTechOSDashboardVariant,
    resolveTechOSJobDetailVariant,
    resolveTechOSTheme,
    techOSThemeStorageKey,
    techOSThemeOptions,
    type TechOSDashboardVisualKey,
    type TechOSJobDetailVisualKey,
} from './techosAppearance';
import {
    buildTechOSProviderHomeRoute,
    getTechOSEstimateActionLabel,
} from './techosClientAccess';
import { TECH_WORKFLOW_ACTIONS } from './techosWorkflow';

export function runTechOSAppearanceRegressions() {
    professionalIsDefaultTheme();
    softPreservesCurrentPalette();
    everyThemeHasCompleteTokens();
    themeSelectionChangesDashboardAndJobDetailVariants();
    invalidSavedThemeFallsBackToProfessional();
    themeStorageIsUserScopedAndSeparateFromHomeOS();
    workflowButtonsAndNavigationRemainUnchanged();
}

function professionalIsDefaultTheme() {
    assert(resolveTechOSTheme().id === DEFAULT_TECHOS_THEME_ID, 'TechOS should default to Professional.');
    assert(resolveTechOSTheme().label === 'Professional', 'Default TechOS theme should be Professional.');
}

function softPreservesCurrentPalette() {
    assert(
        resolveTechOSDashboardVariant('jobs', 'soft').accentColor === TECHOS_DASHBOARD_VISUAL_VARIANTS.jobs.accentColor,
        'Soft should preserve the previous dashboard Jobs accent.'
    );
    assert(
        resolveTechOSJobDetailVariant('customer', 'soft').accentColor === TECHOS_JOB_DETAIL_VISUAL_VARIANTS.customer.accentColor,
        'Soft should preserve the previous job-detail Customer accent.'
    );
}

function everyThemeHasCompleteTokens() {
    techOSThemeOptions.forEach((theme) => {
        assert(theme.id, 'Theme should have an id.');
        assert(theme.label, `Theme ${theme.id} should have a label.`);
        assert(theme.screenBackgroundColor, `Theme ${theme.id} should have a screen background.`);
        assert(theme.panelBackgroundColor, `Theme ${theme.id} should have a panel background.`);
        assert(theme.panelBorderColor, `Theme ${theme.id} should have a panel border.`);
        assert(theme.textColor, `Theme ${theme.id} should have text color.`);
        assert(theme.mutedTextColor, `Theme ${theme.id} should have muted text color.`);
        assert(theme.activeBorderColor, `Theme ${theme.id} should have active border color.`);

        dashboardKeys.forEach((key) => assertCompleteVariant(theme.dashboard[key], `${theme.id}.${key}`));
        jobDetailKeys.forEach((key) => assertCompleteVariant(theme.jobDetail[key], `${theme.id}.${key}`));
    });
}

function themeSelectionChangesDashboardAndJobDetailVariants() {
    assert(
        resolveTechOSDashboardVariant('jobs', 'professional').backgroundColor !== resolveTechOSDashboardVariant('jobs', 'soft').backgroundColor,
        'Selecting a TechOS theme should update dashboard card variants.'
    );
    assert(
        resolveTechOSJobDetailVariant('workflow', 'darkOperations').backgroundColor !== resolveTechOSJobDetailVariant('workflow', 'professional').backgroundColor,
        'Selecting a TechOS theme should update job-detail section variants.'
    );
}

function invalidSavedThemeFallsBackToProfessional() {
    assert(resolveTechOSTheme('not-a-theme').id === DEFAULT_TECHOS_THEME_ID, 'Invalid stored TechOS theme should fall back to Professional.');
}

function themeStorageIsUserScopedAndSeparateFromHomeOS() {
    assert(
        techOSThemeStorageKey('user-a') !== techOSThemeStorageKey('user-b'),
        'User A and User B should not share TechOS theme storage.'
    );
    assert(
        !techOSThemeStorageKey('user-a').startsWith('homeos_'),
        'TechOS theme should not modify HomeOS theme storage.'
    );
}

function workflowButtonsAndNavigationRemainUnchanged() {
    const workflowLabels = TECH_WORKFLOW_ACTIONS.map((action) => action.label).join('|');
    const route = buildTechOSProviderHomeRoute({
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
    });

    assert(workflowLabels.includes('On My Way'), 'Workflow actions should still include On My Way.');
    assert(workflowLabels.includes("I've Arrived"), "Workflow actions should still include I've Arrived.");
    assert(workflowLabels.includes('Start Work'), 'Workflow actions should still include Start Work.');
    assert(getTechOSEstimateActionLabel(1) === 'Continue Estimate / Quote', 'Estimate action labels should remain unchanged.');
    assert(route.params.providerMode === '1', 'Open Client HomeOS route should remain provider mode.');
}

function assertCompleteVariant(value: { accentColor?: string; backgroundColor?: string; borderColor?: string } | undefined, label: string) {
    assert(value?.accentColor, `${label} should have an accent color.`);
    assert(value?.backgroundColor, `${label} should have a background color.`);
    assert(value?.borderColor, `${label} should have a border color.`);
}

const dashboardKeys: TechOSDashboardVisualKey[] = [
    'jobs',
    'schedule',
    'history',
    'estimates',
    'sales',
    'messages',
    'time-clock',
    'van-inventory',
];

const jobDetailKeys: TechOSJobDetailVisualKey[] = [
    'customer',
    'request',
    'status',
    'workflow',
    'note',
    'estimate',
    'finish',
];

runTechOSAppearanceRegressions();

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
