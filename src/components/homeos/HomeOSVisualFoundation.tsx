import type { ReactNode } from 'react';
import {
    Image,
    Pressable,
    Text,
    View,
    type AccessibilityRole,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import {
    resolveHomeOSFallbackIcon,
    resolveHomeOSVisualSource,
    type HomeOSVisualAsset,
} from './homeos-visual-assets';

type ContainerPressProps = {
    onPress?: () => void;
    accessibilityLabel?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
};

function ContainerPress({
    children,
    onPress,
    accessibilityLabel,
    disabled,
    style,
}: ContainerPressProps & { children: ReactNode }) {
    const { theme } = useTheme();

    if (!onPress) return <View style={style}>{children}</View>;

    return (
        <Pressable
            accessibilityRole={'button' as AccessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled: Boolean(disabled) }}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                { opacity: disabled ? 0.52 : pressed ? 0.84 : 1 },
                pressed && { borderColor: theme.colors.primary },
                style,
            ]}
        >
            {children}
        </Pressable>
    );
}

function Visual({ asset, label, size = 'regular' }: {
    asset?: HomeOSVisualAsset;
    label: string;
    size?: 'compact' | 'regular' | 'destination';
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const source = resolveHomeOSVisualSource(asset);
    const height = size === 'destination'
        ? foundation.grid.imageHeight
        : size === 'compact'
            ? scaleIcon(52)
            : scaleIcon(92);

    return source ? (
        <Image
            source={source}
            accessibilityLabel={`${label} image`}
            resizeMode="cover"
            style={{
                width: '100%',
                height,
                borderRadius: foundation.radii.image,
                backgroundColor: theme.colors.surfaceAlt,
            }}
        />
    ) : (
        <View
            accessible={false}
            style={{
                width: '100%',
                height,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.iconBackground,
                borderCurve: 'continuous',
                borderRadius: foundation.radii.image,
            }}
        >
            <Text style={{ fontSize: scaleIcon(size === 'compact' ? 24 : 36) }}>
                {resolveHomeOSFallbackIcon(label)}
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
    disabled,
    style,
}: ContainerPressProps & {
    title: string;
    description?: string;
    visual?: HomeOSVisualAsset;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open ${title}`}
            style={[
                foundation.surface,
                {
                    minHeight: foundation.grid.destinationMinimumHeight,
                    padding: foundation.spacing.comfortable,
                    gap: foundation.spacing.regular,
                    boxShadow: foundation.shadow,
                },
                style,
            ]}
        >
            <Visual asset={visual} label={title} size="destination" />
            <Text selectable style={foundation.typography.destinationTitle}>{title}</Text>
            {description ? <Text selectable style={foundation.typography.body}>{description}</Text> : null}
        </ContainerPress>
    );
}

export function AreaContainer({ title, visual, onPress, accessibilityLabel, disabled, style }: ContainerPressProps & {
    title: string;
    visual?: HomeOSVisualAsset;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open area ${title}`}
            style={[
                foundation.surface,
                {
                    minWidth: foundation.grid.areaMinimumWidth,
                    padding: foundation.spacing.regular,
                    alignItems: 'center',
                    gap: foundation.spacing.compact,
                },
                style,
            ]}
        >
            <Visual asset={visual} label={title} size="compact" />
            <Text selectable numberOfLines={2} style={[foundation.typography.containerTitle, { textAlign: 'center' }]}>
                {title}
            </Text>
        </ContainerPress>
    );
}

export function EquipmentContainer({
    title,
    detail,
    visual,
    onPress,
    accessibilityLabel,
    disabled,
    style,
}: ContainerPressProps & {
    title: string;
    detail?: string;
    visual?: HomeOSVisualAsset;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);

    return (
        <ContainerPress
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={accessibilityLabel || `Open equipment ${title}`}
            style={[
                foundation.surface,
                {
                    minWidth: foundation.grid.equipmentMinimumWidth,
                    padding: foundation.spacing.regular,
                    gap: foundation.spacing.regular,
                },
                style,
            ]}
        >
            <Visual asset={visual} label={title} />
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
            <Visual asset={visual} label={title} size="destination" />
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
