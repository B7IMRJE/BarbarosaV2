import { homeOSThemes } from '../theme/themes';
import {
    resolveHomeDashboardActionCardPalettes,
    type HomeDashboardActionCardPalettes,
} from './homeDashboardActionCards';

export function runHomeDashboardActionCardRegressions() {
    everyThemeBuildsCompleteActionCardPalettes();
    actionCardsUseTheirSemanticThemeRoles();
    changingTheHomeownerThemeChangesActionCardColors();
}

function everyThemeBuildsCompleteActionCardPalettes() {
    Object.values(homeOSThemes).forEach((theme) => {
        const palettes = resolveHomeDashboardActionCardPalettes(theme);

        actionCardKeys.forEach((key) => {
            assert(isHexColor(palettes[key].backgroundColor), `${theme.name}.${key} should have a valid background.`);
            assert(isHexColor(palettes[key].borderColor), `${theme.name}.${key} should have a valid border.`);
        });
    });
}

function actionCardsUseTheirSemanticThemeRoles() {
    const theme = homeOSThemes.classic;
    const palettes = resolveHomeDashboardActionCardPalettes(theme);

    assert(
        palettes.emergency.backgroundColor === theme.colors.status.activeEmergency.background,
        'Emergency should use the active-emergency theme color.'
    );
    assert(
        palettes.maintenance.backgroundColor === theme.colors.status.notInspected.background,
        'Maintenance should use the theme maintenance-attention color.'
    );
    assert(
        palettes.connections.backgroundColor === theme.colors.surfaceAlt,
        'Connections should use the alternate theme surface.'
    );
    assert(
        palettes.requestService.backgroundColor === theme.colors.status.good.background,
        'Request Service should use the theme service-ready color.'
    );
    assert(
        new Set(actionCardKeys.map((key) => palettes[key].backgroundColor)).size === actionCardKeys.length,
        'The four HomeOS actions should be visually distinct.'
    );
}

function changingTheHomeownerThemeChangesActionCardColors() {
    const classic = resolveHomeDashboardActionCardPalettes(homeOSThemes.classic);
    const ocean = resolveHomeDashboardActionCardPalettes(homeOSThemes.ocean);

    actionCardKeys.forEach((key) => {
        assert(
            classic[key].backgroundColor !== ocean[key].backgroundColor ||
                classic[key].borderColor !== ocean[key].borderColor,
            `${key} should respond to the selected homeowner theme.`
        );
    });
}

const actionCardKeys: Array<keyof HomeDashboardActionCardPalettes> = [
    'emergency',
    'maintenance',
    'connections',
    'requestService',
];

runHomeDashboardActionCardRegressions();

function isHexColor(value: string) {
    return /^#[0-9a-f]{6}$/i.test(value);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
