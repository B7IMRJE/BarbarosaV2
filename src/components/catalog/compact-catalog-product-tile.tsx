import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import ProductCardImage from './product-card-image';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';

type TileAction = {
    title: string;
    onPress: () => void;
    accessibilityLabel?: string;
    testID?: string;
    selected?: boolean;
    disabled?: boolean;
};

export default function CompactCatalogProductTile({
    shortCode,
    imageUrl,
    productName,
    model,
    identity,
    selected = false,
    disabled = false,
    onOpen,
    primaryAction,
    secondaryAction,
    tertiaryAction,
    style,
}: {
    shortCode?: string;
    imageUrl?: string | null;
    productName: string;
    model?: string;
    identity?: string;
    selected?: boolean;
    disabled?: boolean;
    onOpen: () => void;
    primaryAction?: TileAction;
    secondaryAction?: TileAction;
    tertiaryAction?: TileAction;
    style?: StyleProp<ViewStyle>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const actions = [primaryAction, secondaryAction, tertiaryAction].filter((action): action is TileAction => Boolean(action));

    return (
        <ThemedCard style={[foundation.surface, {
            width: scaleIcon(210),
            minWidth: scaleIcon(176),
            maxWidth: scaleIcon(260),
            minHeight: scaleIcon(280),
            flexGrow: 1,
            flexBasis: scaleIcon(188),
            padding: foundation.spacing.regular,
            borderWidth: selected ? 3 : 1,
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            borderCurve: 'continuous',
            gap: foundation.spacing.compact,
            opacity: disabled ? 0.58 : 1,
        }, style]}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${shortCode ? `card ${shortCode}, ` : ''}${productName}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                activeOpacity={0.82}
                onPress={onOpen}
                style={{ flex: 1, width: '100%', alignItems: 'stretch', gap: foundation.spacing.compact }}
            >
                <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: scaleIcon(24) }}>
                    {!!shortCode && (
                        <View style={{ borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: scaleIcon(7), paddingVertical: scaleIcon(3) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(11), lineHeight: scaleFont(14), fontWeight: '900', letterSpacing: 0.6 }}>{shortCode}</Text>
                        </View>
                    )}
                    {selected && <Text selectable style={{ color: theme.colors.primary, fontSize: scaleFont(12), fontWeight: '900' }}>SELECTED</Text>}
                </View>
                <ProductCardImage imageUrl={imageUrl} productName={productName} compact style={{ width: '100%', height: foundation.grid.equipmentImageHeight, minHeight: foundation.grid.equipmentImageHeight }} />
                <Text selectable numberOfLines={2} style={[foundation.typography.containerTitle, { textAlign: 'left' }]}>{productName}</Text>
                {!!model && <Text selectable numberOfLines={1} style={[foundation.typography.label, { textAlign: 'left' }]}>{model}</Text>}
                {!!identity && <Text selectable numberOfLines={1} style={[foundation.typography.body, { fontSize: scaleFont(12), lineHeight: scaleFont(17), textAlign: 'left' }]}>{identity}</Text>}
            </TouchableOpacity>
            {!!actions.length && (
                <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(5), marginTop: 'auto' }}>
                    {actions.map((action) => (
                        <ThemedButton
                            key={action.title}
                            title={action.title}
                            accessibilityLabel={action.accessibilityLabel}
                            testID={action.testID}
                            variant={action.selected ? undefined : 'secondary'}
                            disabled={disabled || action.disabled}
                            onPress={action.onPress}
                            style={{ minHeight: scaleIcon(40), flexGrow: 1, flexBasis: scaleIcon(60), paddingHorizontal: scaleIcon(6), paddingVertical: scaleIcon(6) }}
                            textStyle={{ fontSize: scaleFont(12), lineHeight: scaleFont(15) }}
                        />
                    ))}
                </View>
            )}
        </ThemedCard>
    );
}
