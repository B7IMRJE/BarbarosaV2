import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import {
    HomeOSCardVisual,
} from '../../components/homeos/HomeOSVisualFoundation';
import type { HomeOSVisualAsset } from '../../components/homeos/homeos-visual-assets';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function CompactHomeOSCard({
    title,
    subtitle,
    icon,
    visual,
    kind = 'equipment',
    accentColor,
    onOpen,
    openDisabled = false,
    actionTitle,
    onAction,
    secondaryActionTitle,
    onSecondaryAction,
    menuTitle,
    onMenu,
    disabled = false,
    style,
}: {
    title: string;
    subtitle?: string;
    icon: string;
    visual?: HomeOSVisualAsset;
    kind?: 'area' | 'equipment';
    accentColor?: ColorValue;
    onOpen: () => void;
    openDisabled?: boolean;
    actionTitle?: string;
    onAction?: () => void;
    secondaryActionTitle?: string;
    onSecondaryAction?: () => void;
    menuTitle?: string;
    onMenu?: () => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const areaCard = kind === 'area';

    return (
        <ThemedCard style={[
            foundation.surface,
            {
            width: '47%',
            minWidth: areaCard
                ? foundation.grid.areaMinimumWidth
                : foundation.grid.equipmentMinimumWidth,
            maxWidth: scaleIcon(250),
            minHeight: scaleIcon(areaCard ? 176 : 202),
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: foundation.spacing.compact,
            gap: foundation.spacing.compact,
            overflow: 'hidden',
        }, style]}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${title}`}
                accessibilityState={{ disabled: openDisabled || disabled }}
                onPress={onOpen}
                activeOpacity={0.82}
                disabled={openDisabled || disabled}
                style={{ alignItems: 'center', width: '100%', flex: 1, gap: foundation.spacing.compact, opacity: disabled ? 0.58 : 1 }}
            >
                <HomeOSCardVisual
                    asset={visual}
                    label={title}
                    fallbackIcon={icon}
                    size={areaCard ? 'compact' : 'regular'}
                    contentFit={areaCard ? 'cover' : 'contain'}
                />
                <Text selectable numberOfLines={2} ellipsizeMode="tail" style={[foundation.typography.containerTitle, { textAlign: 'center' }]}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text selectable numberOfLines={1} style={[foundation.typography.label, { textAlign: 'center' }]}>
                        {subtitle}
                    </Text>
                )}
            </TouchableOpacity>

            {!!actionTitle && !!onAction && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${actionTitle}: ${title}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onAction} style={{ minHeight: scaleIcon(44), alignSelf: 'center', justifyContent: 'center', paddingVertical: scaleIcon(6), paddingHorizontal: scaleIcon(8) }}>
                    <Text style={{ color: theme.colors.primary, fontSize: scaleFont(12), fontWeight: '900' }}>{actionTitle}</Text>
                </TouchableOpacity>
            )}

            {!!secondaryActionTitle && !!onSecondaryAction && (
                <ThemedButton title={secondaryActionTitle} disabled={disabled} onPress={onSecondaryAction} style={{ alignSelf: 'center', marginTop: scaleIcon(8), paddingVertical: scaleIcon(7), paddingHorizontal: scaleIcon(12), minWidth: scaleIcon(92) }} textStyle={{ fontSize: scaleFont(12) }} />
            )}

            {!!onMenu && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${menuTitle || 'More actions'}: ${title}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onMenu} style={{ position: 'absolute', top: scaleIcon(7), right: scaleIcon(7), width: scaleIcon(44), height: scaleIcon(44), borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900', letterSpacing: 1, lineHeight: scaleFont(13) }}>•••</Text>
                </TouchableOpacity>
            )}
            {!!accentColor && (
                <View style={{ pointerEvents: 'none', position: 'absolute', left: foundation.spacing.regular, right: foundation.spacing.regular, bottom: 0, height: scaleIcon(3), borderRadius: 999, backgroundColor: accentColor }} />
            )}
        </ThemedCard>
    );
}
