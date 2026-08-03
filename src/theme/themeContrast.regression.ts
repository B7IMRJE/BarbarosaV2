import {
    compositeThemeColors,
    getThemeContrastRatio,
    MINIMUM_BODY_TEXT_CONTRAST,
} from './colorContrast';
import { createCompanyGlassPalette, orbitalGlassPalette } from './glassPalette';
import { homeOSThemes } from './themes';
import {
    resolveCompanyWorkspaceTheme,
    type CompanyWorkspaceBrand,
} from '../lib/companyWorkspaceTheme';

const companyBrandExtremes: CompanyWorkspaceBrand[] = [
    { primary_color: '#075748', secondary_color: '#043F69', accent_color: '#D4AF37' },
    { primary_color: '#FFFFFF', secondary_color: '#F5F5F5', accent_color: '#FFFF00' },
    { primary_color: '#000000', secondary_color: '#000000', accent_color: '#000000' },
    { primary_color: '#808080', secondary_color: '#B0B0B0', accent_color: '#D7B13B' },
];

runThemeContrastRegressions();

export function runThemeContrastRegressions() {
    builtInThemesKeepReadableSemanticPairs();
    defaultGlassCardsStayReadableUnderHighlights();
    companyThemesKeepReadableSemanticPairs();
    companyGlassCardsStayReadableUnderHighlights();
    forcedGlassModeIsReadableBeforeCompanyBrandLoads();
}

function defaultGlassCardsStayReadableUnderHighlights() {
    Object.entries(orbitalGlassPalette.tones).forEach(([toneName, tone]) => {
        const panel = compositeThemeColors(tone.background, orbitalGlassPalette.screen);
        const highlightedPanel = compositeThemeColors(
            'rgba(255, 255, 255, 0.15)',
            panel
        );

        assertContrast(orbitalGlassPalette.text, highlightedPanel, `${toneName} glass title`);
        assertContrast(orbitalGlassPalette.mutedText, highlightedPanel, `${toneName} glass body`);
    });
}

function builtInThemesKeepReadableSemanticPairs() {
    Object.values(homeOSThemes).forEach((theme) => {
        assertContrast(theme.colors.text, theme.colors.surface, `${theme.name} surface text`);
        assertContrast(theme.colors.mutedText, theme.colors.surface, `${theme.name} muted surface text`);
        assertContrast(theme.colors.primaryText, theme.colors.primary, `${theme.name} primary button`);
        assertContrast(
            theme.colors.secondaryButtonText,
            theme.colors.secondaryButton,
            `${theme.name} secondary button`
        );
    });
}

function companyThemesKeepReadableSemanticPairs() {
    Object.values(homeOSThemes).forEach((baseTheme) => {
        companyBrandExtremes.forEach((brand, brandIndex) => {
            (['classic', 'glass'] as const).forEach((appearanceStyle) => {
                const theme = resolveCompanyWorkspaceTheme(baseTheme, brand, { appearanceStyle });
                const backdrop = appearanceStyle === 'glass' ? theme.colors.background : '#FFFFFF';
                const label = `${baseTheme.name} brand ${brandIndex + 1} ${appearanceStyle}`;

                assertContrast(theme.colors.text, theme.colors.surface, `${label} surface text`, backdrop);
                assertContrast(theme.colors.mutedText, theme.colors.surface, `${label} muted surface text`, backdrop);
                assertContrast(theme.colors.primaryText, theme.colors.primary, `${label} primary button`);
                assertContrast(
                    theme.colors.secondaryButtonText,
                    theme.colors.secondaryButton,
                    `${label} secondary button`,
                    backdrop
                );
            });
        });
    });
}

function companyGlassCardsStayReadableUnderHighlights() {
    Object.values(homeOSThemes).forEach((baseTheme) => {
        companyBrandExtremes.forEach((brand, brandIndex) => {
            const theme = resolveCompanyWorkspaceTheme(baseTheme, brand, {
                appearanceStyle: 'glass',
            });
            const palette = createCompanyGlassPalette({
                id: 'contrast-regression',
                label: 'Contrast regression',
                primary: brand.primary_color,
                secondary: brand.secondary_color,
                accent: brand.accent_color,
            });

            Object.entries(palette.tones).forEach(([toneName, tone]) => {
                const panel = compositeThemeColors(tone.background, theme.colors.background);
                const highlightedPanel = compositeThemeColors(
                    'rgba(255, 255, 255, 0.15)',
                    panel
                );
                const label = `${baseTheme.name} brand ${brandIndex + 1} ${toneName} glass card`;

                assertContrast(theme.colors.text, highlightedPanel, `${label} title`);
                assertContrast(theme.colors.mutedText, highlightedPanel, `${label} body`);
            });
        });
    });
}

function forcedGlassModeIsReadableBeforeCompanyBrandLoads() {
    Object.values(homeOSThemes).forEach((baseTheme) => {
        const theme = resolveCompanyWorkspaceTheme(baseTheme, null, {
            appearanceStyle: 'glass',
        });

        assertContrast(
            theme.colors.mutedText,
            theme.colors.surface,
            `${baseTheme.name} loading glass text`,
            theme.colors.background
        );
    });
}

function assertContrast(
    foreground: string,
    background: string,
    label: string,
    backdrop = '#FFFFFF'
) {
    const ratio = getThemeContrastRatio(foreground, background, backdrop);

    if (ratio < MINIMUM_BODY_TEXT_CONTRAST) {
        throw new Error(
            `${label} contrast ${ratio.toFixed(2)} is below ${MINIMUM_BODY_TEXT_CONTRAST}.`
        );
    }
}
