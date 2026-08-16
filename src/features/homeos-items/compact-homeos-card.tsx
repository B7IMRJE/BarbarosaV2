import type { StyleProp, ViewStyle } from 'react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function CompactHomeOSCard({
    title,
    subtitle,
    icon,
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

    return (
        <ThemedCard style={[{
            width: '47%',
            minWidth: scaleIcon(180),
            maxWidth: scaleIcon(250),
            minHeight: scaleIcon(166),
            borderWidth: 2,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: scaleIcon(12),
        }, style]}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${title}`}
                onPress={onOpen}
                activeOpacity={0.82}
                disabled={openDisabled || disabled}
                style={{ alignItems: 'center', justifyContent: 'center', width: '100%', flex: 1, opacity: disabled ? 0.58 : 1 }}
            >
                <View style={{
                    width: scaleIcon(60),
                    height: scaleIcon(60),
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: scaleIcon(10),
                    backgroundColor: theme.colors.iconBackground,
                }}>
                    <Text style={{ fontSize: scaleIcon(30) }}>{icon}</Text>
                </View>
                <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: theme.colors.text, fontSize: scaleFont(15), lineHeight: scaleFont(19), fontWeight: '900', textAlign: 'center' }}>
                    {title}
                </Text>
                {!!subtitle && (
                    <Text numberOfLines={1} style={{ color: theme.colors.mutedText, marginTop: scaleIcon(6), fontSize: scaleFont(12), fontWeight: '800', textAlign: 'center' }}>
                        {subtitle}
                    </Text>
                )}
            </TouchableOpacity>

            {!!actionTitle && !!onAction && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${actionTitle}: ${title}`} disabled={disabled} onPress={onAction} style={{ alignSelf: 'center', paddingVertical: scaleIcon(6), paddingHorizontal: scaleIcon(8), marginTop: scaleIcon(5) }}>
                    <Text style={{ color: theme.colors.primary, fontSize: scaleFont(12), fontWeight: '900' }}>{actionTitle}</Text>
                </TouchableOpacity>
            )}

            {!!secondaryActionTitle && !!onSecondaryAction && (
                <ThemedButton title={secondaryActionTitle} disabled={disabled} onPress={onSecondaryAction} style={{ alignSelf: 'center', marginTop: scaleIcon(8), paddingVertical: scaleIcon(7), paddingHorizontal: scaleIcon(12), minWidth: scaleIcon(92) }} textStyle={{ fontSize: scaleFont(12) }} />
            )}

            {!!onMenu && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${menuTitle || 'More actions'}: ${title}`} disabled={disabled} onPress={onMenu} style={{ position: 'absolute', top: scaleIcon(7), right: scaleIcon(8), width: scaleIcon(30), height: scaleIcon(26), borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.52)' }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900', letterSpacing: 1, lineHeight: scaleFont(13) }}>•••</Text>
                </TouchableOpacity>
            )}
        </ThemedCard>
    );
}
