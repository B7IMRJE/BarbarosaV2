import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import ProductCardImage from './product-card-image';

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
    const actions = [primaryAction, secondaryAction, tertiaryAction].filter((action): action is TileAction => Boolean(action));

    return (
        <ThemedCard style={[{
            width: scaleIcon(148),
            minWidth: scaleIcon(138),
            maxWidth: scaleIcon(178),
            minHeight: scaleIcon(208),
            flexGrow: 1,
            flexBasis: scaleIcon(142),
            padding: scaleIcon(9),
            borderWidth: selected ? 3 : 1,
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            borderCurve: 'continuous',
            gap: scaleIcon(7),
            opacity: disabled ? 0.58 : 1,
        }, style]}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${shortCode ? `card ${shortCode}, ` : ''}${productName}`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                activeOpacity={0.82}
                onPress={onOpen}
                style={{ flex: 1, width: '100%', alignItems: 'center', gap: scaleIcon(5) }}
            >
                <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: scaleIcon(24) }}>
                    {!!shortCode && (
                        <View style={{ borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: scaleIcon(7), paddingVertical: scaleIcon(3) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(11), lineHeight: scaleFont(14), fontWeight: '900', letterSpacing: 0.6 }}>{shortCode}</Text>
                        </View>
                    )}
                    {selected && <Text selectable style={{ color: theme.colors.primary, fontSize: scaleFont(12), fontWeight: '900' }}>SELECTED</Text>}
                </View>
                <ProductCardImage imageUrl={imageUrl} productName={productName} compact style={{ width: scaleIcon(72), height: scaleIcon(72), minHeight: scaleIcon(72) }} />
                <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(18), fontWeight: '900', textAlign: 'center' }}>{productName}</Text>
                {!!model && <Text selectable numberOfLines={1} style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', textAlign: 'center' }}>{model}</Text>}
                {!!identity && <Text selectable numberOfLines={1} style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), textAlign: 'center' }}>{identity}</Text>}
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
