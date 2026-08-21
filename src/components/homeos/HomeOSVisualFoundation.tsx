import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import {
    Pressable,
    Text,
    View,
    type AccessibilityRole,
    type AccessibilityState,
    type ColorValue,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import {
    resolveHomeOSAreaFallbackIcon,
    resolveHomeOSEquipmentFallbackIcon,
    resolveHomeOSVisualSource,
    type HomeOSVisualAsset,
} from './homeos-visual-assets';

type ContainerPressProps = {
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityState?: AccessibilityState;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
};

function ContainerPress({
    children,
    onPress,
    accessibilityLabel,
    accessibilityState,
    disabled,
    style,
}: ContainerPressProps & { children: ReactNode }) {
    const { theme } = useTheme();

    if (!onPress) return <View style={style}>{children}</View>;

    return (
        <Pressable
            accessibilityRole={'button' as AccessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ ...accessibilityState, disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                {
                    opacity: disabled ? 0.52 : pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                },
                pressed && { borderColor: theme.colors.primary },
                style,
            ]}
        >
            {children}
        </Pressable>
    );
}

export function HomeOSCardVisual({
    asset,
    label,
    fallbackIcon,
    fallbackContext,
    size = 'regular',
    contentFit,
}: {
    asset?: HomeOSVisualAsset;
    label: string;
    fallbackIcon?: string;
    fallbackContext?: 'area' | 'equipment';
    size?: 'compact' | 'regular' | 'destination';
    contentFit?: 'cover' | 'contain';
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const source = resolveHomeOSVisualSource(asset);
    const height = size === 'destination'
        ? foundation.grid.destinationImageHeight
        : size === 'compact'
            ? foundation.grid.areaImageHeight
            : foundation.grid.equipmentImageHeight;
    const resolvedFallbackIcon = (fallbackContext || (size === 'compact' ? 'area' : 'equipment')) === 'area'
        ? resolveHomeOSAreaFallbackIcon(label, fallbackIcon)
        : resolveHomeOSEquipmentFallbackIcon(label, fallbackIcon);

    const heroSize = size === 'compact'
        ? scaleIcon(62)
        : size === 'destination'
            ? scaleIcon(72)
            : scaleIcon(68);

    return (
        <View
            accessible={false}
            style={[foundation.imageSurface, {
                width: '100%',
                height,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.iconBackground,
            }]}
        >
            {source ? (
                <>
                    <Image
                        source={source}
                        accessibilityLabel={`${label} image`}
                        alt={`${label} image`}
                        cachePolicy="memory-disk"
                        contentFit={contentFit || 'cover'}
                        transition={160}
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            opacity: 0.32,
                        }}
                    />
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            backgroundColor: theme.colors.iconBackground,
                            opacity: 0.42,
                        }}
                    />
                </>
            ) : null}
            <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                    fontSize: heroSize,
                    lineHeight: heroSize,
                    textAlign: 'center',
                }}
            >
                {resolvedFallbackIcon}
            </Text>
        </View>
    );
}

export function MainDestinationCard({
    title,
    description,
    visual,
    onPress,
    accessibilityLabel,
    accessibilityState,
    disabled,
    fallbackIcon,
    visualContentFit,
    actionLabel,
    accentColor,
    style,
}: ContainerPressProps & {
    title: string;
    description?: string;
    visual?: HomeOSVisualAsset;
    fallbackIcon?: string;
    visualContentFit?: 'cover' | 'contain';
    actionLabel?: string;
    accentColor?: ColorValue;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open ${title}`}
            accessibilityState={accessibilityState}
            style={[
                foundation.surface,
                {
                    minHeight: foundation.grid.destinationMinimumHeight,
                    padding: foundation.spacing.regular,
                    gap: foundation.spacing.compact,
                    overflow: 'hidden',
                },
                style,
            ]}
        >
            <HomeOSCardVisual
                asset={visual}
                label={title}
                fallbackIcon={fallbackIcon}
                fallbackContext="area"
                size="destination"
                contentFit={visualContentFit}
            />
            <View style={{ flex: 1, width: '100%', gap: foundation.spacing.compact }}>
                <Text selectable numberOfLines={2} style={foundation.typography.destinationTitle}>{title}</Text>
                {description ? <Text selectable numberOfLines={3} style={foundation.typography.body}>{description}</Text> : null}
                {actionLabel ? (
                    <Text
                        selectable
                        style={[foundation.typography.label, { color: theme.colors.primary, marginTop: 'auto' }]}
                    >
                        {actionLabel}  →
                    </Text>
                ) : null}
            </View>
            {accentColor ? (
                <View
                    style={{
                        pointerEvents: 'none',
                        position: 'absolute',
                        left: foundation.spacing.regular,
                        right: foundation.spacing.regular,
                        bottom: 0,
                        height: scaleIcon(3),
                        borderRadius: 999,
                        backgroundColor: accentColor,
                    }}
                />
            ) : null}
        </ContainerPress>
    );
}

export function AreaContainer({
    title,
    subtitle,
    visual,
    fallbackIcon,
    onPress,
    accessibilityLabel,
    accessibilityState,
    disabled,
    style,
}: ContainerPressProps & {
    title: string;
    subtitle?: string;
    visual?: HomeOSVisualAsset;
    fallbackIcon?: string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open area ${title}`}
            accessibilityState={accessibilityState}
            style={[
                foundation.surface,
                {
                    minWidth: foundation.grid.areaMinimumWidth,
                    minHeight: scaleIcon(204),
                    padding: foundation.spacing.regular,
                    alignItems: 'center',
                    gap: foundation.spacing.compact,
                },
                style,
            ]}
        >
            <HomeOSCardVisual asset={visual} label={title} fallbackIcon={fallbackIcon} fallbackContext="area" size="compact" />
            <Text selectable numberOfLines={2} style={[foundation.typography.containerTitle, { textAlign: 'center' }]}>
                {title}
            </Text>
            {subtitle ? <Text selectable numberOfLines={1} style={[foundation.typography.label, { textAlign: 'center' }]}>{subtitle}</Text> : null}
        </ContainerPress>
    );
}

export function EquipmentContainer({
    title,
    detail,
    visual,
    fallbackIcon,
    onPress,
    accessibilityLabel,
    accessibilityState,
    disabled,
    style,
}: ContainerPressProps & {
    title: string;
    detail?: string;
    visual?: HomeOSVisualAsset;
    fallbackIcon?: string;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open equipment ${title}`}
            accessibilityState={accessibilityState}
            style={[
                foundation.surface,
                {
                    minWidth: foundation.grid.equipmentMinimumWidth,
                    minHeight: scaleIcon(228),
                    padding: foundation.spacing.regular,
                    gap: foundation.spacing.regular,
                },
                style,
            ]}
        >
            <HomeOSCardVisual asset={visual} label={title} fallbackIcon={fallbackIcon} fallbackContext="equipment" contentFit="contain" />
            <View style={{ gap: foundation.spacing.compact }}>
                <Text selectable numberOfLines={2} style={foundation.typography.containerTitle}>{title}</Text>
                {detail ? <Text selectable numberOfLines={1} style={foundation.typography.body}>{detail}</Text> : null}
            </View>
        </ContainerPress>
    );
}

export function EquipmentDetailHeader({
    title,
    type,
    identifier,
    visual,
    style,
}: {
    title: string;
    type?: string;
    identifier?: string;
    visual?: HomeOSVisualAsset;
    style?: StyleProp<ViewStyle>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <View style={[foundation.surface, { padding: foundation.spacing.comfortable, gap: foundation.spacing.comfortable }, style]}>
            <HomeOSCardVisual asset={visual} label={title} fallbackContext="equipment" size="destination" />
            <View style={{ gap: foundation.spacing.compact }}>
                <Text selectable style={foundation.typography.destinationTitle}>{title}</Text>
                {type ? <Text selectable style={foundation.typography.body}>{type}</Text> : null}
                {identifier ? <Text selectable style={foundation.typography.label}>{identifier}</Text> : null}
            </View>
        </View>
    );
}

export function DetailSection({
    title,
    values,
    children,
    style,
}: {
    title: string;
    values?: readonly { label: string; value?: string | null }[];
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <View style={[foundation.surface, { padding: foundation.spacing.comfortable, gap: foundation.spacing.regular }, style]}>
            <Text selectable style={foundation.typography.containerTitle}>{title}</Text>
            {values?.map(({ label, value }) => (
                <View key={label} style={{ gap: foundation.spacing.compact }}>
                    <Text selectable style={foundation.typography.label}>{label}</Text>
                    <Text selectable style={[foundation.typography.body, { color: theme.colors.text }]}>{value || 'Not provided'}</Text>
                </View>
            ))}
            {children}
        </View>
    );
}

export type RoleActionBarAction = {
    key: string;
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass';
    accessibilityLabel?: string;
    disabled?: boolean;
};

/** Presentation-only: callers resolve role, permissions, and workflow decisions. */
export function RoleActionBar({ actions, style }: {
    actions: readonly RoleActionBarAction[];
    style?: StyleProp<ViewStyle>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    if (actions.length === 0) return null;

    return (
        <View style={[foundation.surface, { padding: foundation.spacing.regular, flexDirection: 'row', flexWrap: 'wrap', gap: foundation.spacing.compact }, style]}>
            {actions.map((action) => (
                <ThemedButton
                    key={action.key}
                    title={action.title}
                    variant={action.variant || 'secondary'}
                    onPress={action.onPress}
                    disabled={action.disabled}
                    accessibilityLabel={action.accessibilityLabel || action.title}
                    style={{ flexGrow: 1, minWidth: scaleIcon(136), paddingVertical: scaleIcon(10) }}
                    textStyle={{ fontSize: scaleFont(14) }}
                />
            ))}
        </View>
    );
}
