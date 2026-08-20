import type { TextStyle, ViewStyle } from 'react-native';
import type { HomeOSTheme } from './themes';

/** Shared visual values for HomeOS navigation and detail containers. */
export function getHomeOSVisualFoundation(
    theme: HomeOSTheme,
    scaleIcon: (size: number) => number,
    scaleFont: (size: number) => number
) {
    return {
        spacing: {
            compact: scaleIcon(8),
            regular: scaleIcon(12),
            comfortable: scaleIcon(16),
            spacious: scaleIcon(24),
        },
        grid: {
            gap: scaleIcon(12),
            areaMinimumWidth: scaleIcon(148),
            equipmentMinimumWidth: scaleIcon(168),
            destinationMinimumHeight: scaleIcon(204),
            imageHeight: scaleIcon(132),
        },
        radii: {
            container: theme.radii.card,
            image: Math.min(theme.radii.card, scaleIcon(16)),
        },
        shadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
        typography: {
            destinationTitle: {
                color: theme.colors.text,
                fontSize: scaleFont(21),
                fontWeight: '900',
                lineHeight: scaleFont(27),
            } satisfies TextStyle,
            containerTitle: {
                color: theme.colors.text,
                fontSize: scaleFont(16),
                fontWeight: '900',
                lineHeight: scaleFont(21),
            } satisfies TextStyle,
            body: {
                color: theme.colors.mutedText,
                fontSize: scaleFont(14),
                lineHeight: scaleFont(20),
            } satisfies TextStyle,
            label: {
                color: theme.colors.mutedText,
                fontSize: scaleFont(13),
                fontWeight: '800',
                lineHeight: scaleFont(18),
            } satisfies TextStyle,
        },
        surface: {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderCurve: 'continuous',
            borderRadius: theme.radii.card,
        } satisfies ViewStyle,
    } as const;
}
